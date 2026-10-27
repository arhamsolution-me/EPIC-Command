from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Role, Permission, RolePermission, User
from auth.dependencies import get_current_user, require_superadmin, require_permission
from services.audit_service import log_audit_event, extract_client_ip

router = APIRouter(prefix="/api/roles", tags=["Roles"])


class CreateRoleRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    permission_keys: List[str] = []


class UpdatePermissionsRequest(BaseModel):
    permission_keys: List[str]


@router.get("/list")
def list_roles(
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """List all roles with assigned permission keys, strictly hiding Super Admin."""
    roles = db.query(Role).filter(Role.name != "Super Admin").order_by(Role.id.asc()).all()
    return {"roles": [r.to_dict() for r in roles]}


@router.get("/permissions/matrix")
def get_permission_matrix(
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Return all permissions grouped into hierarchical modules."""
    all_perms = db.query(Permission).order_by(Permission.sort_order.asc()).all()
    
    # Group by module
    modules_map = {}
    for p in all_perms:
        if p.module in ["Role & Permission Management", "Role Management", "Audit Logs"]:
            continue
        if p.module not in modules_map:
            modules_map[p.module] = []
        modules_map[p.module].append({
            "key": p.key,
            "label": p.name,
            "parent_key": p.parent_key
        })

    modules = [{"module": mod, "permissions": perms} for mod, perms in modules_map.items()]
    return {"modules": modules, "total_permissions": sum(len(m["permissions"]) for m in modules)}


@router.post("/create")
def create_role(
    req: CreateRoleRequest,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Create a new role with optional permission assignments."""
    if db.query(Role).filter(Role.name == req.name.strip()).first():
        raise HTTPException(status_code=400, detail="Role name already exists")

    new_role = Role(
        name=req.name.strip(),
        description=req.description,
        is_system=False,
        is_active=True
    )
    db.add(new_role)
    db.flush()

    # Assign permissions
    if req.permission_keys:
        perms = db.query(Permission).filter(Permission.key.in_(req.permission_keys)).all()
        for p in perms:
            db.add(RolePermission(role_id=new_role.id, permission_id=p.id))

    db.commit()
    db.refresh(new_role)

    log_audit_event(
        db=db,
        action="ROLE_CREATE",
        user=current_user,
        resource_type="role",
        resource_id=new_role.id,
        details={"name": new_role.name, "perms_count": len(req.permission_keys)},
        ip_address=request.client.host if request.client else "127.0.0.1"
    )

    return {"message": "Role created successfully", "role": new_role.to_dict()}


@router.put("/{role_id}/permissions")
def update_role_permissions(
    role_id: int,
    req: UpdatePermissionsRequest,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Update permissions for a role dynamically (zero server restart required)."""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if role.is_system and role.name == "Super Admin":
        raise HTTPException(status_code=400, detail="Cannot alter permissions for Super Admin")

    # Clear existing role_permissions
    db.query(RolePermission).filter(RolePermission.role_id == role.id).delete()

    # Assign new permissions
    if req.permission_keys:
        perms = db.query(Permission).filter(Permission.key.in_(req.permission_keys)).all()
        for p in perms:
            db.add(RolePermission(role_id=role.id, permission_id=p.id))

    # Bump permission_version for all users in this role to invalidate cached auth
    db.query(User).filter(User.role_id == role.id).update(
        {User.permission_version: User.permission_version + 1},
        synchronize_session=False
    )

    db.commit()

    log_audit_event(
        db=db,
        action="ROLE_UPDATE_PERMISSIONS",
        user=current_user,
        resource_type="role",
        resource_id=role.id,
        details={"role_name": role.name, "keys": req.permission_keys},
        ip_address=request.client.host if request.client else "127.0.0.1"
    )

    return {"message": "Permissions updated live and synced successfully"}


class UpdateRoleRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    is_active: Optional[bool] = True


@router.put("/{role_id}")
def update_role(
    role_id: int,
    req: UpdateRoleRequest,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Update role details (name, description, active status)."""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if role.is_system and role.name == "Super Admin":
        raise HTTPException(status_code=400, detail="Cannot alter Super Admin role")

    name_clean = req.name.strip()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Role name cannot be empty")

    # Check duplicate
    dup = db.query(Role).filter(Role.name == name_clean, Role.id != role_id).first()
    if dup:
        raise HTTPException(status_code=400, detail="Another role already has this name")

    role.name = name_clean
    role.description = req.description or ""
    if req.is_active is not None:
        role.is_active = req.is_active

    db.commit()
    db.refresh(role)

    log_audit_event(
        db=db,
        action="ROLE_UPDATE",
        user=current_user,
        resource_type="role",
        resource_id=role.id,
        details={"name": role.name, "is_active": role.is_active},
        ip_address=extract_client_ip(request)
    )

    return {"message": "Role updated successfully", "role": role.to_dict()}


@router.delete("/{role_id}")
def delete_role(
    role_id: int,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Delete a role safely, unassigning any users previously mapped to it."""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if role.is_system or role.name == "Super Admin":
        raise HTTPException(status_code=400, detail="Cannot delete system/Super Admin role")

    # Safely detach users mapped to this role
    assigned_users = db.query(User).filter(User.role_id == role.id).all()
    assigned_count = len(assigned_users)
    for u in assigned_users:
        u.role_id = None
        u.permission_version += 1

    # Remove associated role_permissions
    db.query(RolePermission).filter(RolePermission.role_id == role.id).delete()

    role_name = role.name
    db.delete(role)
    db.commit()

    log_audit_event(
        db=db,
        action="ROLE_DELETE",
        user=current_user,
        resource_type="role",
        resource_id=role_id,
        details={"name": role_name, "detached_users_count": assigned_count},
        ip_address=extract_client_ip(request)
    )

    return {"message": f"Role '{role_name}' deleted successfully", "id": role_id}


