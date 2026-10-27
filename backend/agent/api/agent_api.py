from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
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


@router.get("/list")
def list_agents(db: Session = Depends(get_db)):
    """List all registered agents and their linked NVRs & cameras."""
    agents = db.query(Agent).order_by(Agent.id.desc()).all()
    return {"agents": [a.to_dict() for a in agents]}


@router.get("/{agent_id}")
def get_agent(agent_id: int, db: Session = Depends(get_db)):
    """Get single agent details with NVRs."""
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
