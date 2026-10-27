import os
import sys
import time
import socket
import urllib.parse
import subprocess
from pathlib import Path
from typing import List, Optional, Dict, Any

# Root paths for media folder
MEDIA_DIR = Path(__file__).resolve().parent
EXECUTABLE_PATH = MEDIA_DIR / "mediamtx.exe"
CONFIG_PATH = MEDIA_DIR / "mediamtx.yml"
LOG_PATH = MEDIA_DIR / "mediamtx.log"


def clean_rtsp_url(url: str) -> str:
    """
    Safely encode special characters (especially '@') in RTSP credentials
    so MediaMTX parses host and path correctly.
    """
    if not url:
        return ""
    try:
        parsed = urllib.parse.urlsplit(url)
        if parsed.password and "@" in parsed.password:
            quoted_pass = urllib.parse.quote(parsed.password, safe="")
            user = parsed.username or ""
            host_port = parsed.netloc.split("@")[-1]
            new_netloc = f"{user}:{quoted_pass}@{host_port}"
            return urllib.parse.urlunsplit((parsed.scheme, new_netloc, parsed.path, parsed.query, parsed.fragment))
        return url
    except Exception:
        return url


class MediaMTXManager:
    """
    Cross-platform Process & Config Manager for MediaMTX (Windows & Linux).
    Runs MediaMTX natively (Zero Docker) to provide ultra-low latency WebRTC streaming.
    All files remain strictly organized inside backend/media/ and /opt/ on Linux.
    """

    def __init__(self, media_dir: Optional[Path] = None):
        self.media_dir = media_dir or MEDIA_DIR
        self.exe_path = self.media_dir / "mediamtx.exe" if sys.platform == "win32" else Path("/opt/mediamtx")
        self.log_path = self.media_dir / "mediamtx.log"
        self.process: Optional[subprocess.Popen] = None
        self.webrtc_port = int(os.getenv("MEDIAMTX_WEBRTC_PORT", "8889"))
        self.hls_port = int(os.getenv("MEDIAMTX_HLS_PORT", "8888"))
        self.rtsp_port = int(os.getenv("MEDIAMTX_RTSP_PORT", "8554"))
        self.api_port = int(os.getenv("MEDIAMTX_API_PORT", "9997"))

        # Determine primary config path:
        env_cfg = os.getenv("MEDIAMTX_CONFIG_PATH")
        if env_cfg and Path(env_cfg).parent.exists():
            self.config_path = Path(env_cfg)
        elif sys.platform != "win32" and Path("/opt/mediamtx.yml").exists():
            self.config_path = Path("/opt/mediamtx.yml")
        else:
            self.config_path = self.media_dir / "mediamtx.yml"

    def is_port_in_use(self, port: int, host: str = "127.0.0.1") -> bool:
        """Check if MediaMTX port is listening."""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.5)
                return s.connect_ex((host, port)) == 0
        except Exception:
            return False

    def is_running(self) -> bool:
        """Check if MediaMTX is currently running and listening on WebRTC port."""
        if self.process is not None and self.process.poll() is None:
            return True
        return self.is_port_in_use(self.webrtc_port)

    def generate_config(self, cameras: List[Any]) -> str:
        """
        Generate standard MediaMTX v1.9.3 YAML configuration with camera paths.
        Uses low-latency TCP transport and sourceOnDemand.
        """
        lines = [
            "# MediaMTX Configuration for EPIC Command (WebRTC & RTSP Stream Engine)",
            "# Native Production - Zero Docker Required",
            "api: true",
            f"apiAddress: :{self.api_port}",
            "",
            "hls: true",
            f"hlsAddress: :{self.hls_port}",
            "",
            "webrtc: true",
            f"webrtcAddress: :{self.webrtc_port}",
            "webrtcICEServers2: []",
            "",
            "rtsp: true",
            f"rtspAddress: :{self.rtsp_port}",
            "protocols:",
            "  - tcp",
            "",
            "logLevel: info",
            "logDestinations:",
            "  - stdout",
            "",
            "readTimeout: 10s",
            "writeTimeout: 10s",
            "",
            "paths:"
        ]

        for cam in cameras:
            cam_id = getattr(cam, "id", None) or (cam.get("id") if isinstance(cam, dict) else None)
            if not cam_id:
                continue

            sub_url = getattr(cam, "sub_stream_url", None) or (cam.get("sub_stream_url") if isinstance(cam, dict) else None)
            main_url = getattr(cam, "rtsp_stream_url", None) or (cam.get("rtsp_stream_url") if isinstance(cam, dict) else None)

            # Prioritize sub-stream for smooth, responsive live grid monitoring
            stream_url = sub_url or main_url
            if not stream_url:
                continue

            clean_url = clean_rtsp_url(stream_url)

            # Standard camera WebRTC stream path
            lines.append(f"  camera_{cam_id}:")
            lines.append(f"    source: {clean_url}")
            lines.append("    sourceOnDemand: true")
            lines.append("    rtspTransport: tcp")

            # Main stream path for HD viewing
            if main_url:
                clean_main = clean_rtsp_url(main_url)
                lines.append(f"  camera_{cam_id}_main:")
                lines.append(f"    source: {clean_main}")
                lines.append("    sourceOnDemand: true")
                lines.append("    rtspTransport: tcp")

        # Always include all_others fallback for publisher/test streams
        lines.append("  all_others:")
        lines.append("    source: publisher")

        return "\n".join(lines) + "\n"

    def write_config(self, cameras: List[Any]):
        """Write cameras configuration across standard target locations."""
        content = self.generate_config(cameras)

        targets = [self.media_dir / "mediamtx.yml"]
        if sys.platform != "win32":
            opt_path = Path("/opt/mediamtx.yml")
            if opt_path.exists() or Path("/opt").exists():
                targets.append(opt_path)

        if self.config_path not in targets:
            targets.append(self.config_path)

        for target in targets:
            try:
                # If target is a symlink, write directly to resolve real target
                with open(target, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"[MediaMTX] Wrote configuration to {target}")
            except Exception as e:
                print(f"[MediaMTX] Notice writing config to {target}: {e}")

    def sync_via_api(self, cameras: List[Any]) -> bool:
        """
        Dynamically push camera paths into running MediaMTX via its REST API (port 9997).
        Provides instant zero-restart path registration.
        """
        if not self.is_port_in_use(self.api_port):
            return False

        try:
            import httpx
            with httpx.Client(timeout=2.0) as client:
                for cam in cameras:
                    cam_id = getattr(cam, "id", None) or (cam.get("id") if isinstance(cam, dict) else None)
                    if not cam_id:
                        continue
                    sub_url = getattr(cam, "sub_stream_url", None) or (cam.get("sub_stream_url") if isinstance(cam, dict) else None)
                    main_url = getattr(cam, "rtsp_stream_url", None) or (cam.get("rtsp_stream_url") if isinstance(cam, dict) else None)
                    stream_url = sub_url or main_url
                    if not stream_url:
                        continue

                    clean_url = clean_rtsp_url(stream_url)
                    body = {
                        "source": clean_url,
                        "sourceOnDemand": True,
                        "rtspTransport": "tcp"
                    }

                    # Primary path: camera_{id}
                    path_name = f"camera_{cam_id}"
                    r = client.post(f"http://127.0.0.1:{self.api_port}/v3/config/paths/add/{path_name}", json=body)
                    if r.status_code == 400:
                        client.patch(f"http://127.0.0.1:{self.api_port}/v3/config/paths/patch/{path_name}", json=body)

                    # Main stream path: camera_{id}_main
                    if main_url:
                        clean_main = clean_rtsp_url(main_url)
                        main_body = {
                            "source": clean_main,
                            "sourceOnDemand": True,
                            "rtspTransport": "tcp"
                        }
                        r_main = client.post(f"http://127.0.0.1:{self.api_port}/v3/config/paths/add/{path_name}_main", json=main_body)
                        if r_main.status_code == 400:
                            client.patch(f"http://127.0.0.1:{self.api_port}/v3/config/paths/patch/{path_name}_main", json=main_body)

            print(f"[MediaMTX] Successfully injected {len(cameras)} camera paths via REST API.")
            return True
        except Exception as e:
            print(f"[MediaMTX] REST API path sync notice: {e}")
            return False

    def start(self):
        """Start MediaMTX binary in the background natively or via systemd."""
        if self.is_running():
            print(f"[MediaMTX] Already running on port {self.webrtc_port}.")
            return True

        if sys.platform != "win32":
            # On Linux: First attempt systemctl start
            try:
                subprocess.run(["systemctl", "start", "mediamtx"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                time.sleep(0.5)
                if self.is_port_in_use(self.webrtc_port):
                    print(f"[MediaMTX] Started via systemd service.")
                    return True
            except Exception:
                pass

            # If systemctl not used, check for binary in /opt or local
            linux_bin = Path("/opt/mediamtx") if Path("/opt/mediamtx").exists() else (self.media_dir / "mediamtx")
            if linux_bin.exists():
                try:
                    log_file = open(self.log_path, "a", encoding="utf-8")
                    self.process = subprocess.Popen(
                        [str(linux_bin), str(self.config_path)],
                        cwd=str(self.media_dir),
                        stdout=log_file,
                        stderr=subprocess.STDOUT
                    )
                    time.sleep(0.5)
                    return self.is_running()
                except Exception as e:
                    print(f"[MediaMTX] Failed to start Linux binary: {e}")
                    return False
            return False

        # Windows
        if not self.exe_path.exists():
            print(f"[MediaMTX] Executable not found at {self.exe_path}")
            return False

        try:
            log_file = open(self.log_path, "a", encoding="utf-8")
            kwargs: Dict[str, Any] = {
                "cwd": str(self.media_dir),
                "stdout": log_file,
                "stderr": subprocess.STDOUT,
                "creationflags": 0x00000008 | 0x00000200
            }
            self.process = subprocess.Popen(
                [str(self.exe_path.resolve()), str(self.config_path.resolve())],
                **kwargs
            )
            print(f"[MediaMTX] Started native process PID {self.process.pid} (logging to {self.log_path.name})")

            # Wait briefly to confirm startup
            for _ in range(10):
                time.sleep(0.3)
                if self.is_port_in_use(self.webrtc_port):
                    print(f"[MediaMTX] Ready and listening on WebRTC port {self.webrtc_port}")
                    return True

            return self.is_running()
        except Exception as e:
            print(f"[MediaMTX] Failed to launch: {e}")
            return False

    def stop(self):
        """Stop MediaMTX process."""
        if self.process is not None:
            try:
                self.process.terminate()
                self.process.wait(timeout=2)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            self.process = None

        if sys.platform == "win32":
            try:
                subprocess.run(
                    ["taskkill", "/F", "/IM", "mediamtx.exe"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
            except Exception:
                pass
        else:
            try:
                subprocess.run(["systemctl", "stop", "mediamtx"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            except Exception:
                pass

    def restart(self):
        """Restart MediaMTX to reload updated paths."""
        if sys.platform != "win32":
            try:
                subprocess.run(["systemctl", "restart", "mediamtx"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                time.sleep(0.5)
                if self.is_port_in_use(self.webrtc_port):
                    print(f"[MediaMTX] Successfully restarted systemd service.")
                    return True
            except Exception:
                pass

        self.stop()
        time.sleep(0.5)
        return self.start()

    def sync_from_database(self):
        """Query all active cameras from DB, update mediamtx.yml, push to REST API, and ensure MediaMTX is running."""
        try:
            try:
                from backend.database import SessionLocal
                from backend.models import Camera
            except ImportError:
                from database import SessionLocal
                from models import Camera

            db = SessionLocal()
            try:
                cameras = db.query(Camera).all()
                self.write_config(cameras)
                print(f"[MediaMTX] Synced {len(cameras)} cameras to configuration files.")

                # Try dynamic REST API injection first
                api_synced = self.sync_via_api(cameras)

                # Ensure service is running or reload config
                if self.is_running():
                    if not api_synced:
                        self.restart()
                else:
                    self.start()
            finally:
                db.close()
        except Exception as e:
            print(f"[MediaMTX] Error syncing from database: {e}")

    def get_stream_urls(self, camera_id: int) -> Dict[str, str]:
        """Get streaming endpoints for a camera."""
        stream_path = f"camera_{camera_id}"
        return {
            "stream_path": stream_path,
            "webrtc_url": f"http://127.0.0.1:{self.webrtc_port}/{stream_path}",
            "whep_url": f"http://127.0.0.1:{self.webrtc_port}/{stream_path}/whep",
            "hls_url": f"http://127.0.0.1:{self.hls_port}/{stream_path}/index.m3u8",
            "rtsp_url": f"rtsp://127.0.0.1:{self.rtsp_port}/{stream_path}"
        }


# Global singleton instance
media_manager = MediaMTXManager()
