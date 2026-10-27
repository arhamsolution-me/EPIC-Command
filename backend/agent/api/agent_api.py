import re
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

try:
    from backend.database import get_db
    from backend.models import Agent, NVR, Camera
    from backend.media.manager import media_manager
except ImportError:
    from database import get_db
    from models import Agent, NVR, Camera
    from media.manager import media_manager

router = APIRouter(prefix="/api/agent", tags=["Agent"])


class CreateAgentRequest(BaseModel):
    name: str
    status: Optional[str] = "active"


@router.post("/create")
def create_agent(req: CreateAgentRequest, db: Session = Depends(get_db)):
    """Create a new monitoring agent."""
    if not req.name or not req.name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agent name is required."
        )

    agent = Agent(
        name=req.name.strip(),
        status=req.status or "active",
        province=None,
        city=None,
        area=None,
        site=None
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)

    return {
        "success": True,
        "message": f"Agent '{agent.name}' created successfully!",
        "agent": agent.to_dict()
    }


try:
    from backend.auth.dependencies import get_current_user
    from backend.models import User
except ImportError:
    from auth.dependencies import get_current_user
    from models import User


@router.get("/list")
def list_agents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List registered agents scoped to the logged-in user."""
    query = db.query(Agent)
    if not current_user.is_superadmin:
        if current_user.assigned_agent_id:
            query = query.filter(Agent.id == current_user.assigned_agent_id)
        else:
            query = query.filter(Agent.id == -1)
    agents = query.order_by(Agent.id.desc()).all()
    return {"agents": [a.to_dict() for a in agents]}


@router.get("/{agent_id}")
def get_agent(
    agent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get single agent details with NVRs scoped to user."""
    if not current_user.is_superadmin and current_user.assigned_agent_id != agent_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this Agent.")
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found.")
    return agent.to_dict()


class UpdateAgentRequest(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    province: Optional[str] = None
    city: Optional[str] = None
    area: Optional[str] = None
    site: Optional[str] = None


@router.put("/{agent_id}")
def update_agent(agent_id: int, req: UpdateAgentRequest, db: Session = Depends(get_db)):
    """Update an existing agent's name, status, or location details."""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found.")
    if req.name is not None and req.name.strip():
        agent.name = req.name.strip()
    if req.status is not None:
        agent.status = req.status
    if req.province is not None:
        agent.province = req.province
    if req.city is not None:
        agent.city = req.city
    if req.area is not None:
        agent.area = req.area
    if req.site is not None:
        agent.site = req.site
    db.commit()
    db.refresh(agent)
    return {"success": True, "message": f"Agent {agent_id} updated successfully.", "agent": agent.to_dict()}


@router.delete("/{agent_id}")
def delete_agent(agent_id: int, db: Session = Depends(get_db)):
    """
    Delete an agent and cascade delete all its associated NVRs & cameras.
    Also syncs MediaMTX streaming paths.
    """
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found.")

    # Find all NVR IDs for this agent
    nvr_ids = [n.id for n in agent.nvrs]

    # Explicitly clean up cameras first for database consistency
    if nvr_ids:
        db.query(Camera).filter(Camera.nvr_id.in_(nvr_ids)).delete(synchronize_session=False)
        db.query(NVR).filter(NVR.agent_id == agent_id).delete(synchronize_session=False)

    db.delete(agent)
    db.commit()

    # Re-sync MediaMTX paths
    try:
        media_manager.sync_from_database()
    except Exception as e:
        print(f"[MediaMTX] Auto-sync after agent delete warning: {e}")

    return {"success": True, "message": f"Agent {agent_id} and all associated NVRs deleted successfully."}


@router.get("/download/epic-agent.py")
def download_epic_agent_file():
    """Serve standalone epic-agent.py directly for easy client-side installation."""
    possible_paths = [
        Path(__file__).resolve().parent.parent.parent.parent / "epic-agent.py",
        Path(__file__).resolve().parent.parent.parent / "epic-agent.py",
        Path("/opt/epic-command/epic-agent.py"),
        Path("/opt/epic-command/frontend/public/epic-agent.py")
    ]
    for p in possible_paths:
        if p.exists():
            return FileResponse(p, media_type="text/x-python", filename="epic-agent.py")
    raise HTTPException(status_code=404, detail="epic-agent.py not found on server.")


@router.get("/{agent_id}/status")
def get_agent_status(agent_id: int, db: Session = Depends(get_db)):
    """Check agent deployment status, associated NVRs, and camera count."""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found.")

    nvrs = [n.to_dict() for n in agent.nvrs]
    total_cameras = sum(len(n.get("cameras", [])) for n in nvrs)

    return {
        "agent_id": agent.id,
        "name": agent.name,
        "status": agent.status,
        "has_nvr": len(nvrs) > 0,
        "nvr_count": len(nvrs),
        "total_cameras": total_cameras,
        "nvrs": nvrs
    }


@router.get("/{agent_id}/launcher.bat")
def download_agent_launcher(agent_id: int, request: Request, db: Session = Depends(get_db)):
    """
    Generate and serve a customized 1-Click Windows batch launcher (.bat) for this Agent.
    When executed on any branch PC, it opens CMD, pulls epic-agent.py, prompts for local NVR IP,
    and registers all camera streams to the central server without VPN or NAT port forwarding.
    """
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found.")

    # Determine external server URL from request headers
    host_header = request.headers.get("x-forwarded-host") or request.headers.get("host") or "192.168.1.101"
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "http"
    server_url = f"{proto}://{host_header}".rstrip("/")

    bat_content = f"""@echo off
title EPIC Command - Edge Surveillance Agent ({agent.name})
color 0A

echo =================================================================
echo       EPIC COMMAND - EDGE SURVEILLANCE AGENT LAUNCHER
echo       Zero-VPN ^| Zero-NAT Port Forwarding ^| True Multi-Branch
echo =================================================================
echo.
echo Branch Agent   : {agent.name}
echo Central Server : {server_url}
echo.
echo [1/3] Checking Python installation on your PC...
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [!] Python is not installed or not in PATH!
    echo [*] Opening official Python download...
    powershell -Command "Start-Process 'https://www.python.org/downloads/'"
    echo.
    echo Please install Python (make sure to check 'Add python.exe to PATH')
    echo and double-click this launcher again!
    echo.
    pause
    exit /b 1
)

echo [✓] Python is available.
echo.
echo [2/3] Downloading latest Edge Agent from Central Server...
curl -s -O {server_url}/epic-agent.py
if not exist epic-agent.py (
    powershell -Command "Invoke-WebRequest -Uri '{server_url}/epic-agent.py' -OutFile 'epic-agent.py'"
)
if not exist epic-agent.py (
    curl -s -O {server_url}/api/agent/download/epic-agent.py
)

if not exist epic-agent.py (
    echo.
    echo [!] Could not download epic-agent.py from {server_url}.
    echo Please verify that this PC can reach {server_url}.
    pause
    exit /b 1
)

echo [✓] Edge Agent downloaded.
echo.
echo [3/3] Launching Edge Agent for Branch '{agent.name}'...
echo.
python epic-agent.py --server "{server_url}" --agent "{agent.name}"
pause
"""
    clean_name = re.sub(r'[^a-zA-Z0-9_-]', '_', agent.name)
    filename = f"launch-agent-{clean_name}.bat"
    return Response(
        content=bat_content.encode("utf-8"),
        media_type="application/x-bat",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

