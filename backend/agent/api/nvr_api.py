from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Import database and models
try:
    from backend.database import get_db
    from backend.models import Agent, NVR, Camera
    from backend.agent.nvr.scanner import probe_nvr
    from backend.media.manager import media_manager
except ImportError:
    from database import get_db
    from models import Agent, NVR, Camera
    from agent.nvr.scanner import probe_nvr
    from media.manager import media_manager

router = APIRouter(prefix="/api/nvr", tags=["NVR"])


class ProbeRequest(BaseModel):
    ip: str
    username: str
    password: Optional[str] = ""
    port: Optional[int] = None
    rtsp_port: Optional[int] = None


class CameraItem(BaseModel):
    channel_number: int
    name: str
    rtsp_stream_url: str
    sub_stream_url: Optional[str] = None
    status: str = "reachable"
    is_ptz: Optional[bool] = False


class ConfirmNVRRequest(BaseModel):
    agent_id: Optional[int] = None
    name: Optional[str] = None
    ip: str
    port: int = 80
    rtsp_port: int = 554
    username: str
    password: Optional[str] = ""
    status: Optional[str] = "online"
    vendor: Optional[str] = "HIKVISION"
    province: Optional[str] = None
    city: Optional[str] = None
    area: Optional[str] = None
    site: Optional[str] = None
    cameras: List[CameraItem] = []


@router.post("/probe")
def probe_nvr_endpoint(req: ProbeRequest):
    """
    Step 1: Check NVR reachability and auto-discover cameras & RTSP streams.
    """
    if not req.ip or not req.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="IP address and username are required."
        )

    result = probe_nvr(
        ip=req.ip,
        username=req.username,
        password=req.password or "",
        port=req.port,
        rtsp_port=req.rtsp_port
    )

    if not result.get("reachable"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error", "Unable to connect to NVR. Please verify the IP address, credentials, or network connection.")
        )

    return result


@router.post("/confirm")
def confirm_and_save_nvr(req: ConfirmNVRRequest, db: Session = Depends(get_db)):
    """
    Step 2: Confirm and save NVR and its cameras into PostgreSQL.
    Requires at least one Agent to exist.
    """
    # Enforce agent prerequisite
    target_agent = None
    if req.agent_id:
        target_agent = db.query(Agent).filter(Agent.id == req.agent_id).first()
    if not target_agent:
        target_agent = db.query(Agent).first()

    if not target_agent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Agent found. You must create an Agent first before adding NVR devices."
        )

    # Simple 1-word NVR name without IP address
    raw_name = req.name.strip() if req.name and req.name.strip() else None
    if raw_name:
        # Strip out any appended IP if present
        if " - " in raw_name and any(c.isdigit() for c in raw_name):
            nvr_name = raw_name.split(" - ")[0].strip() or "Synavos"
        else:
            nvr_name = raw_name
    else:
        nvr_name = target_agent.name if (target_agent and target_agent.name) else "Synavos"

    def clean_loc(val):
        return val.strip() if (val and isinstance(val, str) and val.strip() not in ("—", "-", "None")) else None

    prov = clean_loc(req.province) or clean_loc(target_agent.province)
    cty = clean_loc(req.city) or clean_loc(target_agent.city)
    ara = clean_loc(req.area) or clean_loc(target_agent.area)
    ste = clean_loc(req.site) or clean_loc(target_agent.site)
    vend = req.vendor or "HIKVISION"

    # Check if this NVR IP already exists in DB
    existing_nvr = db.query(NVR).filter(NVR.ip == req.ip).first()
    if existing_nvr:
        # Update existing
        existing_nvr.agent_id = target_agent.id
        existing_nvr.name = nvr_name
        existing_nvr.port = req.port
        existing_nvr.rtsp_port = req.rtsp_port
        existing_nvr.username = req.username
        existing_nvr.password = req.password or ""
        existing_nvr.status = req.status or "online"
        existing_nvr.total_channels = len(req.cameras)
        existing_nvr.vendor = vend
        if prov: existing_nvr.province = prov
        if cty: existing_nvr.city = cty
        if ara: existing_nvr.area = ara
        if ste: existing_nvr.site = ste
        
        # Clear old cameras to re-populate
        db.query(Camera).filter(Camera.nvr_id == existing_nvr.id).delete()
        nvr = existing_nvr
    else:
        # Create new NVR record
        nvr = NVR(
            agent_id=target_agent.id,
            name=nvr_name,
            ip=req.ip,
            port=req.port,
            rtsp_port=req.rtsp_port,
            username=req.username,
            password=req.password or "",
            status=req.status or "online",
            total_channels=len(req.cameras),
            vendor=vend,
            province=prov,
            city=cty,
            area=ara,
            site=ste
        )
        db.add(nvr)
        db.flush()

    # Add cameras
    for cam in req.cameras:
        new_cam = Camera(
            nvr_id=nvr.id,
            channel_number=cam.channel_number,
            name=cam.name,
            rtsp_stream_url=cam.rtsp_stream_url,
            sub_stream_url=cam.sub_stream_url,
            status=cam.status,
            is_ptz=bool(cam.is_ptz)
        )
        db.add(new_cam)

    db.commit()
    db.refresh(nvr)

    # Sync MediaMTX with new cameras automatically
    try:
        media_manager.sync_from_database()
    except Exception as e:
        print(f"[MediaMTX] Auto-sync after save warning: {e}")

    return {
        "success": True,
        "message": f"NVR '{nvr.name}' and {len(req.cameras)} cameras successfully saved to database!",
        "nvr": nvr.to_dict()
    }


try:
    from backend.auth.dependencies import get_current_user
    from backend.models import User
except ImportError:
    from auth.dependencies import get_current_user
    from models import User


@router.get("/list")
def list_nvrs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List configured NVRs scoped to current user's assigned agent."""
    query = db.query(NVR)
    if not current_user.is_superadmin:
        if current_user.assigned_agent_id:
            query = query.filter(NVR.agent_id == current_user.assigned_agent_id)
        else:
            query = query.filter(NVR.id == -1)
    nvrs = query.order_by(NVR.id.desc()).all()
    return {"nvrs": [n.to_dict() for n in nvrs]}


class UpdateNVRRequest(BaseModel):
    name: Optional[str] = None
    ip: Optional[str] = None
    port: Optional[int] = None
    rtsp_port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    province: Optional[str] = None
    city: Optional[str] = None
    area: Optional[str] = None
    site: Optional[str] = None


@router.put("/{nvr_id}")
def update_nvr(nvr_id: int, req: UpdateNVRRequest, db: Session = Depends(get_db)):
    """Update NVR device details."""
    nvr = db.query(NVR).filter(NVR.id == nvr_id).first()
    if not nvr:
        raise HTTPException(status_code=404, detail="NVR not found.")
    if req.name is not None and req.name.strip(): nvr.name = req.name.strip()
    if req.ip is not None and req.ip.strip(): nvr.ip = req.ip.strip()
    if req.port is not None: nvr.port = req.port
    if req.rtsp_port is not None: nvr.rtsp_port = req.rtsp_port
    if req.username is not None and req.username.strip(): nvr.username = req.username.strip()
    if req.password is not None: nvr.password = req.password
    if req.province is not None: nvr.province = req.province
    if req.city is not None: nvr.city = req.city
    if req.area is not None: nvr.area = req.area
    if req.site is not None: nvr.site = req.site
    db.commit()
    db.refresh(nvr)
    return {"success": True, "message": "NVR updated successfully.", "nvr": nvr.to_dict()}


@router.get("/{nvr_id}")
def get_nvr(
    nvr_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific NVR with all cameras scoped to user."""
    nvr = db.query(NVR).filter(NVR.id == nvr_id).first()
    if not nvr:
        raise HTTPException(status_code=404, detail="NVR not found.")
    if not current_user.is_superadmin and current_user.assigned_agent_id != nvr.agent_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this NVR.")
    return nvr.to_dict()


@router.delete("/{nvr_id}")
def delete_nvr(nvr_id: int, db: Session = Depends(get_db)):
    """Delete an NVR and its cameras."""
    nvr = db.query(NVR).filter(NVR.id == nvr_id).first()
    if not nvr:
        raise HTTPException(status_code=404, detail="NVR not found.")

    # Explicitly remove all associated cameras first to guarantee no FK violations
    db.query(Camera).filter(Camera.nvr_id == nvr_id).delete()
    db.delete(nvr)
    db.commit()

    # Sync MediaMTX to remove deleted paths
    try:
        media_manager.sync_from_database()
    except Exception as e:
        print(f"[MediaMTX] Auto-sync after delete warning: {e}")

    return {"success": True, "message": f"NVR {nvr_id} deleted successfully."}


@router.get("/webrtc/{camera_id}")
def get_camera_webrtc_stream(camera_id: int, db: Session = Depends(get_db)):
    """
    Get ultra-low latency WebRTC stream endpoints (MediaMTX engine).
    Zero Docker required.
    """
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found.")

    # Ensure MediaMTX is alive
    if not media_manager.is_running():
        media_manager.start()

    urls = media_manager.get_stream_urls(camera_id)
    return {
        "camera_id": camera.id,
        "camera_name": camera.name,
        **urls
    }


@router.get("/media/status")
def get_media_status():
    """Check MediaMTX streaming engine status."""
    return {
        "running": media_manager.is_running(),
        "webrtc_port": media_manager.webrtc_port,
        "hls_port": media_manager.hls_port,
        "rtsp_port": media_manager.rtsp_port,
        "api_port": media_manager.api_port
    }


@router.get("/stream/{camera_id}")
def stream_camera(camera_id: int, db: Session = Depends(get_db)):
    """
    Live stream video proxy fallback (MJPEG multipart stream).
    """
    from fastapi.responses import StreamingResponse
    try:
        from backend.agent.nvr.streamer import generate_mjpeg_stream
    except ImportError:
        from agent.nvr.streamer import generate_mjpeg_stream

    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found.")

    stream_url = camera.sub_stream_url if camera.sub_stream_url else camera.rtsp_stream_url

    return StreamingResponse(
        generate_mjpeg_stream(stream_url, camera.name),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
