import requests
from requests.auth import HTTPDigestAuth
import xml.etree.ElementTree as ET
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

try:
    from backend.database import get_db
    from backend.models import Camera, NVR
except ImportError:
    from database import get_db
    from models import Camera, NVR

router = APIRouter(prefix="/api/ptz", tags=["PTZ"])

# Cache HTTP sessions for fast Keep-Alive and cached Digest Authentication (< 20ms)
_session_cache = {}


def get_cached_session(ip: str, user: str, pwd: str) -> requests.Session:
    key = f"{user}@{ip}"
    if key not in _session_cache:
        s = requests.Session()
        s.auth = HTTPDigestAuth(user, pwd)
        _session_cache[key] = s
    return _session_cache[key]


import time

class PTZControlRequest(BaseModel):
    action: str  # 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'pan_up_left', 'pan_up_right', 'pan_down_left', 'pan_down_right', 'zoom_in', 'zoom_out', 'stop', 'move'
    pan: Optional[int] = 0     # -100 to 100
    tilt: Optional[int] = 0    # -100 to 100
    zoom: Optional[int] = 0    # -100 to 100
    speed: Optional[int] = 50  # 1 to 100 (user slider)
    step_duration_ms: Optional[int] = None  # Optional duration in ms for nudge/step click (e.g. 350ms)


class PresetActionRequest(BaseModel):
    preset_id: int
    name: Optional[str] = None


@router.post("/control/{camera_id}")
def control_camera_ptz(camera_id: int, req: PTZControlRequest, db: Session = Depends(get_db)):
    """
    Continuous Move & Step PTZ Control (Pan, Tilt, Zoom, Stop).
    Communicates directly with NVR / Camera via Hikvision ISAPI.
    """
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found.")

    nvr = camera.nvr
    if not nvr:
        raise HTTPException(status_code=404, detail="Parent NVR not found.")

    user_speed = max(1, min(100, req.speed or 50))

    # Calibrate Pan & Tilt speed across 1-100 without deadzone:
    # Hikvision speed domes have deadband below 15.
    # 1% -> 15 (gentle, visible step), 50% -> 57, 100% -> 100.
    calibrated_speed = int(14 + (user_speed / 100.0) * 86)

    # User requirement: "zoom bht slow krna ha sab bht slow slow kam krta ha"
    # Optical zoom on Hikvision PTZ cameras must be ultra-slow and smooth (1 to 8 scale):
    calibrated_zoom = max(1, min(8, int(round(1 + (user_speed / 100.0) * 7))))

    pan = 0
    tilt = 0
    zoom = 0

    if req.action == "stop":
        pan = 0
        tilt = 0
        zoom = 0
    elif req.action == "pan_left":
        pan = -calibrated_speed
    elif req.action == "pan_right":
        pan = calibrated_speed
    elif req.action == "tilt_up":
        tilt = calibrated_speed
    elif req.action == "tilt_down":
        tilt = -calibrated_speed
    elif req.action == "pan_up_left":
        pan = -calibrated_speed
        tilt = calibrated_speed
    elif req.action == "pan_up_right":
        pan = calibrated_speed
        tilt = calibrated_speed
    elif req.action == "pan_down_left":
        pan = -calibrated_speed
        tilt = -calibrated_speed
    elif req.action == "pan_down_right":
        pan = calibrated_speed
        tilt = -calibrated_speed
    elif req.action == "zoom_in":
        zoom = calibrated_zoom
    elif req.action == "zoom_out":
        zoom = -calibrated_zoom
    elif req.action == "move":
        pan = max(-100, min(100, req.pan or 0))
        tilt = max(-100, min(100, req.tilt or 0))
        zoom = max(-100, min(100, req.zoom or 0))

    def make_xml(p, t, z):
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<PTZData version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
    <pan>{p}</pan>
    <tilt>{t}</tilt>
    <zoom>{z}</zoom>
</PTZData>"""

    url = f"http://{nvr.ip}:{nvr.port}/ISAPI/PTZCtrl/channels/{camera.channel_number}/continuous"
    session = get_cached_session(nvr.ip, nvr.username, nvr.password or "")

    try:
        # Step Move Mode: when duration is specified (e.g. click nudge)
        if req.step_duration_ms and req.step_duration_ms > 0 and req.action != "stop":
            duration_s = min(1.5, max(0.1, req.step_duration_ms / 1000.0))
            # Start movement
            res_start = session.put(
                url,
                data=make_xml(pan, tilt, zoom),
                headers={"Content-Type": "application/xml"},
                timeout=1.8
            )
            time.sleep(duration_s)
            # Stop movement
            res_stop = session.put(
                url,
                data=make_xml(0, 0, 0),
                headers={"Content-Type": "application/xml"},
                timeout=1.8
            )
            return {
                "success": res_stop.status_code in [200, 204],
                "action": req.action,
                "step": True,
                "duration_ms": req.step_duration_ms,
                "pan": pan,
                "tilt": tilt,
                "zoom": zoom
            }

        # Continuous Move Mode
        res = session.put(
            url,
            data=make_xml(pan, tilt, zoom),
            headers={"Content-Type": "application/xml"},
            timeout=1.8
        )
        if res.status_code in [200, 204]:
            return {"success": True, "action": req.action, "pan": pan, "tilt": tilt, "zoom": zoom}
        else:
            return {"success": False, "status_code": res.status_code, "detail": res.text[:120]}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"PTZ communication failed: {str(e)}"
        )


@router.get("/presets/{camera_id}")
def get_camera_presets(camera_id: int, db: Session = Depends(get_db)):
    """Fetch all saved presets for the camera."""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found.")

    nvr = camera.nvr
    if not nvr:
        raise HTTPException(status_code=404, detail="Parent NVR not found.")

    url = f"http://{nvr.ip}:{nvr.port}/ISAPI/PTZCtrl/channels/{camera.channel_number}/presets"
    session = get_cached_session(nvr.ip, nvr.username, nvr.password or "")

    try:
        res = session.get(url, timeout=2.0)
        presets = []
        if res.status_code == 200 and "<PTZPreset" in res.text:
            root = ET.fromstring(res.text)
            ns = {'h': 'http://www.hikvision.com/ver20/XMLSchema'}
            for p in root.findall('h:PTZPreset', ns):
                pid_el = p.find('h:id', ns)
                if pid_el is None:
                    continue
                name_el = p.find('h:presetName', ns)
                presets.append({
                    "id": int(pid_el.text),
                    "name": name_el.text if name_el is not None and name_el.text else f"Preset {pid_el.text}"
                })
        return {"presets": presets}
    except Exception as e:
        return {"presets": []}


@router.post("/presets/{camera_id}/goto")
def goto_preset(camera_id: int, req: PresetActionRequest, db: Session = Depends(get_db)):
    """Instruct the camera to move to a pre-saved preset position."""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found.")

    nvr = camera.nvr
    if not nvr:
        raise HTTPException(status_code=404, detail="Parent NVR not found.")

    url = f"http://{nvr.ip}:{nvr.port}/ISAPI/PTZCtrl/channels/{camera.channel_number}/presets/{req.preset_id}/goto"
    session = get_cached_session(nvr.ip, nvr.username, nvr.password or "")

    try:
        res = session.put(url, timeout=2.0)
        return {"success": res.status_code in [200, 204], "status": res.status_code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/presets/{camera_id}/set")
def set_preset(camera_id: int, req: PresetActionRequest, db: Session = Depends(get_db)):
    """Save current motor position as a preset."""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found.")

    nvr = camera.nvr
    if not nvr:
        raise HTTPException(status_code=404, detail="Parent NVR not found.")

    name = req.name or f"Preset {req.preset_id}"
    xml_payload = f"""<?xml version="1.0" encoding="UTF-8"?>
<PTZPreset version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
    <id>{req.preset_id}</id>
    <presetName>{name}</presetName>
</PTZPreset>"""

    url = f"http://{nvr.ip}:{nvr.port}/ISAPI/PTZCtrl/channels/{camera.channel_number}/presets/{req.preset_id}"
    session = get_cached_session(nvr.ip, nvr.username, nvr.password or "")

    try:
        res = session.put(url, data=xml_payload, headers={"Content-Type": "application/xml"}, timeout=2.0)
        return {"success": res.status_code in [200, 204], "name": name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
