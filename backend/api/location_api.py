import json
import os
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Query, HTTPException, Depends, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Location

router = APIRouter(prefix="/api/locations", tags=["Locations"])

# In-memory cache for pakistan_locations.json master data
_cached_data = None
_cached_mtime = 0


def _get_master_locations() -> Dict[str, Any]:
    global _cached_data, _cached_mtime
    file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "pakistan_locations.json")
    try:
        mtime = os.path.getmtime(file_path)
        if _cached_data is None or mtime > _cached_mtime:
            with open(file_path, "r", encoding="utf-8") as f:
                _cached_data = json.load(f)
            _cached_mtime = mtime
        return _cached_data
    except Exception as e:
        print("[LocationAPI] Warning: could not load pakistan_locations.json:", e)
        return _cached_data or {"provinces": []}


class CreateLocationRequest(BaseModel):
    name: str
    type: str  # province | city | area | site
    parent_id: Optional[int] = None


@router.get("/summary")
def get_locations_summary(db: Session = Depends(get_db)):
    """Returns all system-registered locations from the database."""
    all_locs = db.query(Location).all()
    loc_by_id = {loc.id: loc for loc in all_locs}

    provinces = []
    cities = []
    areas = []
    sites = []

    for loc in all_locs:
        if loc.type == "province":
            provinces.append({
                "id": loc.id,
                "name": loc.name,
                "created_at": loc.created_at.isoformat() if loc.created_at else None
            })
        elif loc.type == "city":
            parent_prov = loc_by_id.get(loc.parent_id)
            cities.append({
                "id": loc.id,
                "name": loc.name,
                "parent_id": loc.parent_id,
                "province_name": parent_prov.name if parent_prov else "—",
                "created_at": loc.created_at.isoformat() if loc.created_at else None
            })
        elif loc.type == "area":
            parent_city = loc_by_id.get(loc.parent_id)
            parent_prov = loc_by_id.get(parent_city.parent_id) if parent_city else None
            areas.append({
                "id": loc.id,
                "name": loc.name,
                "parent_id": loc.parent_id,
                "city_name": parent_city.name if parent_city else "—",
                "province_name": parent_prov.name if parent_prov else "—",
                "created_at": loc.created_at.isoformat() if loc.created_at else None
            })
        elif loc.type == "site":
            parent_area = loc_by_id.get(loc.parent_id)
            parent_city = loc_by_id.get(parent_area.parent_id) if parent_area else None
            parent_prov = loc_by_id.get(parent_city.parent_id) if parent_city else None
            sites.append({
                "id": loc.id,
                "name": loc.name,
                "parent_id": loc.parent_id,
                "area_name": parent_area.name if parent_area else "—",
                "city_name": parent_city.name if parent_city else "—",
                "province_name": parent_prov.name if parent_prov else "—",
                "created_at": loc.created_at.isoformat() if loc.created_at else None
            })

    # Sort each list by name
    provinces.sort(key=lambda x: x["name"].lower())
    cities.sort(key=lambda x: x["name"].lower())
    areas.sort(key=lambda x: x["name"].lower())
    sites.sort(key=lambda x: x["name"].lower())

    return {
        "provinces": provinces,
        "cities": cities,
        "areas": areas,
        "sites": sites
    }


@router.post("/create")
def create_location(req: CreateLocationRequest, db: Session = Depends(get_db)):
    """Create a new province, city, area, or site in the database."""
    name_clean = req.name.strip()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Location name cannot be empty")

    valid_types = ["province", "city", "area", "site"]
    if req.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid location type. Must be one of {valid_types}")

    if req.type != "province" and not req.parent_id:
        raise HTTPException(status_code=400, detail=f"Parent location is required for type '{req.type}'")

    # Check for duplicate under same parent
    existing = db.query(Location).filter(
        Location.name.ilike(name_clean),
        Location.type == req.type,
        Location.parent_id == req.parent_id
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail=f"{req.type.capitalize()} '{name_clean}' already exists in this scope")

    new_loc = Location(
        name=name_clean,
        type=req.type,
        parent_id=req.parent_id
    )
    db.add(new_loc)
    db.commit()
    db.refresh(new_loc)

    return {"message": f"{req.type.capitalize()} created successfully", "location": new_loc.to_dict()}


@router.delete("/{location_id}")
def delete_location(location_id: int, db: Session = Depends(get_db)):
    """Delete a location and all its descendant locations recursively."""
    loc = db.query(Location).filter(Location.id == location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    # Recursively collect all descendant IDs
    def get_descendant_ids(parent_id: int) -> List[int]:
        child_ids = [c.id for c in db.query(Location).filter(Location.parent_id == parent_id).all()]
        all_ids = list(child_ids)
        for cid in child_ids:
            all_ids.extend(get_descendant_ids(cid))
        return all_ids

    all_to_delete = [loc.id] + get_descendant_ids(loc.id)

    db.query(Location).filter(Location.id.in_(all_to_delete)).delete(synchronize_session=False)
    db.commit()

    return {"message": "Location and associated children deleted successfully", "deleted_ids": all_to_delete}


# =========================================================================
# MASTER PAKISTAN JSON LOOKUPS (FOR AUTOCOMPLETE & SEARCH DROPDOWNS)
# =========================================================================

@router.get("/master/provinces")
def get_master_provinces():
    """List all available provinces from master Pakistan JSON."""
    data = _get_master_locations()
    provinces = []
    for p in data.get("provinces", []):
        p_name = p.get("name", "").strip()
        if p_name and p_name not in provinces:
            provinces.append(p_name)
    return {"provinces": sorted(provinces)}


@router.get("/master/cities")
def get_master_cities(province: Optional[str] = Query(None)):
    """List all cities from master Pakistan JSON, optionally filtered by province."""
    data = _get_master_locations()
    cities = []
    p_filter = province.strip().lower() if province else None

    for p in data.get("provinces", []):
        p_name = p.get("name", "").strip()
        if not p_filter or p_name.lower() == p_filter:
            for c in p.get("cities", []):
                c_name = c.get("name", "").strip()
                if c_name and c_name not in cities:
                    cities.append(c_name)

    return {"cities": sorted(cities)}


@router.get("/master/areas")
def get_master_areas(province: Optional[str] = Query(None), city: Optional[str] = Query(None)):
    """List all areas from master Pakistan JSON, optionally filtered by city or province."""
    data = _get_master_locations()
    areas = []
    p_filter = province.strip().lower() if province else None
    c_filter = city.strip().lower() if city else None

    for p in data.get("provinces", []):
        p_name = p.get("name", "").strip()
        if p_filter and p_name.lower() != p_filter:
            continue
        for c in p.get("cities", []):
            c_name = c.get("name", "").strip()
            if not c_filter or c_name.lower() == c_filter:
                for a in c.get("areas", []):
                    a_name = a.get("name", "").strip()
                    if a_name and a_name not in areas:
                        areas.append(a_name)

    return {"areas": sorted(areas)}


# Legacy compatibility aliases
@router.get("/provinces")
def legacy_get_provinces():
    return [{"name": p} for p in get_master_provinces()["provinces"]]


@router.get("/cities")
def legacy_get_cities(province: Optional[str] = Query(None)):
    return [{"name": c, "province_name": province or ""} for c in get_master_cities(province)["cities"]]


@router.get("/areas")
def legacy_get_areas(city: Optional[str] = Query(None), province: Optional[str] = Query(None)):
    return [{"name": a, "city_name": city or "", "province_name": province or ""} for a in get_master_areas(province, city)["areas"]]
