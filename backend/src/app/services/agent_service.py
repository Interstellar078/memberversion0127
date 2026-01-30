
from typing import Dict, Any, Optional, TypedDict, List
import json
import logging
import re
from sqlalchemy.orm import Session
from ..config import get_settings

# LangChain Imports
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, END
from pydantic import BaseModel, TypeAdapter, ValidationError
from ..schemas import ItineraryItem

logger = logging.getLogger(__name__)

class AgentState(TypedDict):
    req: Any
    hotels: List[Dict[str, Any]]
    spots: List[Dict[str, Any]]
    itinerary: List[Dict[str, Any]]
    error: Optional[str]
    intent: Optional[str]
    needs_more_info: Optional[bool]
class AssessmentResult(BaseModel):
    need_more_info: bool
    question: str | None = None

class ItineraryEnvelope(BaseModel):
    itinerary: list[ItineraryItem]


class AIAgentService:
    def __init__(self, db: Session, user: Optional[Any] = None):
        self.db = db
        self.user = user
        self.settings = get_settings()
        self.llm = None
        self._configure_llm()
        
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
            "peopleCount": getattr(req, "peopleCount", None),
            "roomCount": getattr(req, "roomCount", None),
            "startDate": getattr(req, "startDate", None),
            "userPrompt": user_prompt,
        }
        system_prompt = f"""你是旅行行程定制助手。请在旅行场景内判断是否可以生成行程。
只输出JSON：{{"need_more_info": true/false, "question": "..."}}。
规则：
- 若缺少生成所需关键信息，need_more_info=true，并只追问最少必要问题。
- 若输入为非旅行话题，need_more_info=true，question简短引导回旅行需求。
- 若信息足够，need_more_info=false，question留空。
当前上下文：{context}"""
        try:
            structured = self.llm.with_structured_output(AssessmentResult)
            result = structured.invoke([SystemMessage(content=system_prompt), HumanMessage(content="请输出JSON")])
            if isinstance(result, AssessmentResult) and result.need_more_info:
                return (result.question or "请补充目的地、天数、人数/房间数及偏好。")
            return None
        except Exception:
            try:
                resp = self.llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content="请输出JSON")])
                content = getattr(resp, "content", "").strip()
                if "```" in content:
                    content = content.split("```")[1].strip()
                data = json.loads(content)
                if isinstance(data, dict) and data.get("need_more_info"):
                    return (data.get("question") or "请补充目的地、天数、人数/房间数及偏好。")
                return None
            except Exception:
                return "请补充目的地、天数、人数/房间数及偏好（如人文/自然/美食等）。"

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
            return [{"name": s.name, "price": None} for s in results][:8]

        # Model for Spot: id, city_id, name, price, owner_id, is_public.
        return [{"name": s.name, "price": s.price or 0} for s in results][:8]

    def _search_hotels_tool(self, city_name: str, price_max: Optional[int] = None) -> str:
        hotels = self._fetch_hotels(city_name, price_max)
        return json.dumps(hotels, ensure_ascii=False) if hotels else f"No hotels found in {city_name}."

    def _search_spots_tool(self, city_name: str) -> str:
        spots = self._fetch_spots(city_name)
        return json.dumps(spots, ensure_ascii=False) if spots else f"No spots found in {city_name}."

    def generate_itinerary_with_react(self, req: Any) -> Dict[str, Any]:
        if not self.llm:
            return {"error": "LLM not configured (LangChain)"}

        city = req.currentDestinations[0] if req.currentDestinations else "Unknown"
        days = req.currentDays
        available_countries = ", ".join(req.availableCountries or [])

        def assess_requirements(state: AgentState) -> AgentState:
            question = self._assess_requirements(req)
            if question:
                return {**state, "error": question, "needs_more_info": True}
            return {**state, "needs_more_info": False}

        def detect_intent(state: AgentState) -> AgentState:
            if state.get("error") or state.get("needs_more_info"):
                return state
            intent = self._detect_intent(req.userPrompt or "", req.currentRows or [])
            return {**state, "intent": intent}

        def fetch_resources(state: AgentState) -> AgentState:
            if state.get("error") or state.get("needs_more_info"):
                return state
            hotels = self._fetch_hotels(city)
            spots = self._fetch_spots(city)
            return {**state, "hotels": hotels, "spots": spots}

        def generate_plan(state: AgentState) -> AgentState:
            if state.get("error") or state.get("needs_more_info"):
                return state
            hotels_json = json.dumps(state["hotels"], ensure_ascii=False)
            spots_json = json.dumps(state["spots"], ensure_ascii=False)
            intent = state.get("intent") or "create"
            current_rows_json = ""
            if intent == "modify" and req.currentRows:
                current_rows_json = json.dumps(req.currentRows, ensure_ascii=False)
            system_prompt = f"""你是专业行程规划师，输出**仅JSON**且为简体中文。
目标：生成 {city} 的 {days} 天行程（意图：{intent}）。
若提供可用国家列表，请优先在其范围内规划：{available_countries or "未提供"}。
优化目标：行程节奏合理、交通便捷舒适、住宿匹配人数、关注文化/宗教/饮食/体力/季节。
{"已有行程（JSON，需在此基础上优化）:" + current_rows_json if current_rows_json else ""}
可用酒店资源：{hotels_json}
可用景点资源：{spots_json}
输出结构必须是：{{"itinerary": [ItineraryItem...]}}。
Context: "{req.userPrompt}"
"""
            try:
                planner = self.llm.with_structured_output(ItineraryEnvelope)
                response = planner.invoke(
                    [
                        SystemMessage(content=system_prompt),
                        HumanMessage(content="Please generate the itinerary JSON.")
                    ]
                )
                if isinstance(response, ItineraryEnvelope):
                    return {**state, "itinerary": [item.model_dump() for item in response.itinerary], "error": None}
                output_str = getattr(response, "content", "")
            except Exception as exc:
                try:
                    response = self.llm.invoke(
                        [
                            SystemMessage(content=system_prompt),
                            HumanMessage(content="Please generate the itinerary JSON.")
                        ]
                    )
                    output_str = getattr(response, "content", "")
                except Exception as fallback_exc:
                    return {**state, "error": str(fallback_exc), "itinerary": []}

            clean_json = output_str.strip()
            if "```json" in clean_json:
                clean_json = clean_json.split("```json")[1].split("```")[0].strip()
            elif "```" in clean_json:
                clean_json = clean_json.split("```")[1].strip()

            try:
                data = json.loads(clean_json)
                itinerary = data.get("itinerary", []) if isinstance(data, dict) else data
                return {**state, "itinerary": itinerary, "error": None}
            except json.JSONDecodeError:
                logger.error(f"Failed to parse AI output JSON: {output_str}")
                return {**state, "error": "Failed to parse JSON from AI", "itinerary": []}

        def validate_plan(state: AgentState) -> AgentState:
            if state.get("error"):
                return state
            try:
                normalized = self._normalize_itinerary(state.get("itinerary", []))
                adapter = TypeAdapter(List[ItineraryItem])
                validated = adapter.validate_python(normalized)
                return {**state, "itinerary": [item.model_dump() for item in validated]}
            except ValidationError:
                return {**state, "error": "Validation failed", "itinerary": []}

        graph = StateGraph(AgentState)
        graph.add_node("assess_requirements", assess_requirements)
        graph.add_node("detect_intent", detect_intent)
        graph.add_node("fetch_resources", fetch_resources)
        graph.add_node("generate_plan", generate_plan)
        graph.add_node("validate_plan", validate_plan)
        graph.set_entry_point("assess_requirements")
        def route_after_assess(state: AgentState) -> str:
            return END if state.get("needs_more_info") else "detect_intent"
        graph.add_conditional_edges("assess_requirements", route_after_assess)
        graph.add_edge("detect_intent", "fetch_resources")
        graph.add_edge("fetch_resources", "generate_plan")
        graph.add_edge("generate_plan", "validate_plan")
        graph.add_edge("validate_plan", END)
        app = graph.compile()

        initial_state: AgentState = {
            "req": req,
            "hotels": [],
            "spots": [],
            "itinerary": [],
            "error": None,
            "intent": None,
            "needs_more_info": False,
        }
        result = app.invoke(initial_state)
        final_error = result.get("error")
        return {
            "itinerary": result.get("itinerary", []),
            "error": final_error,
        }
