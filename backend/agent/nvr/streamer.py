import time
import os
import socket
import threading
import urllib.parse
from datetime import datetime
from typing import Dict, Optional
import cv2
import numpy as np

# Force OpenCV ffmpeg into ultra-low-latency, zero-buffer mode
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
    "rtsp_transport;tcp|"
    "fflags;nobuffer|"
    "flags;low_delay|"
    "max_delay;0|"
    "probesize;32|"
    "analyzeduration;0|"
    "stimeout;2000000"
)
# Suppress ffmpeg initial keyframe warning noise
os.environ["OPENCV_FFMPEG_LOGLEVEL"] = "-8"
os.environ["AV_LOG_FORCE_NOCOLOR"] = "1"


def is_host_reachable(ip: str, port: int, timeout: float = 0.5) -> bool:
    """Fast socket check before touching RTSP stream."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            return s.connect_ex((ip, port)) == 0
    except Exception:
        return False


def create_status_frame(title: str, subtitle: str = "", cam_name: str = "", width: int = 640, height: int = 360) -> bytes:
    """Clean surveillance status frame without duplicate timestamp overlay."""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[:] = (11, 15, 25)

    # Subtle grid
    for y in range(0, height, 40):
        cv2.line(img, (0, y), (width, y), (20, 28, 45), 1)
    for x in range(0, width, 40):
        cv2.line(img, (x, 0), (x, height), (20, 28, 45), 1)

    cx, cy = width // 2, height // 2 - 20
    cv2.circle(img, (cx, cy), 30, (30, 41, 59), 2)
    cv2.circle(img, (cx, cy), 6, (16, 185, 129), -1)

    cv2.putText(img, title, (cx - 95, cy + 55), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (241, 245, 249), 2, cv2.LINE_AA)
    if subtitle:
        cv2.putText(img, subtitle, (cx - 120, cy + 85), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (148, 163, 184), 1, cv2.LINE_AA)
    if cam_name:
        cv2.putText(img, cam_name, (18, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (241, 245, 249), 1, cv2.LINE_AA)

    _, jpeg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])
    return jpeg.tobytes()


class CameraStreamWorker:
    """
    Ultra-low latency RTSP worker.
    Continuously flushes and consumes packets to provide immediate, direct live frames.
    """

    def __init__(self, rtsp_url: str, cam_name: str = ""):
        self.rtsp_url = rtsp_url
        self.cam_name = cam_name
        self.latest_jpeg: Optional[bytes] = None
        self.is_running = False
        self.thread: Optional[threading.Thread] = None
        self.clients_count = 0
        self.lock = threading.Lock()

        parsed = urllib.parse.urlparse(rtsp_url)
        self.host = parsed.hostname or "127.0.0.1"
        self.port = parsed.port or 554

        if parsed.password and "@" in parsed.password:
            clean_pass = urllib.parse.quote(parsed.password, safe="")
            self.clean_url = rtsp_url.replace(parsed.password, clean_pass, 1)
        else:
            self.clean_url = rtsp_url

    def start(self):
        with self.lock:
            self.clients_count += 1
            if not self.is_running:
                self.is_running = True
                self.thread = threading.Thread(target=self._worker_loop, daemon=True)
                self.thread.start()

    def stop(self):
        with self.lock:
            self.clients_count = max(0, self.clients_count - 1)

    def _worker_loop(self):
        cap = None
        try:
            while self.is_running:
                # Socket reachability check
                if not is_host_reachable(self.host, self.port, timeout=0.5):
                    self.latest_jpeg = create_status_frame("CAMERA OFFLINE", f"Unreachable: {self.host}:{self.port}", self.cam_name)
                    time.sleep(1.0)
                    if cap is not None:
                        cap.release()
                        cap = None
                    continue

                # Open stream with zero buffer
                if cap is None or not cap.isOpened():
                    self.latest_jpeg = create_status_frame("CONNECTING...", f"Opening stream...", self.cam_name)
                    cap = cv2.VideoCapture(self.clean_url, cv2.CAP_FFMPEG)
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

                # Direct low-latency frame grab
                ret = cap.grab()
                if not ret:
                    self.latest_jpeg = create_status_frame("NO SIGNAL", "Waiting for video...", self.cam_name)
                    time.sleep(0.1)
                    continue

                ret, frame = cap.retrieve()
                if not ret or frame is None:
                    continue

                # Resize if > 1280 to keep bandwidth low & latency minimal
                h, w = frame.shape[:2]
                if w > 1280:
                    frame = cv2.resize(frame, (1280, int(h * 1280 / w)))

                # Encode JPEG without overlaying extra timestamp (since video already has timestamp)
                ret, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 72])
                if ret:
                    self.latest_jpeg = jpeg.tobytes()

                # Extremely small yield sleep to yield CPU without adding latency
                time.sleep(0.005)

        except Exception:
            pass
        finally:
            if cap is not None:
                cap.release()
            self.is_running = False


class StreamManager:
    _workers: Dict[str, CameraStreamWorker] = {}
    _lock = threading.Lock()

    @classmethod
    def get_worker(cls, rtsp_url: str, cam_name: str = "") -> CameraStreamWorker:
        with cls._lock:
            if rtsp_url not in cls._workers:
                cls._workers[rtsp_url] = CameraStreamWorker(rtsp_url, cam_name)
            worker = cls._workers[rtsp_url]
            worker.start()
            return worker


def generate_mjpeg_stream(rtsp_url: str, cam_name: str = ""):
    """Direct, zero-latency frame generator."""
    worker = StreamManager.get_worker(rtsp_url, cam_name)
    try:
        while True:
            frame_bytes = worker.latest_jpeg
            if frame_bytes is None:
                frame_bytes = create_status_frame("INITIALIZING...", "Connecting to stream...", cam_name)

            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n")
            time.sleep(0.033)  # ~30 FPS smooth rate
    except Exception:
        pass
    finally:
        worker.stop()
