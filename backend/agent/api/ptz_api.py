import requests
from requests.auth import HTTPDigestAuth
import time
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

# F-08: Use defusedxml to prevent XML entity expansion / injection attacks
try:
    import defusedxml.ElementTree as ET
except ImportError:
    import xml.etree.ElementTree as ET  # fallback if defusedxml not installed

try:
    from backend.database import get_db
    from backend.models import Camera, NVR, User
    from backend.auth.dependencies import get_current_user, require_superadmin
except ImportError:
    from database import get_db
    from models import Camera, NVR, User
    from auth.dependencies import get_current_user, require_superadmin

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
def control_camera_ptz(
    camera_id: int,
    req: PTZControlRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Continuous Move & Step PTZ Control (Pan, Tilt, Zoom, Stop).
    Supports both Dahua CGI and Hikvision ISAPI transparently.
    """
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found.")

    nvr = camera.nvr
    if not nvr:
        raise HTTPException(status_code=404, detail="Parent NVR not found.")

    # F-02: Enforce agent scope for non-superadmin users
    if not getattr(current_user, 'is_superadmin', False) and getattr(current_user, 'assigned_agent_id', None) != nvr.agent_id:
        raise HTTPException(status_code=403, detail="Access denied: camera not in your assigned agent scope.")

    user_speed = max(1, min(100, req.speed or 50))
    vendor = (nvr.vendor or "").upper()
    session = get_cached_session(nvr.ip, nvr.username, nvr.password or "")

    # ==========================================
    # DAHUA PTZ CONTROL VIA CGI PROTOCOL
    # ==========================================
    if "DAHUA" in vendor:
        dahua_code_map = {
            "pan_left": "Left",
            "pan_right": "Right",
            "tilt_up": "Up",
            "tilt_down": "Down",
            "pan_up_left": "LeftUp",
            "pan_up_right": "RightUp",
            "pan_down_left": "LeftDown",
            "pan_down_right": "RightDown",
            "zoom_in": "ZoomAdd",
            "zoom_out": "ZoomDec",
        }
        d_code = dahua_code_map.get(req.action, "Up")
        # Dahua speed scale 1-8
        d_speed = max(1, min(8, int(round(1 + (user_speed / 100.0) * 7))))

        try:
            if req.step_duration_ms and req.step_duration_ms > 0 and req.action != "stop":
                duration_s = min(1.5, max(0.1, req.step_duration_ms / 1000.0))
                url_start = f"http://{nvr.ip}:{nvr.port}/cgi-bin/ptz.cgi?action=start&channel={camera.channel_number}&code={d_code}&arg1=0&arg2={d_speed}&arg3=0"
                session.get(url_start, timeout=1.8)
                time.sleep(duration_s)
                url_stop = f"http://{nvr.ip}:{nvr.port}/cgi-bin/ptz.cgi?action=stop&channel={camera.channel_number}&code={d_code}&arg1=0&arg2=0&arg3=0"
                res_stop = session.get(url_stop, timeout=1.8)
                return {
                    "success": res_stop.status_code in [200, 204] or "OK" in res_stop.text,
                    "action": req.action,
                    "step": True,
                    "duration_ms": req.step_duration_ms,
                    "vendor": "DAHUA"
                }

            if req.action == "stop":
                url_stop = f"http://{nvr.ip}:{nvr.port}/cgi-bin/ptz.cgi?action=stop&channel={camera.channel_number}&code=Up&arg1=0&arg2=0&arg3=0"
                res = session.get(url_stop, timeout=1.8)
            else:
                url_start = f"http://{nvr.ip}:{nvr.port}/cgi-bin/ptz.cgi?action=start&channel={camera.channel_number}&code={d_code}&arg1=0&arg2={d_speed}&arg3=0"
                res = session.get(url_start, timeout=1.8)

            return {
                "success": res.status_code in [200, 204] or "OK" in res.text,
                "action": req.action,
                "vendor": "DAHUA"
            }
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Dahua PTZ communication failed: {str(e)}"
            )

    # ==========================================
    # HIKVISION PTZ CONTROL VIA ISAPI PROTOCOL
    # ==========================================
    # Calibrate Pan & Tilt speed across 1-100 without deadzone
    calibrated_speed = int(14 + (user_speed / 100.0) * 86)
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

    try:
        # Step Move Mode: when duration is specified (e.g. click nudge)
        if req.step_duration_ms and req.step_duration_ms > 0 and req.action != "stop":
            duration_s = min(1.5, max(0.1, req.step_duration_ms / 1000.0))
            session.put(
                url,
                data=make_xml(pan, tilt, zoom),
                headers={"Content-Type": "application/xml"},
                timeout=1.8
            )
            time.sleep(duration_s)
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
                "zoom": zoom,
                "vendor": "HIKVISION"
            }

        # Continuous Move Mode
        res = session.put(
            url,
            data=make_xml(pan, tilt, zoom),
            headers={"Content-Type": "application/xml"},
            timeout=1.8
        )
        if res.status_code in [200, 204]:
            return {"success": True, "action": req.action, "pan": pan, "tilt": tilt, "zoom": zoom, "vendor": "HIKVISION"}
        else:
            # Fallback to Dahua CGI if Hikvision ISAPI returns 404
            if res.status_code in [404, 400]:
                dahua_code_map = {
                    "pan_left": "Left", "pan_right": "Right", "tilt_up": "Up", "tilt_down": "Down",
                    "pan_up_left": "LeftUp", "pan_up_right": "RightUp", "pan_down_left": "LeftDown", "pan_down_right": "RightDown",
                    "zoom_in": "ZoomAdd", "zoom_out": "ZoomDec"
                }
                d_code = dahua_code_map.get(req.action, "Up")
                d_speed = max(1, min(8, int(round(1 + (user_speed / 100.0) * 7))))
                d_url = f"http://{nvr.ip}:{nvr.port}/cgi-bin/ptz.cgi?action={'stop' if req.action == 'stop' else 'start'}&channel={camera.channel_number}&code={d_code}&arg1=0&arg2={0 if req.action == 'stop' else d_speed}&arg3=0"
                res_d = session.get(d_url, timeout=1.8)
                if res_d.status_code in [200, 204] or "OK" in res_d.text:
                    return {"success": True, "action": req.action, "vendor": "DAHUA_FALLBACK"}

            return {"success": False, "status_code": res.status_code, "detail": res.text[:120]}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"PTZ communication failed: {str(e)}"
        )


@router.get("/presets/{camera_id}")
def get_camera_presets(camera_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Fetch all saved presets for the camera."""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found.")

    nvr = camera.nvr
    if not nvr:
        raise HTTPException(status_code=404, detail="Parent NVR not found.")

    if not getattr(current_user, 'is_superadmin', False) and getattr(current_user, 'assigned_agent_id', None) != nvr.agent_id:
        raise HTTPException(status_code=403, detail="Access denied: camera not in your assigned agent scope.")

    vendor = (nvr.vendor or "").upper()
    session = get_cached_session(nvr.ip, nvr.username, nvr.password or "")

    # For Dahua: presets 1-8 standard
    if "DAHUA" in vendor:
        return {"presets": [{"id": i, "name": f"Preset {i}"} for i in range(1, 9)]}

    url = f"http://{nvr.ip}:{nvr.port}/ISAPI/PTZCtrl/channels/{camera.channel_number}/presets"
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
    except Exception:
        return {"presets": [{"id": i, "name": f"Preset {i}"} for i in range(1, 9)]}


@router.post("/presets/{camera_id}/goto")
def goto_preset(camera_id: int, req: PresetActionRequest, db: Session = Depends(get_db), current_user: User = Depends(require_superadmin)):
    """Instruct the camera to move to a pre-saved preset position."""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found.")

    nvr = camera.nvr
    if not nvr:
        raise HTTPException(status_code=404, detail="Parent NVR not found.")

    vendor = (nvr.vendor or "").upper()
    session = get_cached_session(nvr.ip, nvr.username, nvr.password or "")

    if "DAHUA" in vendor:
        url_d = f"http://{nvr.ip}:{nvr.port}/cgi-bin/ptz.cgi?action=start&channel={camera.channel_number}&code=GotoPreset&arg1=0&arg2={req.preset_id}&arg3=0"
        try:
            res = session.get(url_d, timeout=2.0)
            return {"success": res.status_code in [200, 204] or "OK" in res.text, "preset_id": req.preset_id}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    url = f"http://{nvr.ip}:{nvr.port}/ISAPI/PTZCtrl/channels/{camera.channel_number}/presets/{req.preset_id}/goto"
    try:
        res = session.put(url, timeout=2.0)
        return {"success": res.status_code in [200, 204], "status": res.status_code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/presets/{camera_id}/set")
def set_preset(camera_id: int, req: PresetActionRequest, db: Session = Depends(get_db), current_user: User = Depends(require_superadmin)):
    """Save current motor position as a preset."""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found.")

    nvr = camera.nvr
    if not nvr:
        raise HTTPException(status_code=404, detail="Parent NVR not found.")

    name = req.name or f"Preset {req.preset_id}"
    vendor = (nvr.vendor or "").upper()
    session = get_cached_session(nvr.ip, nvr.username, nvr.password or "")

    if "DAHUA" in vendor:
        url_d = f"http://{nvr.ip}:{nvr.port}/cgi-bin/ptz.cgi?action=start&channel={camera.channel_number}&code=SetPreset&arg1=0&arg2={req.preset_id}&arg3=0"
        try:
            res = session.get(url_d, timeout=2.0)
            return {"success": res.status_code in [200, 204] or "OK" in res.text, "name": name}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    xml_payload = f"""<?xml version="1.0" encoding="UTF-8"?>
<PTZPreset version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
    <id>{req.preset_id}</id>
    <presetName>{name}</presetName>
</PTZPreset>"""

    url = f"http://{nvr.ip}:{nvr.port}/ISAPI/PTZCtrl/channels/{camera.channel_number}/presets/{req.preset_id}"
    try:
        res = session.put(url, data=xml_payload, headers={"Content-Type": "application/xml"}, timeout=2.0)
        return {"success": res.status_code in [200, 204], "name": name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
