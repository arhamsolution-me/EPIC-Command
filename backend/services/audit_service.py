import json
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from models import AuditLog, User


def extract_client_ip(request: Optional[Any] = None) -> str:
    """Extract real client IP considering reverse proxy headers."""
    if not request:
        return "127.0.0.1"
    headers = getattr(request, "headers", None)
    if headers:
        x_forwarded = headers.get("x-forwarded-for")
        if x_forwarded:
            return x_forwarded.split(",")[0].strip()
        x_real = headers.get("x-real-ip")
        if x_real:
            return x_real.strip()
    client = getattr(request, "client", None)
    if client and getattr(client, "host", None):
        return client.host
    return "127.0.0.1"


def log_audit_event(
    db: Session,
    action: str,
    user: Optional[User] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[Any] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
) -> AuditLog:
    """Record an audit log entry in PostgreSQL."""
    try:
        details_str = json.dumps(details) if details else None
        log_entry = AuditLog(
            user_id=user.id if user else None,
            username=user.username if user else "system",
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            details=details_str,
            ip_address=ip_address or "127.0.0.1"
        )
        db.add(log_entry)
        db.commit()
        return log_entry
    except Exception as e:
        db.rollback()
        print(f"[Audit] Failed to log event '{action}': {e}")
        return None
