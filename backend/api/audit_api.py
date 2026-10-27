from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import AuditLog, User
from auth.dependencies import get_current_user, require_superadmin

router = APIRouter(prefix="/api/audit", tags=["Audit"])


@router.get("/logs")
def get_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(15, ge=1, le=100),
    action: Optional[str] = None,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Retrieve security and operation audit logs (Super Admin only)."""
    query = db.query(AuditLog)

    if action:
        query = query.filter(AuditLog.action == action)

    total = query.count()
    logs = query.order_by(AuditLog.id.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "logs": [l.to_dict() for l in logs]
    }
