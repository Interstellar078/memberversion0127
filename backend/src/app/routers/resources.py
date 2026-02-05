from datetime import datetime
from typing import List, Optional, Type
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy import select, or_, func, desc
from fastapi.responses import FileResponse
from pathlib import Path
import shutil
from sqlalchemy.orm import Session
import uuid

from ..deps import get_db, get_current_user, get_current_user_optional
from ..config import get_settings
from ..models import (
    User, ResourceCountry, ResourceCity, ResourceSpot, ResourceHotel, 
    ResourceActivity, ResourceTransport, ResourceDocument, ResourceRestaurant
)
from ..schemas_resources import (
    CountryOut, CountryCreate, CountryUpdate,
    CityOut, CityCreate, CityUpdate,
    SpotOut, SpotCreate, SpotUpdate,
    HotelOut, HotelCreate, HotelUpdate,
    ActivityOut, ActivityCreate, ActivityUpdate,
    TransportOut, TransportCreate, TransportUpdate,
    RestaurantOut, RestaurantCreate, RestaurantUpdate,
    DocumentOut
)

router = APIRouter(prefix="/api/resources", tags=["resources"])

settings = get_settings()
UPLOAD_DIR = Path(settings.upload_dir)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
ALLOWED_EXTENSIONS = {
    ".pdf", ".txt", ".md", ".csv",
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".jpg", ".jpeg", ".png", ".webp",
}
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "image/jpeg",
    "image/png",
    "image/webp",
}
MIME_BY_EXT = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def _validate_magic(ext: str, header: bytes) -> bool:
    if not header:
        return False
    if ext == ".pdf":
        return header.startswith(b"%PDF-")
    if ext in {".jpg", ".jpeg"}:
        return header.startswith(b"\xFF\xD8\xFF")
    if ext == ".png":
        return header.startswith(b"\x89PNG\r\n\x1a\n")
    if ext == ".webp":
        return len(header) >= 12 and header.startswith(b"RIFF") and header[8:12] == b"WEBP"
    if ext in {".docx", ".xlsx", ".pptx"}:
        return header.startswith(b"PK\x03\x04")
    if ext in {".doc", ".xls", ".ppt"}:
        return header.startswith(b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1")
    return True

# --- Helper for Pagination ---
def paginate_query(query, page: int, size: int):
    return query.offset((page - 1) * size).limit(size)

def apply_scope_filter(query, model, user: User | None, scope: str = "all"):
    if not user:
        if scope == "private":
            return query.where(False)
        return query.where(model.is_public == True)
    if scope == "private":
        return query.where(model.owner_id == user.username)
    if scope == "public":
        return query.where(model.is_public == True)
    return query.where(or_(model.owner_id == user.username, model.is_public == True))


def mask_prices_for_guest(items):
    for item in items:
        if isinstance(item, (ResourceSpot, ResourceHotel, ResourceActivity)):
            item.price = None
        elif isinstance(item, ResourceTransport):
            item.price_low = None
            item.price_high = None

def require_admin_or_super(user: User) -> User:
    if user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_super_admin(user: User) -> User:
    if user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return user

# --- Countries ---


@router.get("/countries", response_model=List[CountryOut])
def list_countries(
    search: Optional[str] = None,
    scope: str = "all",
    page: int = 1,
    size: int = 100,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional)
):
    query = select(ResourceCountry)
    query = apply_scope_filter(query, ResourceCountry, current_user, scope)
    if search: query = query.where(ResourceCountry.name.ilike(f"%{search}%"))
    query = query.order_by(ResourceCountry.name)
    items = db.scalars(paginate_query(query, page, size)).all()
    if current_user is None:
        mask_prices_for_guest(items)
    return items

@router.post("/countries", response_model=CountryOut)
def create_country(payload: CountryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    final_is_public = payload.is_public and current_user.role == 'admin'
    owner = 'system' if final_is_public else current_user.username
    obj = ResourceCountry(
        id=payload.id or str(uuid.uuid4()),
        name=payload.name,
        owner_id=owner,
        is_public=final_is_public
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@router.put("/countries/{id}", response_model=CountryOut)
def update_country(id: str, payload: CountryUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = db.get(ResourceCountry, id)
    if not obj: raise HTTPException(404, "Not found")
    if obj.owner_id != current_user.username and not (obj.is_public and current_user.role == 'admin'): raise HTTPException(403)
    
    if payload.name is not None: obj.name = payload.name
    if payload.is_public is not None:
        if current_user.role != 'admin': raise HTTPException(403)
        obj.is_public = payload.is_public
        obj.owner_id = 'system' if payload.is_public else current_user.username
    db.commit()
    db.refresh(obj)
    return obj

@router.delete("/countries/{id}")
def delete_country(id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = db.get(ResourceCountry, id)
    if not obj: return {"success": True}
    if obj.owner_id != current_user.username and not (obj.is_public and current_user.role == 'admin'): raise HTTPException(403)
    
    db.delete(obj)
    db.commit()
    return {"success": True}


# --- Cities ---
@router.get("/cities", response_model=List[CityOut])
def list_cities(
    country: Optional[str] = None,
    search: Optional[str] = None,
    scope: str = "all",
    page: int = 1,
    size: int = 100,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional)
):
    query = select(ResourceCity)
    query = apply_scope_filter(query, ResourceCity, current_user, scope)
    
    if country:
        query = query.where(ResourceCity.country == country)
    if search:
        query = query.where(ResourceCity.name.ilike(f"%{search}%"))
        
    query = query.order_by(ResourceCity.country, ResourceCity.name)
    query = paginate_query(query, page, size)
    items = db.scalars(query).all()
    if current_user is None:
        mask_prices_for_guest(items)
    return items

@router.post("/cities", response_model=CityOut)
def create_city(
    payload: CityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Public check
    final_is_public = payload.is_public and current_user.role == 'admin'
    owner = 'system' if final_is_public else current_user.username
    
    obj = ResourceCity(
        id=payload.id or str(uuid.uuid4()),
        country=payload.country,
        name=payload.name,
        owner_id=owner,
        is_public=final_is_public
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@router.put("/cities/{id}", response_model=CityOut)
def update_city(id: str, payload: CityUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = db.get(ResourceCity, id)
    if not obj: raise HTTPException(404, "Not found")
    if obj.owner_id != current_user.username and not (obj.is_public and current_user.role == 'admin'): raise HTTPException(403)
    if payload.name is not None: obj.name = payload.name
    if payload.is_public is not None:
        if current_user.role != 'admin': raise HTTPException(403)
        obj.is_public = payload.is_public
        obj.owner_id = 'system' if payload.is_public else current_user.username
    db.commit()
    db.refresh(obj)
    return obj

@router.delete("/cities/{id}")
def delete_city(id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = db.get(ResourceCity, id)
    if not obj: return {"success": True}
    
    # Permission Check
    if obj.owner_id != current_user.username:
        if not (obj.is_public and current_user.role == 'admin'):
            raise HTTPException(403, "Not authorized")
            
    db.delete(obj)
    db.commit()
    return {"success": True}


# --- Spots ---
@router.get("/spots", response_model=List[SpotOut])
def list_spots(
    city_id: Optional[str] = None,
    city_name: Optional[List[str]] = Query(None), # Support filtering by city name(s)
    search: Optional[str] = None,
    scope: str = "all",
    page: int = 1,
    size: int = 100,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional)
):
    query = select(ResourceSpot)
    query = apply_scope_filter(query, ResourceSpot, current_user, scope)
    
    if city_id:
        query = query.where(ResourceSpot.city_id == city_id)
    if city_name:
        query = query.join(ResourceCity).where(ResourceCity.name.in_(city_name))
        
    if search:
        query = query.where(ResourceSpot.name.ilike(f"%{search}%"))
        
    query = paginate_query(query, page, size)
    items = db.scalars(query).all()
    if current_user is None:
        mask_prices_for_guest(items)
    return items

@router.post("/spots", response_model=SpotOut)
def create_spot(payload: SpotCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    final_is_public = payload.is_public and current_user.role == 'admin'
    owner = 'system' if final_is_public else current_user.username
    
    obj = ResourceSpot(
        id=payload.id or str(uuid.uuid4()),
        city_id=payload.city_id,
        name=payload.name,
        price=payload.price,
        owner_id=owner,
        is_public=final_is_public
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@router.put("/spots/{id}", response_model=SpotOut)
def update_spot(id: str, payload: SpotUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = db.get(ResourceSpot, id)
    if not obj: raise HTTPException(404, "Not found")
    
    if obj.owner_id != current_user.username:
        if not (obj.is_public and current_user.role == 'admin'):
            raise HTTPException(403, "Not authorized")
            
    if payload.name is not None: obj.name = payload.name
    if payload.price is not None: obj.price = payload.price
    if payload.is_public is not None:
        if current_user.role != 'admin': raise HTTPException(403)
        obj.is_public = payload.is_public
        obj.owner_id = 'system' if payload.is_public else current_user.username
    
    db.commit()
    db.refresh(obj)
    return obj

@router.delete("/spots/{id}")
def delete_spot(id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = db.get(ResourceSpot, id)
    if not obj: return {"success": True}
    if obj.owner_id != current_user.username:
        if not (obj.is_public and current_user.role == 'admin'): raise HTTPException(403, "Not authorized")
    db.delete(obj)
    db.commit()
    return {"success": True}


# --- Hotels ---
@router.get("/hotels", response_model=List[HotelOut])
def list_hotels(
    city_id: Optional[str] = None,
    city_name: Optional[List[str]] = Query(None),
    search: Optional[str] = None,
    scope: str = "all",
    page: int = 1,
    size: int = 100,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional)
):
    query = select(ResourceHotel)
    query = apply_scope_filter(query, ResourceHotel, current_user, scope)
    if city_id: query = query.where(ResourceHotel.city_id == city_id)
    if city_name: query = query.join(ResourceCity).where(ResourceCity.name.in_(city_name))
    if search: query = query.where(ResourceHotel.name.ilike(f"%{search}%"))
    items = db.scalars(paginate_query(query, page, size)).all()
    if current_user is None:
        mask_prices_for_guest(items)
    return items

@router.post("/hotels", response_model=HotelOut)
def create_hotel(payload: HotelCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    final_is_public = payload.is_public and current_user.role == 'admin'
    owner = 'system' if final_is_public else current_user.username
    obj = ResourceHotel(
        id=payload.id or str(uuid.uuid4()),
        city_id=payload.city_id,
        name=payload.name,
        room_type=payload.room_type,
        price=payload.price,
        owner_id=owner,
        is_public=final_is_public
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@router.put("/hotels/{id}", response_model=HotelOut)
def update_hotel(id: str, payload: HotelUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = db.get(ResourceHotel, id)
    if not obj: raise HTTPException(404, "Not found")
    if obj.owner_id != current_user.username and not (obj.is_public and current_user.role == 'admin'): raise HTTPException(403)
    
    if payload.name is not None: obj.name = payload.name
    if payload.room_type is not None: obj.room_type = payload.room_type
    if payload.price is not None: obj.price = payload.price
    if payload.is_public is not None:
        if current_user.role != 'admin': raise HTTPException(403)
        obj.is_public = payload.is_public
        obj.owner_id = 'system' if payload.is_public else current_user.username
    db.commit()
    db.refresh(obj)
    return obj

@router.delete("/hotels/{id}")
def delete_hotel(id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = db.get(ResourceHotel, id)
    if not obj: return {"success": True}
    if obj.owner_id != current_user.username and not (obj.is_public and current_user.role == 'admin'): raise HTTPException(403)
    db.delete(obj)
    db.commit()
    return {"success": True}


# --- Activities ---
@router.get("/activities", response_model=List[ActivityOut])
def list_activities(
    city_id: Optional[str] = None,
    city_name: Optional[List[str]] = Query(None),
    search: Optional[str] = None,
    scope: str = "all",
    page: int = 1,
    size: int = 100,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional)
):
    query = select(ResourceActivity)
    query = apply_scope_filter(query, ResourceActivity, current_user, scope)
    if city_id: query = query.where(ResourceActivity.city_id == city_id)
    if city_name: query = query.join(ResourceCity).where(ResourceCity.name.in_(city_name))
    if search: query = query.where(ResourceActivity.name.ilike(f"%{search}%"))
    items = db.scalars(paginate_query(query, page, size)).all()
    if current_user is None:
        mask_prices_for_guest(items)
    return items


@router.post("/activities", response_model=ActivityOut)
def create_activity(payload: ActivityCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    final_is_public = payload.is_public and current_user.role == 'admin'
    owner = 'system' if final_is_public else current_user.username
    obj = ResourceActivity(
        id=payload.id or str(uuid.uuid4()),
        city_id=payload.city_id,
        name=payload.name,
        price=payload.price,
        owner_id=owner,
        is_public=final_is_public
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@router.put("/activities/{id}", response_model=ActivityOut)
def update_activity(id: str, payload: ActivityUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = db.get(ResourceActivity, id)
    if not obj: raise HTTPException(404, "Not found")
    if obj.owner_id != current_user.username and not (obj.is_public and current_user.role == 'admin'): raise HTTPException(403)
    if payload.name is not None: obj.name = payload.name
    if payload.price is not None: obj.price = payload.price
    if payload.is_public is not None:
        if current_user.role != 'admin': raise HTTPException(403)
        obj.is_public = payload.is_public
        obj.owner_id = 'system' if payload.is_public else current_user.username
    db.commit()
    db.refresh(obj)
    return obj

@router.delete("/activities/{id}")
def delete_activity(id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = db.get(ResourceActivity, id)
    if not obj: return {"success": True}
    if obj.owner_id != current_user.username and not (obj.is_public and current_user.role == 'admin'): raise HTTPException(403)
    db.delete(obj)
    db.commit()
    return {"success": True}


# --- Transports ---
@router.get("/transports", response_model=List[TransportOut])
def list_transports(
    region: Optional[str] = None, # Country
    search: Optional[str] = None,
    scope: str = "all",
    page: int = 1,
    size: int = 100,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional)
):
    query = select(ResourceTransport)
    query = apply_scope_filter(query, ResourceTransport, current_user, scope)
    if region: query = query.where(ResourceTransport.region == region)
    if search: query = query.where(ResourceTransport.car_model.ilike(f"%{search}%"))
    items = db.scalars(paginate_query(query, page, size)).all()
    if current_user is None:
        mask_prices_for_guest(items)
    return items

@router.post("/transports", response_model=TransportOut)
def create_transport(payload: TransportCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    final_is_public = payload.is_public and current_user.role == 'admin'
    owner = 'system' if final_is_public else current_user.username
    obj = ResourceTransport(
        id=payload.id or str(uuid.uuid4()),
        region=payload.region,
        car_model=payload.car_model,
        service_type=payload.service_type,
        passengers=payload.passengers,
        price_low=payload.price_low,
        price_high=payload.price_high,
        owner_id=owner,
        is_public=final_is_public
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@router.put("/transports/{id}", response_model=TransportOut)
def update_transport(id: str, payload: TransportUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = db.get(ResourceTransport, id)
    if not obj: raise HTTPException(404, "Not found")
    if obj.owner_id != current_user.username and not (obj.is_public and current_user.role == 'admin'): raise HTTPException(403)
    
    if payload.car_model is not None: obj.car_model = payload.car_model
    if payload.service_type is not None: obj.service_type = payload.service_type
    if payload.passengers is not None: obj.passengers = payload.passengers
    if payload.price_low is not None: obj.price_low = payload.price_low
    if payload.price_high is not None: obj.price_high = payload.price_high
    if payload.is_public is not None:
        if current_user.role != 'admin': raise HTTPException(403)
        obj.is_public = payload.is_public
        obj.owner_id = 'system' if payload.is_public else current_user.username
    db.commit()
    db.refresh(obj)
    return obj

@router.delete("/transports/{id}")
def delete_transport(id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = db.get(ResourceTransport, id)
    if not obj: return {"success": True}
    if obj.owner_id != current_user.username and not (obj.is_public and current_user.role == 'admin'): raise HTTPException(403)
    db.delete(obj)
    db.commit()
    return {"success": True}


# --- Restaurants ---
@router.get("/restaurants", response_model=List[RestaurantOut])
def list_restaurants(
    city_id: Optional[str] = None,
    city_name: Optional[List[str]] = Query(None),
    cuisine_type: Optional[str] = None,
    search: Optional[str] = None,
    scope: str = "all",
    page: int = 1,
    size: int = 100,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional)
):
    query = select(ResourceRestaurant)
    query = apply_scope_filter(query, ResourceRestaurant, current_user, scope)
    if city_id: query = query.where(ResourceRestaurant.city_id == city_id)
    if city_name: query = query.join(ResourceCity).where(ResourceCity.name.in_(city_name))
    if cuisine_type: query = query.where(ResourceRestaurant.cuisine_type == cuisine_type)
    if search: query = query.where(ResourceRestaurant.name.ilike(f"%{search}%"))
    items = db.scalars(paginate_query(query, page, size)).all()
    if current_user is None:
        mask_prices_for_guest(items)
    return items

@router.post("/restaurants", response_model=RestaurantOut)
def create_restaurant(payload: RestaurantCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    final_is_public = payload.is_public and current_user.role == 'admin'
    owner = 'system' if final_is_public else current_user.username
    obj = ResourceRestaurant(
        id=payload.id or str(uuid.uuid4()),
        city_id=payload.city_id,
        name=payload.name,
        cuisine_type=payload.cuisine_type,
        avg_price=payload.avg_price,
        dietary_tags=payload.dietary_tags,
        meal_type=payload.meal_type,
        owner_id=owner,
        is_public=final_is_public
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@router.put("/restaurants/{id}", response_model=RestaurantOut)
def update_restaurant(id: str, payload: RestaurantUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = db.get(ResourceRestaurant, id)
    if not obj: raise HTTPException(404, "Not found")
    if obj.owner_id != current_user.username and not (obj.is_public and current_user.role == 'admin'): raise HTTPException(403)
    
    if payload.name is not None: obj.name = payload.name
    if payload.cuisine_type is not None: obj.cuisine_type = payload.cuisine_type
    if payload.avg_price is not None: obj.avg_price = payload.avg_price
    if payload.dietary_tags is not None: obj.dietary_tags = payload.dietary_tags
    if payload.meal_type is not None: obj.meal_type = payload.meal_type
    if payload.is_public is not None:
        if current_user.role != 'admin': raise HTTPException(403)
        obj.is_public = payload.is_public
        obj.owner_id = 'system' if payload.is_public else current_user.username
    db.commit()
    db.refresh(obj)
    return obj

@router.delete("/restaurants/{id}")
def delete_restaurant(id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    obj = db.get(ResourceRestaurant, id)
    if not obj: return {"success": True}
    if obj.owner_id != current_user.username and not (obj.is_public and current_user.role == 'admin'): raise HTTPException(403)
    db.delete(obj)
    db.commit()
    return {"success": True}

# --- Documents ---
@router.get("/documents", response_model=List[DocumentOut])
def list_documents(
    category: Optional[str] = None,
    country: Optional[str] = None,
    city_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_admin_or_super(current_user)
    stmt = select(ResourceDocument)
    if category:
        stmt = stmt.where(ResourceDocument.category == category)
    if country:
        stmt = stmt.where(ResourceDocument.country == country)
    if city_id:
        stmt = stmt.where(ResourceDocument.city_id == city_id)
    stmt = stmt.order_by(desc(ResourceDocument.uploaded_at))
    rows = db.execute(stmt).scalars().all()

    def to_out(doc: ResourceDocument) -> DocumentOut:
        return DocumentOut(
            id=doc.id,
            category=doc.category,
            country=doc.country,
            city_id=doc.city_id,
            title=doc.title,
            file_name=doc.file_name,
            mime_type=doc.mime_type,
            size=doc.size,
            note=doc.note,
            uploaded_by=doc.uploaded_by,
            uploaded_at=doc.uploaded_at,
            download_url=f"/api/resources/documents/{doc.id}/download",
        )

    return [to_out(d) for d in rows]


@router.post("/documents", response_model=DocumentOut)
def upload_document(
    file: UploadFile = File(...),
    category: str = Form(...),
    country: str = Form(...),
    city_id: Optional[str] = Form(None),
    note: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_super_admin(current_user)
    allowed = {"country", "hotel", "ticket", "activity", "transport"}
    if category not in allowed:
        raise HTTPException(status_code=400, detail="Invalid category")
    if not country:
        raise HTTPException(status_code=400, detail="Country required")

    safe_name = Path(file.filename or "document").name
    ext = Path(safe_name).suffix.lower()
    if not ext or ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    content_type = (file.content_type or "").lower().strip()
    if content_type and content_type not in ALLOWED_MIME_TYPES:
        # Allow generic octet-stream but rely on magic bytes + extension
        if not (content_type == "application/octet-stream" and ext in ALLOWED_EXTENSIONS):
            if not (content_type.startswith("text/") and ext in {".txt", ".md", ".csv"}):
                raise HTTPException(status_code=400, detail="Unsupported content type")
    expected = MIME_BY_EXT.get(ext)
    if content_type and expected and content_type not in {expected, "application/octet-stream"}:
        # Some clients send text/plain for csv/md; allow that
        if not (content_type.startswith("text/") and ext in {".txt", ".md", ".csv"}):
            raise HTTPException(status_code=400, detail="Content type mismatch")
    doc_id = str(uuid.uuid4())
    stored_name = f"{doc_id}{ext}"
    dest = UPLOAD_DIR / stored_name
    size = 0
    try:
        with dest.open("wb") as f:
            first = file.file.read(1024 * 1024)
            if not first:
                raise HTTPException(status_code=400, detail="Empty file")
            if not _validate_magic(ext, first[:512]):
                raise HTTPException(status_code=400, detail="File signature mismatch")
            size += len(first)
            if size > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="File too large")
            f.write(first)
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="File too large")
                f.write(chunk)
    except HTTPException:
        if dest.exists():
            dest.unlink()
        raise
    except Exception:
        if dest.exists():
            dest.unlink()
        raise
    finally:
        file.file.close()

    content_text: Optional[str] = None
    if file.content_type and file.content_type.startswith("text/"):
        try:
            content_text = dest.read_text(encoding="utf-8", errors="ignore")[:5000]
        except Exception:
            content_text = None
    elif ext.lower() in {".txt", ".md"}:
        try:
            content_text = dest.read_text(encoding="utf-8", errors="ignore")[:5000]
        except Exception:
            content_text = None

    size = dest.stat().st_size if dest.exists() else size
    doc = ResourceDocument(
        id=doc_id,
        category=category,
        country=country,
        city_id=city_id or None,
        title=title or safe_name,
        file_name=safe_name,
        file_path=str(dest),
        mime_type=(file.content_type or MIME_BY_EXT.get(ext)),
        size=size,
        note=note,
        content_text=content_text,
        uploaded_by=current_user.username,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return DocumentOut(
        id=doc.id,
        category=doc.category,
        country=doc.country,
        city_id=doc.city_id,
        title=doc.title,
        file_name=doc.file_name,
        mime_type=doc.mime_type,
        size=doc.size,
        note=doc.note,
        uploaded_by=doc.uploaded_by,
        uploaded_at=doc.uploaded_at,
        download_url=f"/api/resources/documents/{doc.id}/download",
    )


@router.get("/documents/{doc_id}/download")
def download_document(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_admin_or_super(current_user)
    doc = db.get(ResourceDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    path = Path(doc.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing")
    return FileResponse(path, filename=doc.file_name, media_type=doc.mime_type or "application/octet-stream")

