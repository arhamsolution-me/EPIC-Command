import os
import sys
from fastapi import FastAPI, Request

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from seed import seed_database
from agent.api.nvr_api import router as nvr_router
from agent.api.agent_api import router as agent_router
from agent.api.ptz_api import router as ptz_router
from api.auth_api import router as auth_router
from api.user_api import router as user_router
from api.role_api import router as role_router
from api.location_api import router as location_router
from api.audit_api import router as audit_router
from api.dashboard_api import router as dashboard_router

app = FastAPI(
    title="EPIC Command - Central Surveillance & RBAC Management API",
    version="2.0.0",
    description="EPIC Command Backend with Super Admin Dashboard, Dynamic RBAC, Multi-Location Scoping & MediaMTX Engine"
)

# F-06: Restrict CORS to explicit origins (never wildcard with credentials)
_raw_cors = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _raw_cors.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# F-07: Security response headers + F-09: suppress server version banner
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = ("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors 'none';"
    )
    response.headers.pop("server", None)  # F-09: suppress Uvicorn/server version banner
    return response

# Register All API Routers cleanly
app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(user_router)
app.include_router(role_router)
app.include_router(location_router)
app.include_router(audit_router)
app.include_router(agent_router)
app.include_router(nvr_router)
app.include_router(ptz_router)


def reconcile_duplicate_agents():
    """Merge duplicate agents sharing identical names into a single primary agent."""
    try:
        from database import get_db
        from models import Agent, NVR, User
        db = next(get_db())
        agents = db.query(Agent).order_by(Agent.id.asc()).all()
        name_map = {}
        for ag in agents:
            key = ag.name.strip().lower()
            if key not in name_map:
                name_map[key] = ag
            else:
                primary = name_map[key]
                dup = ag
                print(f"[Reconcile] Merging duplicate Agent '{dup.name}' (ID: {dup.id}) into Primary (ID: {primary.id})")
                # Move all NVRs from dup to primary
                db.query(NVR).filter(NVR.agent_id == dup.id).update({NVR.agent_id: primary.id}, synchronize_session=False)
                # Reassign any users assigned to dup to primary
                db.query(User).filter(User.assigned_agent_id == dup.id).update({User.assigned_agent_id: primary.id}, synchronize_session=False)
                db.delete(dup)
        db.commit()
    except Exception as e:
        print(f"[Reconcile] Startup agent notice: {e}")


@app.on_event("startup")
def startup_event():
    # Run database initialization and core seeds
    try:
        seed_database()
    except Exception as e:
        print(f"[Startup] DB init notice: {e}")

    # Auto-merge duplicate agents and link NVRs
    reconcile_duplicate_agents()

    # Initialize and sync MediaMTX stream engine natively
    try:
        from media.manager import media_manager
        media_manager.sync_from_database()
    except Exception as e:
        print(f"[MediaMTX] Startup sync notice: {e}")


@app.on_event("shutdown")
def shutdown_event():
    try:
        from media.manager import media_manager
        media_manager.stop()
    except Exception:
        pass


@app.get("/")
def root():
    return {
        "system": "EPIC Command Surveillance Engine",
        "version": "2.0.0",
        "status": "running",
        "docs_url": "/docs"
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/epic-agent.py")
def get_root_epic_agent():
    """Serve epic-agent.py directly from root URL for 1-Click Launchers."""
    from pathlib import Path
    from fastapi.responses import FileResponse, HTTPException
    possible_paths = [
        Path(__file__).resolve().parent.parent / "epic-agent.py",
        Path(__file__).resolve().parent / "epic-agent.py",
        Path("/opt/epic-command/epic-agent.py"),
        Path("/opt/epic-command/frontend/public/epic-agent.py"),
        Path("/opt/epic-command/frontend/dist/epic-agent.py"),
    ]
    for p in possible_paths:
        if p.exists() and p.is_file():
            return FileResponse(p, media_type="text/x-python", filename="epic-agent.py")
    raise HTTPException(status_code=404, detail="epic-agent.py not found on server.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
