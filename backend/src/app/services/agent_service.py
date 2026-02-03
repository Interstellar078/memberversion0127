
from typing import Dict, Any, Optional, TypedDict, List
import json
import logging
import re
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..config import get_settings

# LangChain Imports
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, END
from pydantic import BaseModel, TypeAdapter, ValidationError
from ..schemas import ItineraryItem
from ..models import AppData, ResourceCity, ResourceHotel, ResourceSpot, ResourceActivity, ResourceTransport, ResourceDocument

logger = logging.getLogger(__name__)

class AgentState(TypedDict):
    req: Any
    hotels: List[Dict[str, Any]]
    spots: List[Dict[str, Any]]
    activities: List[Dict[str, Any]]
    transports: List[Dict[str, Any]]
    documents: List[Dict[str, Any]]
    itinerary: List[Dict[str, Any]]
    error: Optional[str]
    intent: Optional[str]
    needs_more_info: Optional[bool]
    follow_up: Optional[str]
class AssessmentResult(BaseModel):
    need_more_info: bool
    question: str | None = None

class ItineraryEnvelope(BaseModel):
    itinerary: list[ItineraryItem]

class MemorySummary(BaseModel):
    summary: str


class AIAgentService:
    def __init__(self, db: Session, user: Optional[Any] = None):
        self.db = db
        self.user = user
        self.settings = get_settings()
        self.llm = None
        self._configure_llm()
        self._memory_summary = None
        
    def _detect_intent(self, prompt: str, current_rows: list[dict]) -> str:
        if not prompt:
            return 'create'
        keywords = ["优化", "调整", "修改", "变更", "改一下", "完善", "补充", "细化"]
        if any(k in prompt for k in keywords) and current_rows:
            return 'modify'
        return 'create'

    def _assess_requirements(self, req: Any) -> Optional[str]:
        if not self.llm:
            return "AI 未配置，请稍后再试。"
        user_prompt = (req.userPrompt or "").strip()
        context = {
            "currentDestinations": req.currentDestinations or [],
            "currentDays": req.currentDays or 0,
            "currentRowsCount": len(req.currentRows or []),
            "memorySummary": self._memory_summary,
            "chatHistory": (req.chatHistory or [])[-6:],
            "peopleCount": getattr(req, "peopleCount", None),
            "roomCount": getattr(req, "roomCount", None),
            "startDate": getattr(req, "startDate", None),
            "userPrompt": user_prompt,
        }
        system_prompt = f"""你是旅行行程定制助手。请在旅行场景内判断是否可以生成行程。
只输出JSON：{{"need_more_info": true/false, "question": "..."}}。
规则（务必严格）：
- **最多只问1个问题**，且必须是一句话。
- **只有在“目的地缺失”时才提问**，问题只问目的地（城市/国家）。
- 目的地已存在时，**不要再问天数/日期/人数/房间/预算/偏好**，直接生成草案。
- 表单已有信息（目的地/天数/日期/人数/房间）不得重复询问。
- **不要主动询问隐私项**（孩子/年龄/性别/宗教等），除非用户明确提及。
- 若输入为非旅行话题，need_more_info=true，question一句话引导回旅行需求。
- 若信息足够，need_more_info=false，question留空。
当前上下文：{context}"""
        try:
            structured = self.llm.with_structured_output(AssessmentResult)
            result = structured.invoke([SystemMessage(content=system_prompt), HumanMessage(content="请输出JSON")])
            if isinstance(result, AssessmentResult) and result.need_more_info:
                return (result.question or "请告诉我目的地城市或国家。")
            return None
        except Exception:
            try:
                resp = self.llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content="请输出JSON")])
                content = getattr(resp, "content", "").strip()
                if "```" in content:
                    content = content.split("```")[1].strip()
                data = json.loads(content)
                if isinstance(data, dict) and data.get("need_more_info"):
                    return (data.get("question") or "请告诉我目的地城市或国家。")
                return None
            except Exception:
                return "请告诉我目的地城市或国家。"


    def _has_minimum_requirements(self, req: Any) -> bool:
        destinations = req.currentDestinations or []
        has_dest = bool(destinations)
        return has_dest


    def _infer_country(self, destination: str) -> str | None:
        if not destination:
            return None
        dest = destination.split('(')[0].strip()
        if '中国' in dest or dest.lower() == 'china':
            return '中国'
        try:
            row = self.db.execute(
                select(ResourceCity.country).where(ResourceCity.name == dest)
            ).scalar_one_or_none()
            if row:
                return str(row)
        except Exception:
            pass
        return dest if dest else None

    def _recommend_days(self, destination: str) -> int:
        country = self._infer_country(destination) or destination
        if not country:
            return 5
        east_asia = {'日本','韩国','朝鲜','中国台湾','中国香港','中国澳门','新加坡'}
        se_asia = {'泰国','越南','马来西亚','印度尼西亚','印尼','菲律宾','柬埔寨','老挝','缅甸','文莱'}
        europe = {'英国','法国','德国','意大利','西班牙','葡萄牙','瑞士','奥地利','荷兰','比利时','挪威','瑞典','芬兰','丹麦','捷克','希腊','波兰','匈牙利','爱尔兰'}
        americas = {'美国','加拿大','墨西哥','巴西','阿根廷','智利','秘鲁'}
        oceania = {'澳大利亚','新西兰'}
        if country == '中国':
            return 3
        if country in east_asia:
            return 4
        if country in se_asia:
            return 6
        if country in europe or country in americas or country in oceania:
            return 9
        return 5


    def _resolve_city_ids(self, destinations: list[str]) -> list[str]:
        names = []
        for d in destinations or []:
            if not d:
                continue
            names.append(d.split('(')[0].strip())
        if not names:
            return []
        ids: list[str] = []
        for name in names:
            row = self.db.execute(select(ResourceCity.id).where(ResourceCity.name.ilike(f"%{name}%"))).scalar_one_or_none()
            if row:
                ids.append(str(row))
        # de-dup while preserving order
        seen = set()
        unique = []
        for cid in ids:
            if cid in seen:
                continue
            seen.add(cid)
            unique.append(cid)
        return unique


    def _fetch_documents(self, country: str | None, city_ids: list[str]) -> List[Dict[str, Any]]:
        if not country and not city_ids:
            return []
        from sqlalchemy import select as _select, or_, desc
        stmt = _select(ResourceDocument)
        if country:
            stmt = stmt.where(ResourceDocument.country == country)
        if city_ids:
            stmt = stmt.where(or_(ResourceDocument.city_id == None, ResourceDocument.city_id.in_(city_ids)))
        else:
            stmt = stmt.where(ResourceDocument.city_id == None)
        stmt = stmt.order_by(desc(ResourceDocument.uploaded_at)).limit(50)
        rows = self.db.execute(stmt).scalars().all()
        docs: list[dict] = []
        for d in rows:
            content = (d.content_text or d.note or '').strip()
            if content:
                content = content[:500]
            docs.append({
                'id': d.id,
                'category': d.category,
                'country': d.country,
                'city_id': d.city_id,
                'title': d.title,
                'note': d.note,
                'content': content,
                'uploaded_by': d.uploaded_by,
                'uploaded_at': d.uploaded_at.isoformat() if d.uploaded_at else None,
            })
        return docs


    def _extract_days_from_prompt(self, prompt: str | None) -> int | None:
        if not prompt:
            return None
        num_map = {
            '一': 1,
            '二': 2,
            '三': 3,
            '四': 4,
            '五': 5,
            '六': 6,
            '七': 7,
            '八': 8,
            '九': 9,
            '十': 10,
        }
        match = re.search(r"(\d{1,2})\s*(天|日|晚)(行程|行|游|日行)?", prompt)
        if match:
            try:
                days = int(match.group(1))
                if 1 <= days <= 30:
                    return days
            except Exception:
                return None
        match = re.search(r"([一二三四五六七八九十])\s*(天|日|晚)(行程|行|游|日行)?", prompt)
        if match:
            days = num_map.get(match.group(1))
            if days and 1 <= days <= 30:
                return days
        return None


    def _backfill_prices(self, itinerary: list[dict], req: Any) -> list[dict]:
        if not itinerary:
            return itinerary
        people = getattr(req, 'peopleCount', None) or 1
        rooms = getattr(req, 'roomCount', None) or 1

        def normalize_name(name: str) -> str:
            if not name:
                return ''
            name = re.sub(r'[\(（\[【].*?[\)）\]】]', '', name)
            name = re.sub(r'[^0-9a-zA-Z一-鿿]+', '', name).lower()
            return name

        def price_or_none(value):
            if value is None:
                return None
            try:
                val = float(value)
            except Exception:
                return None
            if val <= 0:
                return None
            return val

        hotel_ids = {str(item.get('hotelId')) for item in itinerary if item.get('hotelId')}
        ticket_ids = {str(tid) for item in itinerary for tid in (item.get('ticketIds') or []) if tid}
        activity_ids = {str(aid) for item in itinerary for aid in (item.get('activityIds') or []) if aid}
        transport_ids = {str(tid) for item in itinerary for tid in (item.get('transportIds') or []) if tid}

        def fetch_id_map(model, ids, price_field: str):
            if not ids:
                return {}
            rows = self.db.execute(select(model).where(model.id.in_(list(ids)))).scalars().all()
            return {str(r.id): price_or_none(getattr(r, price_field)) for r in rows}

        hotel_id_map = fetch_id_map(ResourceHotel, hotel_ids, 'price')
        spot_id_map = fetch_id_map(ResourceSpot, ticket_ids, 'price')
        act_id_map = fetch_id_map(ResourceActivity, activity_ids, 'price')
        transport_id_map = fetch_id_map(ResourceTransport, transport_ids, 'price_low')

        def find_by_name(model, name_field: str, price_field: str, name: str):
            if not name:
                return None
            stmt = (
                select(model)
                .where(getattr(model, name_field).ilike(f"%{name}%"))
                .order_by(getattr(model, price_field).asc().nulls_last())
                .limit(1)
            )
            return self.db.execute(stmt).scalars().first()

        def find_transport_by_name(name: str):
            if not name:
                return None
            from sqlalchemy import or_
            stmt = (
                select(ResourceTransport)
                .where(
                    or_(
                        ResourceTransport.service_type.ilike(f"%{name}%"),
                        ResourceTransport.car_model.ilike(f"%{name}%"),
                    )
                )
                .order_by(ResourceTransport.price_low.asc().nulls_last())
                .limit(1)
            )
            return self.db.execute(stmt).scalars().first()

        for item in itinerary:
            # hotel
            if item.get('hotelCost') in (None, 0):
                hotel_id = item.get('hotelId')
                price = hotel_id_map.get(str(hotel_id)) if hotel_id else None
                if price is None and item.get('hotelName'):
                    row = find_by_name(ResourceHotel, 'name', 'price', item.get('hotelName'))
                    if row:
                        item['hotelId'] = str(row.id)
                        price = price_or_none(row.price)
                if price is not None:
                    item['hotelCost'] = price * rooms

            # tickets
            if item.get('ticketCost') in (None, 0):
                total = 0
                ids = [str(tid) for tid in (item.get('ticketIds') or []) if tid]
                for tid in ids:
                    p = spot_id_map.get(tid)
                    if p is not None:
                        total += p
                names = item.get('ticketName') or []
                if names:
                    for name in names:
                        row = find_by_name(ResourceSpot, 'name', 'price', name)
                        if row:
                            rid = str(row.id)
                            if rid not in ids:
                                ids.append(rid)
                            p = price_or_none(row.price)
                            if p is not None:
                                total += p
                if ids:
                    item['ticketIds'] = ids
                if total > 0:
                    item['ticketCost'] = total * people

            # activities
            if item.get('activityCost') in (None, 0):
                total = 0
                ids = [str(aid) for aid in (item.get('activityIds') or []) if aid]
                for aid in ids:
                    p = act_id_map.get(aid)
                    if p is not None:
                        total += p
                names = item.get('activityName') or []
                if names:
                    for name in names:
                        row = find_by_name(ResourceActivity, 'name', 'price', name)
                        if row:
                            rid = str(row.id)
                            if rid not in ids:
                                ids.append(rid)
                            p = price_or_none(row.price)
                            if p is not None:
                                total += p
                if ids:
                    item['activityIds'] = ids
                if total > 0:
                    item['activityCost'] = total * people

            # transport
            if item.get('transportCost') in (None, 0):
                total = 0
                ids = [str(tid) for tid in (item.get('transportIds') or []) if tid]
                for tid in ids:
                    p = transport_id_map.get(tid)
                    if p is not None:
                        total += p
                names = item.get('transport') or []
                if names:
                    for name in names:
                        row = find_transport_by_name(name)
                        if row:
                            rid = str(row.id)
                            if rid not in ids:
                                ids.append(rid)
                            p = price_or_none(row.price_low)
                            if p is not None:
                                total += p
                if ids:
                    item['transportIds'] = ids
                if total > 0:
                    item['transportCost'] = total
        return itinerary

    def _memory_owner_id(self, conversation_id: str | None) -> str | None:
        if self.user and self.user.username:
            return self.user.username
        if conversation_id:
            return f"anon:{conversation_id}"
        return None

    def _memory_key(self, conversation_id: str | None) -> str:
        return f"ai_memory:{conversation_id or 'default'}"

    def _load_memory(self, conversation_id: str | None) -> str | None:
        owner_id = self._memory_owner_id(conversation_id)
        if not owner_id:
            return None
        key = self._memory_key(conversation_id)
        row = self.db.execute(select(AppData).where(AppData.owner_id == owner_id, AppData.key == key)).scalar_one_or_none()
        if row and isinstance(row.value, dict):
            return row.value.get('summary')
        return None

    def _save_memory(self, conversation_id: str | None, summary: str) -> None:
        owner_id = self._memory_owner_id(conversation_id)
        if not owner_id:
            return
        key = self._memory_key(conversation_id)
        row = self.db.execute(select(AppData).where(AppData.owner_id == owner_id, AppData.key == key)).scalar_one_or_none()
        if row:
            row.value = {"summary": summary}
        else:
            self.db.add(AppData(owner_id=owner_id, key=key, value={"summary": summary}, is_public=False))
        self.db.commit()

    def _summarize_memory(self, existing: str | None, req: Any) -> str | None:
        if not self.llm:
            return existing
        history = req.chatHistory or []
        tail = history[-8:]
        prompt = f"""你是旅行顾问，请将对话信息压缩成不超过80字的“已知旅行需求摘要”。
包含目的地、天数、出行人群/人数、偏好与限制（若有）。
已知摘要：{existing or '无'}
最近对话：{tail}
仅输出JSON：{{"summary":"..."}}。"""
        try:
            structured = self.llm.with_structured_output(MemorySummary)
            res = structured.invoke([SystemMessage(content=prompt), HumanMessage(content="请输出JSON")])
            if isinstance(res, MemorySummary):
                return res.summary
        except Exception:
            pass
        return existing

    def _normalize_itinerary(self, items: list[dict]) -> list[dict]:
        normalized: list[dict] = []
        prev_end = None
        for idx, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                continue
            out = dict(item)
            day = out.get('day') or idx
            out['day'] = day
            route = out.get('route')
            s_city = out.get('s_city') or out.get('sCity')
            e_city = out.get('e_city') or out.get('eCity')
            if route and not (s_city and e_city):
                parts = re.split(r"[-—>，,]", route)
                parts = [p.strip() for p in parts if p.strip()]
                if len(parts) >= 2:
                    s_city = s_city or parts[0]
                    e_city = e_city or parts[-1]
            if not s_city and prev_end:
                s_city = prev_end
            elif prev_end and s_city and s_city != prev_end:
                # keep continuity unless user explicitly sets route start
                s_city = prev_end
            if s_city and e_city and not route:
                route = f"{s_city}-{e_city}"
            elif route and s_city and e_city:
                route = f"{s_city}-{e_city}"
            if s_city:
                out['s_city'] = s_city
            if e_city:
                out['e_city'] = e_city
            if route:
                out['route'] = route
            prev_end = e_city or s_city or prev_end

            # normalize list fields
            for key in ['ticketName', 'activityName']:
                val = out.get(key)
                if isinstance(val, str):
                    out[key] = [v.strip() for v in re.split(r"[,，、]", val) if v.strip()]
                elif val is None:
                    out[key] = []
            if out.get('transport') is None:
                out['transport'] = []
            normalized.append(out)
        return normalized

    def _configure_llm(self):
        provider = self.settings.llm_provider.lower()
        logger.info(f"Configuring LLM. Provider: {provider}")
        
        if provider == "gemini":
            if self.settings.gemini_api_key:
                logger.info("Initializing Gemini Chat Model")
                self.llm = ChatGoogleGenerativeAI(
                    model=self.settings.gemini_model_name,
                    google_api_key=self.settings.gemini_api_key,
                    convert_system_message_to_human=True, # Helper for Gemini quirks
                    temperature=0.7
                )
            else:
                 logger.error("Gemini API Key missing in settings")
                 
        elif provider == "openai":
            if self.settings.openai_api_key:
                logger.info(f"Initializing OpenAI Chat Model: {self.settings.openai_model_name}")
                self.llm = ChatOpenAI(
                    model=self.settings.openai_model_name or "gpt-3.5-turbo",
                    api_key=self.settings.openai_api_key,
                    base_url=self.settings.openai_base_url,
                    temperature=0.7
                )
            else:
                 logger.error("OpenAI API Key missing in settings")
        
        if not self.llm:
            logger.error(f"Failed to configure LLM. self.llm is None. Settings: provider={provider}, openai_key_set={bool(self.settings.openai_api_key)}")

    def search_hotels(self, city_name: str, price_max: Optional[int] = None) -> str:
        return self._search_hotels_tool(city_name, price_max)

    def search_spots(self, city_name: str) -> str:
        return self._search_spots_tool(city_name)
    
    # --- Defined Tools ---
    # We define tools dynamically to bind self.db implicitly or pass db explicitly
    # But @tool decorator works best on static functions or we use StructuredTool.from_function.
    # To access 'self', we'll define methods and wrap them.

    def _fetch_hotels(self, city_name: str, price_max: Optional[int] = None) -> List[Dict[str, Any]]:
        """Search for hotels in the database by city name."""
        from sqlalchemy import select, or_
        from ..models import ResourceHotel, ResourceCity

        user = self.user
        access_filter = ResourceHotel.is_public == True
        if user:
            access_filter = or_(ResourceHotel.is_public == True, ResourceHotel.owner_id == user.username)

        # Join Hotel -> City on city_id = id
        stmt = (
            select(ResourceHotel)
            .join(ResourceCity, ResourceHotel.city_id == ResourceCity.id)
            .where(
                ResourceCity.name.ilike(f"%{city_name}%"),
                access_filter,
            )
            .order_by(ResourceHotel.price.asc().nulls_last())
        )
        results = self.db.execute(stmt).scalars().all()

        filtered = []
        for h in results:
            if user is None:
                price = None
            else:
                price = h.price or 0
                if price_max and price > price_max:
                    continue
            filtered.append(
                {
                    "id": h.id,
                    "name": h.name,
                    "price": price,
                    "room_type": h.room_type or "N/A",
                }
            )

        return filtered[:5]

    def _fetch_spots(self, city_name: str) -> List[Dict[str, Any]]:
        """Search for scenic spots/attractions in the database by city name."""
        from sqlalchemy import select, or_
        from ..models import ResourceSpot, ResourceCity

        user = self.user
        access_filter = ResourceSpot.is_public == True
        if user:
            access_filter = or_(ResourceSpot.is_public == True, ResourceSpot.owner_id == user.username)

        stmt = (
            select(ResourceSpot)
            .join(ResourceCity, ResourceSpot.city_id == ResourceCity.id)
            .where(
                ResourceCity.name.ilike(f"%{city_name}%"),
                access_filter,
            )
            .order_by(ResourceSpot.price.asc().nulls_last())
        )
        results = self.db.execute(stmt).scalars().all()

        if user is None:
            return [{"id": s.id, "name": s.name, "price": None} for s in results][:8]

        # Model for Spot: id, city_id, name, price, owner_id, is_public.
        return [{"id": s.id, "name": s.name, "price": s.price or 0} for s in results][:8]


    def _fetch_activities(self, city_name: str) -> List[Dict[str, Any]]:
        """Search for activities in the database by city name."""
        from sqlalchemy import select, or_
        from ..models import ResourceActivity, ResourceCity

        user = self.user
        access_filter = ResourceActivity.is_public == True
        if user:
            access_filter = or_(ResourceActivity.is_public == True, ResourceActivity.owner_id == user.username)

        stmt = (
            select(ResourceActivity)
            .join(ResourceCity, ResourceActivity.city_id == ResourceCity.id)
            .where(
                ResourceCity.name.ilike(f"%{city_name}%"),
                access_filter,
            )
            .order_by(ResourceActivity.price.asc().nulls_last())
        )
        results = self.db.execute(stmt).scalars().all()

        if user is None:
            return [{"id": a.id, "name": a.name, "price": None} for a in results][:8]

        return [{"id": a.id, "name": a.name, "price": a.price or 0} for a in results][:8]

    def _fetch_transports(self, region: str, passengers: Optional[int] = None) -> List[Dict[str, Any]]:
        """Search for transports by region (country) and optional passenger count."""
        from sqlalchemy import select, or_
        from ..models import ResourceTransport

        user = self.user
        access_filter = ResourceTransport.is_public == True
        if user:
            access_filter = or_(ResourceTransport.is_public == True, ResourceTransport.owner_id == user.username)

        stmt = (
            select(ResourceTransport)
            .where(
                ResourceTransport.region.ilike(f"%{region}%"),
                access_filter,
            )
            .order_by(ResourceTransport.price_low.asc().nulls_last())
        )
        if passengers:
            stmt = stmt.where(ResourceTransport.passengers >= int(passengers))
        results = self.db.execute(stmt).scalars().all()

        if user is None:
            return [
                {
                    "id": t.id,
                    "service_type": t.service_type,
                    "car_model": t.car_model,
                    "passengers": t.passengers,
                    "price_low": None,
                    "price_high": None,
                }
                for t in results
            ][:8]

        return [
            {
                "id": t.id,
                "service_type": t.service_type,
                "car_model": t.car_model,
                "passengers": t.passengers,
                "price_low": t.price_low or 0,
                "price_high": t.price_high or 0,
            }
            for t in results
        ][:8]

    def _search_hotels_tool(self, city_name: str, price_max: Optional[int] = None) -> str:
        hotels = self._fetch_hotels(city_name, price_max)
        return json.dumps(hotels, ensure_ascii=False) if hotels else f"No hotels found in {city_name}."

    def _search_spots_tool(self, city_name: str) -> str:
        spots = self._fetch_spots(city_name)
        return json.dumps(spots, ensure_ascii=False) if spots else f"No spots found in {city_name}."

    def _search_activities_tool(self, city_name: str) -> str:
        activities = self._fetch_activities(city_name)
        return json.dumps(activities, ensure_ascii=False) if activities else f"No activities found in {city_name}."

    def _search_transports_tool(self, region: str, passengers: Optional[int] = None) -> str:
        transports = self._fetch_transports(region, passengers)
        return json.dumps(transports, ensure_ascii=False) if transports else f"No transports found in {region}."

    def _search_documents_tool(self, country: str, city_names: Optional[List[str]] = None) -> str:
        city_ids = self._resolve_city_ids(city_names or [])
        docs = self._fetch_documents(country, city_ids)
        return json.dumps(docs, ensure_ascii=False) if docs else f"No documents found for {country}."

    def _run_tool_agent(self, system_prompt: str, user_prompt: Optional[str], tools: list, max_iters: int = 4) -> str:
        if not self.llm or not hasattr(self.llm, 'bind_tools'):
            return ''
        bound = self.llm.bind_tools(tools)
        messages = [SystemMessage(content=system_prompt)]
        messages.append(HumanMessage(content=user_prompt or '请生成行程'))
        tool_map = {t.name: t for t in tools}
        for _ in range(max_iters):
            ai_msg = bound.invoke(messages)
            messages.append(ai_msg)
            tool_calls = getattr(ai_msg, 'tool_calls', None) or []
            if not tool_calls:
                return getattr(ai_msg, 'content', '') or ''
            for call in tool_calls:
                name = call.get('name')
                args = call.get('args') or {}
                tool = tool_map.get(name)
                try:
                    if tool is None:
                        result = json.dumps({'error': f'Unknown tool: {name}'}, ensure_ascii=False)
                    else:
                        result = tool.invoke(args) if hasattr(tool, 'invoke') else tool(**args)
                except Exception as exc:
                    result = json.dumps({'error': str(exc)}, ensure_ascii=False)
                messages.append(ToolMessage(content=str(result), tool_call_id=call.get('id')))
        return getattr(messages[-1], 'content', '') or ''

    def generate_itinerary_with_react(self, req: Any) -> Dict[str, Any]:
        if not self.llm:
            return {"error": "LLM not configured (LangChain)"}

        city = req.currentDestinations[0] if req.currentDestinations else "Unknown"
        user_days = self._extract_days_from_prompt(getattr(req, "userPrompt", None))
        days = user_days or req.currentDays or self._recommend_days(city)
        conversation_id = getattr(req, "conversationId", None)
        memory_summary = self._load_memory(conversation_id)
        self._memory_summary = memory_summary
        logger.info(
            "AI start: user=%s conv=%s city=%s days=%s prompt_len=%s memory_len=%s",
            getattr(self.user, "username", None),
            conversation_id,
            city,
            days,
            len(getattr(req, "userPrompt", None) or ""),
            len(memory_summary or ""),
        )

        def assess_requirements(state: AgentState) -> AgentState:
            question = self._assess_requirements(req)
            if question:
                if self._has_minimum_requirements(req):
                    logger.info("AI draft_with_followup: %s", question)
                    return {**state, "follow_up": question, "needs_more_info": False}
                logger.info("AI needs_more_info: %s", question)
                return {**state, "error": question, "needs_more_info": True}
            if self._has_minimum_requirements(req) and not req.currentDays:
                dest = (req.currentDestinations or [''])[0]
                rec_days = self._recommend_days(dest)
                follow = f"我先按{rec_days}天给你出一版行程草案，可以吗？如需调整天数/节奏请告诉我。"
                logger.info("AI draft_default_days: %s", rec_days)
                return {**state, "follow_up": follow, "needs_more_info": False}
            return {**state, "needs_more_info": False}

        def detect_intent(state: AgentState) -> AgentState:
            if state.get("error") or state.get("needs_more_info"):
                return state
            intent = self._detect_intent(req.userPrompt or "", req.currentRows or [])
            logger.info("AI intent: %s", intent)
            return {**state, "intent": intent}


        def retrieve_context(state: AgentState) -> AgentState:
            if state.get("error") or state.get("needs_more_info"):
                return state
            destinations = req.currentDestinations or []
            primary_city = destinations[0] if destinations else ""
            country = self._infer_country(primary_city) or primary_city
            city_ids = self._resolve_city_ids(destinations)
            hotels = self._fetch_hotels(primary_city) if primary_city else []
            spots = self._fetch_spots(primary_city) if primary_city else []
            activities = self._fetch_activities(primary_city) if primary_city else []
            transports = self._fetch_transports(country, getattr(req, "peopleCount", None)) if country else []
            documents = self._fetch_documents(country, city_ids)
            logger.info(
                "AI retrieved: hotels=%s spots=%s activities=%s transports=%s documents=%s",
                len(hotels),
                len(spots),
                len(activities),
                len(transports),
                len(documents),
            )
            return {
                **state,
                "hotels": hotels,
                "spots": spots,
                "activities": activities,
                "transports": transports,
                "documents": documents,
            }

        @tool
        def search_hotels(city: str, price_max: int | None = None) -> str:
            """Search hotels by city, returning id/name/price."""
            return self._search_hotels_tool(city, price_max)

        @tool
        def search_spots(city: str) -> str:
            """Search scenic spots by city, returning id/name/price."""
            return self._search_spots_tool(city)

        @tool
        def search_activities(city: str) -> str:
            """Search activities by city, returning id/name/price."""
            return self._search_activities_tool(city)

        @tool
        def search_transports(region: str, passengers: int | None = None) -> str:
            """Search transports by region (country) and passengers."""
            return self._search_transports_tool(region, passengers)

        @tool
        def search_documents(country: str, city_names: list[str] | None = None) -> str:
            """Search uploaded partner documents by country/cities."""
            return self._search_documents_tool(country, city_names)

        def generate_plan(state: AgentState) -> AgentState:
            if state.get("error") or state.get("needs_more_info"):
                return state
            intent = state.get("intent") or "create"
            current_rows_json = ""
            if intent == "modify" and req.currentRows:
                current_rows_json = json.dumps(req.currentRows, ensure_ascii=False)

            form_context = {
                "destinations": req.currentDestinations or [],
                "currentDays": req.currentDays or None,
                "startDate": getattr(req, "startDate", None),
                "peopleCount": getattr(req, "peopleCount", None),
                "roomCount": getattr(req, "roomCount", None),
                "memorySummary": memory_summary,
            }

            retrieved_context = {
                "hotels": state.get("hotels", []),
                "spots": state.get("spots", []),
                "activities": state.get("activities", []),
                "transports": state.get("transports", []),
                "documents": state.get("documents", []),
            }

            system_prompt = f"""你是专业行程规划师，输出**仅JSON**且为简体中文。
目标：生成 {city} 的 {days} 天行程（意图：{intent}）。
输入信息：{form_context}
用户原话：{req.userPrompt or ''}
规则：
1) **以用户输入为准**：若用户在对话中明确天数/目的地，优先使用用户给出的参数，即使与表单不一致。
2) 国内以城市为目的地；国外以国家为目的地。境外默认往返中国（用户未提供出发/返程时）。
3) 先给出可执行草案，后续再按用户反馈调整；避免连环追问。
4) 不询问隐私项（孩子/年龄/性别/宗教等），除非用户主动提及。
5) 生成**单一最佳方案**，不要A/B或多套方案。
6) 请先使用工具检索资源（酒店/景点/活动/交通/文档），**文档优先级最高**；若文档与资源库冲突，以文档为准。
已检索资源（优先使用）：{json.dumps(retrieved_context, ensure_ascii=False)}
7) 输出结构必须是：{{"itinerary": [ItineraryItem...]}}。
8) 请为酒店/门票/活动/交通写入对应ID字段（hotelId/ticketIds/activityIds/transportIds），名称必须与工具返回一致。
9) 若用户未提供预算，成本字段可为null或0，不要虚构价格（后端会回填）。
{("已有行程JSON（需在此基础上优化）:" + current_rows_json) if current_rows_json else ""}
"""

            tools = [search_hotels, search_spots, search_activities, search_transports, search_documents]
            output_str = self._run_tool_agent(system_prompt, req.userPrompt, tools, max_iters=4)
            if not output_str:
                # Fallback: minimal static context if tool-calling unsupported
                fallback_prompt = system_prompt + f"\n已检索资源（优先使用）：{json.dumps(retrieved_context, ensure_ascii=False)}\n"
                response = self.llm.invoke([SystemMessage(content=fallback_prompt), HumanMessage(content=req.userPrompt or '请生成行程')])
                output_str = getattr(response, 'content', '')

            clean_json = (output_str or '').strip()
            if "```json" in clean_json:
                clean_json = clean_json.split("```json")[1].split("```")[0].strip()
            elif "```" in clean_json:
                clean_json = clean_json.split("```")[1].strip()

            try:
                data = json.loads(clean_json)
                itinerary = data.get("itinerary", []) if isinstance(data, dict) else data
                return {**state, "itinerary": itinerary, "error": None}
            except Exception:
                logger.error("Failed to parse AI output JSON: %s", output_str)
                return {**state, "error": "Failed to parse JSON from AI", "itinerary": []}

        def validate_plan(state: AgentState) -> AgentState:
            if state.get("error"):
                return state
            try:
                normalized = self._normalize_itinerary(state.get("itinerary", []))
                normalized = self._backfill_prices(normalized, req)
                adapter = TypeAdapter(List[ItineraryItem])
                validated = adapter.validate_python(normalized)
                logger.info("AI validate: days=%s", len(validated))
                return {**state, "itinerary": [item.model_dump() for item in validated]}
            except ValidationError:
                return {**state, "error": "Validation failed", "itinerary": []}

        graph = StateGraph(AgentState)
        graph.add_node("assess_requirements", assess_requirements)
        graph.add_node("detect_intent", detect_intent)
        graph.add_node("retrieve_context", retrieve_context)
        graph.add_node("generate_plan", generate_plan)
        graph.add_node("validate_plan", validate_plan)
        graph.set_entry_point("assess_requirements")
        def route_after_assess(state: AgentState) -> str:
            return END if state.get("needs_more_info") else "detect_intent"
        graph.add_conditional_edges("assess_requirements", route_after_assess)
        graph.add_edge("detect_intent", "retrieve_context")
        graph.add_edge("retrieve_context", "generate_plan")
        graph.add_edge("generate_plan", "validate_plan")
        graph.add_edge("validate_plan", END)
        app = graph.compile()

        initial_state: AgentState = {
            "req": req,
            "hotels": [],
            "spots": [],
            "activities": [],
            "transports": [],
            "documents": [],
            "itinerary": [],
            "error": None,
            "intent": None,
            "needs_more_info": False,
            "follow_up": None,
        }
        result = app.invoke(initial_state)
        final_error = result.get("error")
        logger.info("AI done: error=%s days=%s", final_error, len(result.get("itinerary", []) or []))
        if conversation_id:
            new_summary = self._summarize_memory(memory_summary, req)
            if new_summary:
                self._save_memory(conversation_id, new_summary)
        return {
            "itinerary": result.get("itinerary", []),
            "error": final_error,
            "follow_up": result.get("follow_up"),
        }
