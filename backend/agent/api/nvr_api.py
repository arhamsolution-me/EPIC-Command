import ipaddress
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

try:
    from backend.database import get_db
    from backend.models import Agent, NVR, Camera
    from backend.agent.nvr.scanner import probe_nvr
    from backend.media.manager import media_manager
    from backend.auth.dependencies import get_current_user, require_superadmin
    from backend.models import User
except ImportError:
    from database import get_db
    from models import Agent, NVR, Camera
    from agent.nvr.scanner import probe_nvr
    from media.manager import media_manager
    from auth.dependencies import get_current_user, require_superadmin
    from models import User

router = APIRouter(prefix="/api/nvr", tags=["NVR"])


def _validate_nvr_ip(ip: str) -> str:
    """F-11: Reject loopback, link-local, multicast, and unspecified IP ranges to prevent SSRF."""
    ip = (ip or "").strip()
    if not ip:
        raise HTTPException(status_code=400, detail="IP address is required.")
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid IP address: {ip}")
    if addr.is_loopback or addr.is_link_local or addr.is_multicast or addr.is_unspecified:
        raise HTTPException(status_code=400, detail="IP address is in a prohibited range.")
    return ip


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
def probe_nvr_endpoint(
    req: ProbeRequest,
    current_user: User = Depends(require_superadmin),  # F-01 + F-11: SuperAdmin + IP validation
):
    """
    Step 1: Check NVR reachability and auto-discover cameras & RTSP streams.
    Requires Super Admin. IP validated against SSRF-prone ranges.
    """
    validated_ip = _validate_nvr_ip(req.ip)
    if not req.username:
        raise HTTPException(status_code=400, detail="Username is required.")

    result = probe_nvr(
        ip=validated_ip,
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
def confirm_and_save_nvr(
    req: ConfirmNVRRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),  # F-01: SuperAdmin only
):
    """
    Step 2: Confirm and save NVR and its cameras into PostgreSQL.
    Requires at least one Agent to exist.
    """
    validated_ip = _validate_nvr_ip(req.ip)

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

    raw_name = req.name.strip() if req.name and req.name.strip() else None
    if raw_name:
        if " - " in raw_name and any(c.isdigit() for c in raw_name):
            nvr_name = raw_name.split(" - ")[0].strip() or (target_agent.name if (target_agent and target_agent.name) else "NVR Device")
        else:
            nvr_name = raw_name
    else:
        nvr_name = target_agent.name if (target_agent and target_agent.name) else "NVR Device"

    def clean_loc(val):
        return val.strip() if (val and isinstance(val, str) and val.strip() not in ("—", "-", "None")) else None

    prov = clean_loc(req.province) or clean_loc(target_agent.province)
    cty = clean_loc(req.city) or clean_loc(target_agent.city)
    ara = clean_loc(req.area) or clean_loc(target_agent.area)
    ste = clean_loc(req.site) or clean_loc(target_agent.site)
    vend = req.vendor or "HIKVISION"

    existing_nvr = None
    if target_agent:
        existing_nvr = db.query(NVR).filter(NVR.agent_id == target_agent.id).first()
    if not existing_nvr:
        existing_nvr = db.query(NVR).filter(NVR.ip == validated_ip).first()
    if not existing_nvr and nvr_name:
        existing_nvr = db.query(NVR).filter(NVR.name == nvr_name).first()

    if existing_nvr:
        existing_nvr.agent_id = target_agent.id
        existing_nvr.name = nvr_name
        existing_nvr.ip = validated_ip
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
        db.query(Camera).filter(Camera.nvr_id == existing_nvr.id).delete()
        nvr = existing_nvr
    else:
        nvr = NVR(
            agent_id=target_agent.id,
            name=nvr_name,
            ip=validated_ip,
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

    obsolete_nvrs = db.query(NVR).filter(
        NVR.id != nvr.id,
        (NVR.agent_id == target_agent.id) | (NVR.ip == validated_ip) | (NVR.name == nvr.name)
    ).all()
    for obs in obsolete_nvrs:
        db.query(Camera).filter(Camera.nvr_id == obs.id).delete()
        db.delete(obs)

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

    try:
        media_manager.sync_from_database()
    except Exception as e:
        print(f"[MediaMTX] Auto-sync after save warning: {e}")

    return {
        "success": True,
        "message": f"NVR '{nvr.name}' and {len(req.cameras)} cameras successfully saved to database!",
        "nvr": nvr.to_dict()
    }


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


@router.get("/media/status")
def get_media_status(current_user: User = Depends(get_current_user)):
    """Check MediaMTX streaming engine status. Requires auth."""
    return {
        "running": media_manager.is_running(),
        "webrtc_port": media_manager.webrtc_port,
        "hls_port": media_manager.hls_port,
        "rtsp_port": media_manager.rtsp_port,
        "api_port": media_manager.api_port
    }


@router.post("/media/sync")
def sync_media_mtx(current_user: User = Depends(require_superadmin)):
    """Manually force-sync all cameras to MediaMTX. SuperAdmin only."""
    try:
        media_manager.sync_from_database()
        return {
            "success": True,
            "message": "MediaMTX synchronized with database successfully.",
            "running": media_manager.is_running()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/webrtc/{camera_id}")
def get_camera_webrtc_stream(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # F-02: auth required
):
    """
    Get ultra-low latency WebRTC stream endpoints (MediaMTX engine).
    Requires authenticated user scoped to the camera's agent.
    """
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found.")

    if not current_user.is_superadmin:
        nvr = camera.nvr
        if not nvr or current_user.assigned_agent_id != nvr.agent_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this camera stream.")

    if not media_manager.is_running():
        media_manager.start()

    urls = media_manager.get_stream_urls(camera_id)
    return {
        "camera_id": camera.id,
        "camera_name": camera.name,
        **urls
    }


@router.get("/stream/{camera_id}")
def stream_camera(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # F-02: auth required
):
    """Live stream video proxy fallback (MJPEG). Requires auth scoped to camera's agent."""
    from fastapi.responses import StreamingResponse
    try:
        from backend.agent.nvr.streamer import generate_mjpeg_stream
    except ImportError:
        from agent.nvr.streamer import generate_mjpeg_stream

    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found.")

    if not current_user.is_superadmin:
        nvr = camera.nvr
        if not nvr or current_user.assigned_agent_id != nvr.agent_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this camera stream.")

    stream_url = camera.sub_stream_url if camera.sub_stream_url else camera.rtsp_stream_url

    return StreamingResponse(
        generate_mjpeg_stream(stream_url, camera.name),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


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
def update_nvr(
    nvr_id: int,
    req: UpdateNVRRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),  # F-01: SuperAdmin only
):
    """Update NVR device details."""
    nvr = db.query(NVR).filter(NVR.id == nvr_id).first()
    if not nvr:
        raise HTTPException(status_code=404, detail="NVR not found.")
    old_ip = nvr.ip
    ip_changed = False
    if req.name is not None and req.name.strip(): nvr.name = req.name.strip()
    if req.ip is not None and req.ip.strip() and req.ip.strip() != old_ip:
        nvr.ip = _validate_nvr_ip(req.ip)
        ip_changed = True
    if req.port is not None: nvr.port = req.port
    if req.rtsp_port is not None: nvr.rtsp_port = req.rtsp_port
    if req.username is not None and req.username.strip(): nvr.username = req.username.strip()
    if req.password is not None: nvr.password = req.password
    if req.province is not None: nvr.province = req.province
    if req.city is not None: nvr.city = req.city
    if req.area is not None: nvr.area = req.area
    if req.site is not None: nvr.site = req.site

    if ip_changed:
        import re
        cams = db.query(Camera).filter(Camera.nvr_id == nvr_id).all()
        for c in cams:
            if c.rtsp_stream_url:
                c.rtsp_stream_url = re.sub(r'@[^:/]+:', f'@{nvr.ip}:', c.rtsp_stream_url)
            if c.sub_stream_url:
                c.sub_stream_url = re.sub(r'@[^:/]+:', f'@{nvr.ip}:', c.sub_stream_url)

    db.commit()
    db.refresh(nvr)

    if ip_changed:
        try:
            media_manager.sync_from_database()
        except Exception as e:
            print(f"[MediaMTX] Auto-sync after NVR update notice: {e}")

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
def delete_nvr(
    nvr_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),  # F-01: SuperAdmin only
):
    """Delete an NVR and its cameras."""
    nvr = db.query(NVR).filter(NVR.id == nvr_id).first()
    if not nvr:
        raise HTTPException(status_code=404, detail="NVR not found.")

    db.query(Camera).filter(Camera.nvr_id == nvr_id).delete()
    db.delete(nvr)
    db.commit()

    try:
        media_manager.sync_from_database()
    except Exception as e:
        print(f"[MediaMTX] Auto-sync after delete warning: {e}")

    return {"success": True, "message": f"NVR {nvr_id} deleted successfully."}
