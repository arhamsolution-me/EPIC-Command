import os
import sys

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

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.on_event("startup")
def startup_event():
    # Run database initialization and core seeds
    try:
        seed_database()
    except Exception as e:
        print(f"[Startup] DB init notice: {e}")

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
