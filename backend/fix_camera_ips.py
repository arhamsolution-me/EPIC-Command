#!/usr/bin/env python3
"""
Quick repair script to remap camera RTSP stream URLs in database and sync MediaMTX.
Usage:
    python3 fix_camera_ips.py [NEW_NVR_IP]
Example:
    python3 fix_camera_ips.py 192.168.1.128
"""
import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models import Camera, NVR
from media.manager import media_manager

target_ip = sys.argv[1].strip() if len(sys.argv) > 1 else "192.168.1.128"

print(f"[*] Remapping camera RTSP streams to direct NVR IP: {target_ip}...")
db = SessionLocal()
try:
    nvrs = db.query(NVR).all()
    for n in nvrs:
        print(f"  [+] NVR #{n.id} ({n.name}): IP {n.ip} -> {target_ip}")
        n.ip = target_ip
        n.rtsp_port = 554

    cameras = db.query(Camera).all()
    updated = 0
    for c in cameras:
        orig_rtsp = c.rtsp_stream_url or ""
        orig_sub = c.sub_stream_url or ""
        # Replace whatever host is currently between @ and :554 or port
        if c.rtsp_stream_url:
            c.rtsp_stream_url = re.sub(r'@[^:/]+:', f'@{target_ip}:', c.rtsp_stream_url)
        if c.sub_stream_url:
            c.sub_stream_url = re.sub(r'@[^:/]+:', f'@{target_ip}:', c.sub_stream_url)
        if orig_rtsp != c.rtsp_stream_url or orig_sub != c.sub_stream_url:
            updated += 1

    db.commit()
    print(f"[✓] Successfully updated {updated} camera streams in database.")

    print("[*] Syncing MediaMTX configuration with direct NVR streams...")
    media_manager.sync_from_database()
    print("[✓] MediaMTX synced and reloaded successfully!")
    print(f"[✓] Done! Cameras are now streaming directly from {target_ip}:554.")
except Exception as e:
    print(f"[!] Error: {e}")
    import traceback
    traceback.print_exc()
finally:
    db.close()
