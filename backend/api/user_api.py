from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db
from models import User, Role, Agent
from auth.security import hash_password
from auth.dependencies import get_current_user, require_superadmin, require_permission
from services.audit_service import log_audit_event
from services.email_service import send_welcome_email
import secrets

router = APIRouter(prefix="/api/users", tags=["Users"])


class CreateUserRequest(BaseModel):
    username: Optional[str] = None
    email: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    role_id: Optional[int] = None
    assigned_agent_id: Optional[int] = None
    location_scope: Optional[str] = "agent"
    province: Optional[str] = None
    city: Optional[str] = None
    area: Optional[str] = None
    site: Optional[str] = None


class ToggleStatusRequest(BaseModel):
    is_active: bool


@router.get("/list")
def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = None,
    current_user: User = Depends(require_permission("USER_VIEW")),
    db: Session = Depends(get_db)
):
    """List system users with pagination, search, and status filtering."""
    # Super Admin is hidden from everyone in the user management section
    query = db.query(User).filter(User.is_superadmin == False)

    # Scoping: If not superadmin, only see users in own agent
    if not current_user.is_superadmin:
        query = query.filter(User.assigned_agent_id == current_user.assigned_agent_id)

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.username.ilike(s),
                User.email.ilike(s),
                User.full_name.ilike(s)
            )
        )

    if status == "active":
        query = query.filter(User.is_active == True)
    elif status == "inactive":
        query = query.filter(User.is_active == False)

    total = query.count()
    users = query.order_by(User.id.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "users": [u.to_dict() for u in users]
    }


@router.post("/create")
def create_user(
    req: CreateUserRequest,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Create a new user. Strictly binds user to an active Agent."""
    email_clean = req.email.strip().lower()
    if db.query(User).filter(User.email.ilike(email_clean)).first():
        raise HTTPException(status_code=400, detail="Email is already registered")

    # Generate or clean username
    username_clean = req.username.strip() if req.username and req.username.strip() else email_clean.split("@")[0]
    if db.query(User).filter(User.username.ilike(username_clean)).first():
        username_clean = f"{username_clean}_{secrets.token_hex(2)}"

    # Generate password if not supplied
    plain_password = req.password if req.password and req.password.strip() else f"Epic@{secrets.token_hex(3)}!"

    # Validate assigned agent if provided
    agent = None
    if req.assigned_agent_id:
        agent = db.query(Agent).filter(Agent.id == req.assigned_agent_id).first()

    # Validate role if provided
    role = None
    if req.role_id:
        role = db.query(Role).filter(Role.id == req.role_id).first()

    new_user = User(
        username=username_clean,
        email=email_clean,
        full_name=req.full_name.strip() if req.full_name else username_clean,
        phone=req.phone.strip() if req.phone else None,
        password_hash=hash_password(plain_password),
        role_id=req.role_id,
        assigned_agent_id=req.assigned_agent_id,
        location_scope=req.location_scope or "agent",
        province=req.province,
        city=req.city,
        area=req.area,
        site=req.site,
        is_active=True,
        is_superadmin=False,
        must_change_password=True
    )

    db.add(new_user)

    # Sync user's assigned locations to the Agent
    if agent:
        agent.province = new_user.province
        agent.city = new_user.city
        agent.area = new_user.area
        agent.site = new_user.site
        db.add(agent)

    db.commit()
    db.refresh(new_user)

    # Dispatch welcome email via AWS SES SMTP safely
    send_welcome_email(
        to_email=new_user.email,
        full_name=new_user.full_name,
        username=new_user.username,
        password=plain_password,
        role_name=role.name if role else "Standard User",
        agent_name=agent.name if agent else "Unassigned",
        location_details={
            "province": new_user.province,
            "city": new_user.city,
            "area": new_user.area,
            "site": new_user.site
        }
    )

    log_audit_event(
        db=db,
        action="USER_CREATE",
        user=current_user,
        resource_type="user",
        resource_id=new_user.id,
        details={"username": new_user.username, "email": new_user.email, "agent_id": new_user.assigned_agent_id},
        ip_address=request.client.host if request.client else "127.0.0.1"
    )

    return {
        "message": "User created successfully and credentials dispatched via email",
        "user": new_user.to_dict(),
        "plain_password": plain_password
    }


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role_id: Optional[int] = None
    assigned_agent_id: Optional[int] = None
    location_scope: Optional[str] = "agent"
    province: Optional[str] = None
    city: Optional[str] = None
    area: Optional[str] = None
    site: Optional[str] = None
    is_active: Optional[bool] = None


@router.put("/{user_id}")
def update_user(
    user_id: int,
    req: UpdateUserRequest,
    request: Request,
    current_user: User = Depends(require_permission("USER_UPDATE")),
    db: Session = Depends(get_db)
):
    """Update user information (name, email, phone, role, agent, locations)."""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    if target_user.is_superadmin:
        raise HTTPException(status_code=400, detail="Cannot alter root Super Admin through user management")

    if req.email and req.email.strip().lower() != target_user.email:
        email_clean = req.email.strip().lower()
        if db.query(User).filter(User.email.ilike(email_clean), User.id != user_id).first():
            raise HTTPException(status_code=400, detail="Email is already in use by another user")
        target_user.email = email_clean

    if req.full_name is not None:
        target_user.full_name = req.full_name.strip()
    if req.phone is not None:
        target_user.phone = req.phone.strip() if req.phone else None
    if req.role_id is not None:
        target_user.role_id = req.role_id
    if req.assigned_agent_id is not None:
        target_user.assigned_agent_id = req.assigned_agent_id
    if req.location_scope is not None:
        target_user.location_scope = req.location_scope
    if req.province is not None:
        target_user.province = req.province
    if req.city is not None:
        target_user.city = req.city
    if req.area is not None:
        target_user.area = req.area
    if req.site is not None:
        target_user.site = req.site
    if req.is_active is not None:
        target_user.is_active = req.is_active

    db.commit()
    db.refresh(target_user)

    log_audit_event(
        db=db,
        action="USER_UPDATE",
        user=current_user,
        resource_type="user",
        resource_id=target_user.id,
        details={"username": target_user.username, "email": target_user.email},
        ip_address=request.client.host if request.client else "127.0.0.1"
    )

    return {"message": "User updated successfully", "user": target_user.to_dict()}


@router.put("/{user_id}/status")
def toggle_user_status(
    user_id: int,
    req: ToggleStatusRequest,
    request: Request,
    current_user: User = Depends(require_permission("USER_UPDATE")),
    db: Session = Depends(get_db)
):
    """Toggle user active / inactive status."""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if target_user.is_superadmin:
        raise HTTPException(status_code=400, detail="Cannot deactivate root Super Admin")

    target_user.is_active = req.is_active
    db.commit()

    log_audit_event(
        db=db,
        action="USER_STATUS_CHANGE",
        user=current_user,
        resource_type="user",
        resource_id=target_user.id,
        details={"is_active": req.is_active},
        ip_address=request.client.host if request.client else "127.0.0.1"
    )

    return {"message": f"User status set to {'active' if req.is_active else 'inactive'}"}


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    request: Request,
    current_user: User = Depends(require_permission("USER_DELETE")),
    db: Session = Depends(get_db)
):
    """Delete a user account."""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if target_user.is_superadmin:
        raise HTTPException(status_code=400, detail="Cannot delete root Super Admin")

    username = target_user.username
    db.delete(target_user)
    db.commit()

    log_audit_event(
        db=db,
        action="USER_DELETE",
        user=current_user,
        resource_type="user",
        resource_id=user_id,
        details={"deleted_username": username},
        ip_address=request.client.host if request.client else "127.0.0.1"
    )

    return {"message": f"User '{username}' deleted successfully"}
