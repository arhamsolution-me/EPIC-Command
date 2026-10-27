from datetime import datetime, timezone
import json
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(80), unique=True, nullable=False, index=True)
    description = Column(String(255), nullable=True)
    is_system = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    role_permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")
    users = relationship("User", back_populates="role")

    def to_dict(self):
        permission_keys = [rp.permission.key for rp in self.role_permissions if rp.permission]
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "is_system": bool(self.is_system),
            "is_active": bool(self.is_active),
            "total_users": len(self.users) if self.users else 0,
            "permission_keys": permission_keys,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": getattr(self, "updated_at", None).isoformat() if getattr(self, "updated_at", None) else (self.created_at.isoformat() if self.created_at else None)
        }


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(80), unique=True, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    parent_key = Column(String(80), nullable=True, index=True)
    module = Column(String(80), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    role_permissions = relationship("RolePermission", back_populates="permission", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "key": self.key,
            "name": self.name,
            "parent_key": self.parent_key,
            "module": self.module,
            "sort_order": self.sort_order
        }


class RolePermission(Base):
    __tablename__ = "role_permissions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True)
    permission_id = Column(Integer, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    role = relationship("Role", back_populates="role_permissions")
    permission = relationship("Permission", back_populates="role_permissions")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(80), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=False, index=True)
    full_name = Column(String(120), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_agent_id = Column(Integer, ForeignKey("agents.id", ondelete="SET NULL"), nullable=True, index=True)
    phone = Column(String(32), nullable=True)
    location_scope = Column(String(32), default="global", nullable=False)  # global | province | city | area | site
    province = Column(String(80), nullable=True)
    city = Column(String(80), nullable=True)
    area = Column(String(80), nullable=True)
    site = Column(String(80), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_superadmin = Column(Boolean, default=False, nullable=False)
    must_change_password = Column(Boolean, default=False, nullable=False)
    permission_version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    role = relationship("Role", back_populates="users")
    assigned_agent = relationship("Agent", foreign_keys=[assigned_agent_id], backref="assigned_users")

    def to_dict(self, include_permissions=True):
        permissions = []
        if include_permissions:
            if self.is_superadmin:
                # Super Admin implicitly has all permissions
                permissions = ["*"]
            elif self.role and self.role.is_active:
                permissions = [rp.permission.key for rp in self.role.role_permissions if rp.permission]

        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "full_name": self.full_name,
            "phone": self.phone or "",
            "role_id": self.role_id,
            "role_name": self.role.name if self.role else "No Role",
            "assigned_agent_id": self.assigned_agent_id,
            "assigned_agent_name": self.assigned_agent.name if self.assigned_agent else "Unassigned",
            "assigned_agent_status": self.assigned_agent.status if self.assigned_agent else None,
            "location_scope": self.location_scope,
            "province": self.province,
            "city": self.city,
            "area": self.area,
            "site": self.site,
            "is_active": bool(self.is_active),
            "is_superadmin": bool(self.is_superadmin),
            "must_change_password": bool(getattr(self, "must_change_password", False)),
            "permission_version": self.permission_version,
            "permissions": permissions,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(120), nullable=False, index=True)
    type = Column(String(32), nullable=False, index=True)  # province | city | area | site
    parent_id = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    parent = relationship("Location", remote_side=[id], backref="children")

    def to_dict(self, include_children=False):
        data = {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "parent_id": self.parent_id,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
        if include_children and self.children:
            data["children"] = [c.to_dict(include_children=True) for c in self.children]
        return data


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True, index=True)
    username = Column(String(80), nullable=True, index=True)
    action = Column(String(80), nullable=False, index=True)
    resource_type = Column(String(80), nullable=True)
    resource_id = Column(String(80), nullable=True)
    details = Column("details", Text, nullable=True)
    ip_address = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    def __init__(self, **kwargs):
        # Support both details and details_json keyword arguments
        if "details_json" in kwargs and "details" not in kwargs:
            kwargs["details"] = kwargs.pop("details_json")
        super().__init__(**kwargs)

    def to_dict(self):
        details = {}
        raw = self.details
        if raw:
            try:
                details = json.loads(raw)
            except Exception:
                details = {"raw": raw}
        return {
            "id": self.id,
            "user_id": self.user_id,
            "username": self.username,
            "action": self.action,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "details": details,
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class Agent(Base):
    __tablename__ = "agents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(120), nullable=False)
    status = Column(String(32), nullable=False, default="active")
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    lan_ip = Column(String(64), nullable=True)
    hostname = Column(String(120), nullable=True)
    province = Column(String(80), nullable=True)
    city = Column(String(80), nullable=True)
    area = Column(String(80), nullable=True)
    site = Column(String(80), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    nvrs = relationship("NVR", back_populates="agent", cascade="all, delete-orphan")

    def to_dict(self):
        total_cameras = sum(len(nvr.cameras) for nvr in self.nvrs) if self.nvrs else 0
        assigned_names = [u.full_name or u.username for u in self.assigned_users] if (hasattr(self, "assigned_users") and self.assigned_users) else []
        assignee_display = ", ".join(assigned_names) if assigned_names else "Unassigned"

        first_user = self.assigned_users[0] if (hasattr(self, "assigned_users") and self.assigned_users) else None
        prov = self.province or (first_user.province if first_user and first_user.province else "—")
        cty = self.city or (first_user.city if first_user and first_user.city else "—")
        ara = self.area or (first_user.area if first_user and first_user.area else "—")
        ste = self.site or (first_user.site if first_user and first_user.site else "—")
        first_nvr = self.nvrs[0] if self.nvrs else None
        lip = self.lan_ip or (first_nvr.ip if first_nvr and first_nvr.ip else "Not enrolled")
        hname = self.hostname or "—"

        return {
            "id": self.id,
            "name": self.name,
            "status": self.status,
            "lan_ip": lip,
            "hostname": hname,
            "province": prov,
            "city": cty,
            "area": ara,
            "site": ste,
            "total_nvrs": len(self.nvrs) if self.nvrs else 0,
            "total_cameras": total_cameras,
            "assignee": assignee_display,
            "assigned_users": [
                {"id": u.id, "name": u.full_name or u.username, "email": u.email, "username": u.username}
                for u in self.assigned_users
            ] if (hasattr(self, "assigned_users") and self.assigned_users) else [],
            "created_by_user_id": self.created_by_user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "nvrs": [nvr.to_dict() for nvr in self.nvrs] if self.nvrs else []
        }


class NVR(Base):
    __tablename__ = "nvrs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="CASCADE"), nullable=True, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(120), nullable=False, default="Primary NVR")
    ip = Column(String(64), nullable=False, index=True)
    port = Column(Integer, nullable=False, default=80)
    rtsp_port = Column(Integer, nullable=False, default=554)
    username = Column(String(80), nullable=False)
    password = Column(String(120), nullable=True, default="")
    status = Column(String(32), nullable=False, default="online")
    total_channels = Column(Integer, nullable=False, default=0)
    vendor = Column(String(64), nullable=True, default="HIKVISION")
    province = Column(String(80), nullable=True)
    city = Column(String(80), nullable=True)
    area = Column(String(80), nullable=True)
    site = Column(String(80), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    agent = relationship("Agent", back_populates="nvrs")
    cameras = relationship("Camera", back_populates="nvr", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "agent_name": self.agent.name if self.agent else "Unassigned",
            "created_by_user_id": self.created_by_user_id,
            "name": self.name,
            "vendor": self.vendor or "HIKVISION",
            "ip": self.ip,
            "port": self.port,
            "rtsp_port": self.rtsp_port,
            "username": self.username,
            "status": self.status,
            "total_channels": self.total_channels,
            "province": self.province or "",
            "city": self.city or "",
            "area": self.area or "",
            "site": self.site or "",
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "cameras": [cam.to_dict() for cam in self.cameras] if self.cameras else []
        }


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, autoincrement=True)
    nvr_id = Column(Integer, ForeignKey("nvrs.id", ondelete="CASCADE"), nullable=False, index=True)
    channel_number = Column(Integer, nullable=False)
    name = Column(String(120), nullable=False)
    rtsp_stream_url = Column(String(500), nullable=False)
    sub_stream_url = Column(String(500), nullable=True)
    status = Column(String(32), nullable=False, default="reachable")
    is_ptz = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    nvr = relationship("NVR", back_populates="cameras")

    def to_dict(self):
        return {
            "id": self.id,
            "nvr_id": self.nvr_id,
            "channel_number": self.channel_number,
            "name": self.name,
            "rtsp_stream_url": self.rtsp_stream_url,
            "sub_stream_url": self.sub_stream_url,
            "status": self.status,
            "is_ptz": bool(self.is_ptz),
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
