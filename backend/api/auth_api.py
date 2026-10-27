from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_
from database import get_db
from models import User
from auth.security import verify_password, hash_password, create_access_token
from auth.dependencies import get_current_user
from services.audit_service import log_audit_event

router = APIRouter(prefix="/api/auth", tags=["Auth"])


class ChangePasswordRequest(BaseModel):
    current_password: Optional[str] = None
    new_password: str
    confirm_password: Optional[str] = None


class LoginRequest(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    password: str


@router.post("/login")
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """Authenticate user with email or username and password, return JWT token."""
    identifier = (req.email or req.username or "").strip()
    if not identifier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address is required."
        )

    user = db.query(User).filter(
        or_(
            User.email.ilike(identifier),
            User.username.ilike(identifier)
        )
    ).first()

    if not user or not verify_password(req.password, user.password_hash):
        log_audit_event(
            db=db,
            action="USER_LOGIN_FAILED",
            resource_type="user",
            details={"attempted_identifier": identifier},
            ip_address=request.client.host if request.client else "127.0.0.1"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact Super Admin."
        )

    # Generate token
    token = create_access_token(data={"sub": str(user.id), "username": user.username})

    # Log successful login
    log_audit_event(
        db=db,
        action="USER_LOGIN",
        user=user,
        resource_type="user",
        resource_id=user.id,
        details={"status": "success"},
        ip_address=request.client.host if request.client else "127.0.0.1"
    )

    return {
        "token": token,
        "token_type": "bearer",
        "user": user.to_dict()
    }


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Return profile and permissions for currently authenticated user."""
    return {"user": current_user.to_dict()}


@router.post("/logout")
def logout(request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Log out event."""
    log_audit_event(
        db=db,
        action="USER_LOGOUT",
        user=current_user,
        resource_type="user",
        resource_id=current_user.id,
        ip_address=request.client.host if request.client else "127.0.0.1"
    )
    return {"message": "Logged out successfully"}


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change user password. Mandatory for new users on first login or accessible via user profile."""
    new_pw = (req.new_password or "").strip()
    if not new_pw:
        raise HTTPException(status_code=400, detail="New password is required.")
    if len(new_pw) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long.")
    if req.confirm_password and req.confirm_password.strip() != new_pw:
        raise HTTPException(status_code=400, detail="Passwords do not match.")

    # If user does not have must_change_password flag, require verifying their current password
    if not getattr(current_user, "must_change_password", False):
        if not req.current_password or not verify_password(req.current_password, current_user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")
    elif req.current_password:
        if not verify_password(req.current_password, current_user.password_hash):
            raise HTTPException(status_code=400, detail="Current temporary password is incorrect.")

    current_user.password_hash = hash_password(new_pw)
    current_user.must_change_password = False
    db.commit()
    db.refresh(current_user)

    log_audit_event(
        db=db,
        action="USER_PASSWORD_CHANGED",
        user=current_user,
        resource_type="user",
        resource_id=current_user.id,
        details={"status": "success"}
    )

    return {
        "success": True,
        "message": "Password updated successfully.",
        "user": current_user.to_dict()
    }

