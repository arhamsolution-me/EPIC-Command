import os
from typing import Optional, List
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db
from models import User, Agent
from auth.security import decode_access_token

security_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Validate Bearer token and return active user."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or token invalid. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID format in token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated. Contact Super Admin.",
        )

    # For non-superadmins: verify assigned agent is active
    if not user.is_superadmin and user.assigned_agent_id:
        agent = db.query(Agent).filter(Agent.id == user.assigned_agent_id).first()
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your assigned surveillance agent is inactive or not found.",
            )

    return user


def require_superadmin(current_user: User = Depends(get_current_user)) -> User:
    """Enforce Super Admin only access."""
    if not current_user.is_superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Super Administrator privileges required.",
        )
    return current_user


def require_permission(perm_key: str):
    """Enforce specific RBAC permission."""
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.is_superadmin:
            return current_user
        perms = current_user.effective_permissions
        if "*" in perms or perm_key in perms:
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Missing required permission: {perm_key}",
        )
    return dependency


def apply_user_scope(query, user: User, model):
    """Apply location or agent-based scoping to a query. Users only see their assigned agent & NVRs."""
    if user.is_superadmin:
        return query

    # Direct Agent model scoping
    if getattr(model, "__name__", "") == "Agent":
        if user.assigned_agent_id:
            return query.filter(model.id == user.assigned_agent_id)
        return query.filter(model.id == -1)

    # Model linked to Agent (NVR)
    if hasattr(model, "agent_id"):
        if user.assigned_agent_id:
            return query.filter(model.agent_id == user.assigned_agent_id)
        return query.filter(model.id == -1)

    # Fallback location scoping if no agent assigned
    if user.location_scope == "city" and user.city and hasattr(model, "city"):
        query = query.filter(model.city == user.city)
    elif user.location_scope == "province" and user.province and hasattr(model, "province"):
        query = query.filter(model.province == user.province)

    return query
