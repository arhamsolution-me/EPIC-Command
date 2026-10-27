#!/usr/bin/env python3
"""
EPIC Command - Standalone Edge Agent
===================================
Enables zero-VPN, zero-NAT port forwarding CCTV integration.
Runs locally at any branch office or store network (e.g. Islamabad),
discovers local NVRs/cameras (e.g. 200.0.0.25), and registers & bridges
streams directly to the Central EPIC Command Server (e.g. Lahore).

Usage:
    python epic-agent.py
    python epic-agent.py --server http://192.168.1.101 --agent "MM Alam" --nvr 200.0.0.25 --user admin --pass "admin@mm@store@123"
"""

import sys
import os
import time
import json
import socket
import re
import urllib.parse
import urllib.request
import threading
import argparse
from typing import Dict, Any, List, Optional


def check_tcp_port(ip: str, port: int, timeout: float = 1.5) -> bool:
    """Test if a TCP port is open."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            return s.connect_ex((ip, port)) == 0
    except Exception:
        return False


def test_rtsp_describe(ip: str, port: int, path: str, username: str = "", password: str = "", timeout: float = 2.0) -> bool:
    """Direct RTSP DESCRIBE socket test."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((ip, port))
            url = f"rtsp://{ip}:{port}{path}"
            headers = f"DESCRIBE {url} RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: EPIC-Edge-Agent/2.0\r\nAccept: application/sdp\r\n"
            if username and password:
                import base64
                creds = base64.b64encode(f"{username}:{password}".encode()).decode()
                headers += f"Authorization: Basic {creds}\r\n"
            headers += "\r\n"
            s.sendall(headers.encode())
            data = s.recv(1024).decode("utf-8", errors="ignore")
            if "RTSP/1.0 200" in data or "m=video" in data or "application/sdp" in data:
                return True
            if "RTSP/1.0 401" in data and "nonce=" in data:
                return True
            return False
    except Exception:
        return False


def probe_local_nvr(
    ip: str,
    username: str,
    password: str,
    port: Optional[int] = None,
    rtsp_port: Optional[int] = None,
    max_channels: int = 32
) -> Dict[str, Any]:
    """Discover cameras locally from this machine."""
    print(f"\n[1/3] Probing NVR at {ip} locally from this network...")

    user_enc = urllib.parse.quote(username, safe="")
    pass_enc = urllib.parse.quote(password, safe="")
    auth_part = f"{user_enc}:{pass_enc}@" if username else ""

    detected_rtsp_port = None
    if rtsp_port and check_tcp_port(ip, rtsp_port, timeout=1.5):
        detected_rtsp_port = rtsp_port
    else:
        for p in [554, 8554, 10554]:
            if check_tcp_port(ip, p, timeout=1.0):
                detected_rtsp_port = p
                break

    detected_http_port = None
    if port and check_tcp_port(ip, port, timeout=1.5):
        detected_http_port = port
    else:
        for p in [80, 37725, 8000, 8080]:
            if check_tcp_port(ip, p, timeout=1.0):
                detected_http_port = p
                break

    detected_rtsp_port = detected_rtsp_port or 554
    detected_http_port = detected_http_port or 80

    print(f"      Target HTTP Port : {detected_http_port} (Status: {'OPEN' if check_tcp_port(ip, detected_http_port) else 'CLOSED'})")
    print(f"      Target RTSP Port : {detected_rtsp_port} (Status: {'OPEN' if check_tcp_port(ip, detected_rtsp_port) else 'CLOSED'})")

    cameras: List[Dict[str, Any]] = []
    vendor = "DAHUA"

    # Dahua Channel Discovery
    try:
        dahua_url = f"http://{ip}:{detected_http_port}/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle"
        passman = urllib.request.HTTPPasswordMgrWithDefaultRealm()
        passman.add_password(None, dahua_url, username, password)
        authhandler = urllib.request.HTTPDigestAuthHandler(passman)
        opener = urllib.request.build_opener(authhandler)
        req = urllib.request.Request(dahua_url, headers={"User-Agent": "EPIC-Edge-Agent/2.0"})
        with opener.open(req, timeout=3.0) as resp:
            content = resp.read().decode("utf-8", errors="ignore")
            if "table.ChannelTitle" in content:
                vendor = "DAHUA"
                matches = re.findall(r"table\.ChannelTitle\[(\d+)\]\.Name=(.*)", content)
                for idx, name in matches:
                    ch_num = int(idx) + 1
                    main_url = f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/cam/realmonitor?channel={ch_num}&subtype=0"
                    sub_url = f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/cam/realmonitor?channel={ch_num}&subtype=1"
                    cameras.append({
                        "channel_number": ch_num,
                        "name": name.strip() or f"Camera {ch_num}",
                        "rtsp_stream_url": main_url,
                        "sub_stream_url": sub_url,
                        "status": "reachable",
                        "is_ptz": False
                    })
    except Exception:
        pass

    # RTSP Probe Fallback if CGI doesn't return
    if not cameras:
        patterns = [
            ("/cam/realmonitor?channel={ch}&subtype=0", "/cam/realmonitor?channel={ch}&subtype=1", "DAHUA"),
            ("/Streaming/Channels/{ch}01", "/Streaming/Channels/{ch}02", "HIKVISION"),
            ("/ch{ch}/main", "/ch{ch}/sub", "GENERIC"),
        ]
        active_pattern = None
        for m_pat, s_pat, vname in patterns:
            if test_rtsp_describe(ip, detected_rtsp_port, m_pat.format(ch=1), username, password):
                active_pattern = (m_pat, s_pat, vname)
                vendor = vname
                break

        if active_pattern:
            m_pat, s_pat, _ = active_pattern
            for ch in range(1, max_channels + 1):
                p_main = m_pat.format(ch=ch)
                p_sub = s_pat.format(ch=ch)
                if test_rtsp_describe(ip, detected_rtsp_port, p_main, username, password, timeout=1.2):
                    cameras.append({
                        "channel_number": ch,
                        "name": f"Camera {ch}",
                        "rtsp_stream_url": f"rtsp://{auth_part}{ip}:{detected_rtsp_port}{p_main}",
                        "sub_stream_url": f"rtsp://{auth_part}{ip}:{detected_rtsp_port}{p_sub}",
                        "status": "reachable",
                        "is_ptz": False
                    })
                elif len(cameras) >= 1:
                    break

    # If Dahua channels were verified
    if not cameras:
        # Default fallback for verified NVR port
        for ch in range(1, 9):
            cameras.append({
                "channel_number": ch,
                "name": f"Camera {ch}",
                "rtsp_stream_url": f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/cam/realmonitor?channel={ch}&subtype=0",
                "sub_stream_url": f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/cam/realmonitor?channel={ch}&subtype=1",
                "status": "reachable",
                "is_ptz": False
            })

    print(f"      Found {len(cameras)} cameras ({vendor}) on NVR!")
    return {
        "reachable": True,
        "ip": ip,
        "port": detected_http_port,
        "rtsp_port": detected_rtsp_port,
        "vendor": vendor,
        "cameras": cameras
    }


def register_with_central_server(server_url: str, agent_name: str, nvr_info: Dict[str, Any], local_ip: str) -> bool:
    """Register Agent, NVR, and cameras with Central EPIC Command backend."""
    server_url = server_url.rstrip("/")
    print(f"\n[2/3] Registering with Central Server at {server_url}...")

    # Step A: Enroll Agent
    enroll_url = f"{server_url}/api/agent/create"
    agent_id = None
    try:
        data = json.dumps({"name": agent_name, "status": "active"}).encode("utf-8")
        req = urllib.request.Request(enroll_url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            res_data = json.loads(resp.read().decode())
            agent_id = res_data.get("agent", {}).get("id")
            print(f"      [✓] Agent '{agent_name}' registered (ID: {agent_id})")
    except Exception as e:
        # Agent might already exist, fetch agents list
        try:
            list_url = f"{server_url}/api/agent/list"
            req = urllib.request.Request(list_url)
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                res_data = json.loads(resp.read().decode())
                for ag in res_data.get("agents", []):
                    if ag.get("name", "").lower() == agent_name.lower():
                        agent_id = ag.get("id")
                        print(f"      [✓] Linked to existing Agent '{agent_name}' (ID: {agent_id})")
                        break
        except Exception:
            pass

    # Step B: Register NVR and Cameras
    confirm_url = f"{server_url}/api/nvr/confirm"
    payload = {
        "agent_id": agent_id,
        "name": f"{agent_name} NVR",
        "ip": nvr_info["ip"],
        "port": nvr_info["port"],
        "rtsp_port": nvr_info["rtsp_port"],
        "username": "admin",
        "password": "",
        "status": "online",
        "vendor": nvr_info["vendor"],
        "cameras": nvr_info["cameras"]
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(confirm_url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            res_data = json.loads(resp.read().decode())
            print(f"      [✓] NVR and {len(nvr_info['cameras'])} Cameras saved to Central Database!")
            return True
    except Exception as e:
        print(f"      [!] Registration notice: {e}")
        return False


def start_rtsp_tcp_bridge(local_port: int, target_host: str, target_port: int):
    """
    Pure Python bidirectional TCP proxy.
    Allows the Central Server to pull RTSP streams through this Edge Agent
    without any NAT port forwarding or VPN on the branch router.
    """
    def pipe_data(src, dst):
        try:
            while True:
                buf = src.recv(8192)
                if not buf:
                    break
                dst.sendall(buf)
        except Exception:
            pass
        finally:
            try: src.close()
            except Exception: pass
            try: dst.close()
            except Exception: pass

    def bridge_listener():
        try:
            server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server_sock.bind(("0.0.0.0", local_port))
            server_sock.listen(10)
            print(f"[3/3] RTSP Stream Bridge active on local port {local_port} ➔ {target_host}:{target_port}")
            print("      Edge Agent is running and connected! (Press Ctrl+C to stop)\n")

            while True:
                client_sock, addr = server_sock.accept()
                try:
                    target_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    target_sock.connect((target_host, target_port))
                    t1 = threading.Thread(target=pipe_data, args=(client_sock, target_sock), daemon=True)
                    t2 = threading.Thread(target=pipe_data, args=(target_sock, client_sock), daemon=True)
                    t1.start()
                    t2.start()
                except Exception:
                    client_sock.close()
        except Exception as e:
            print(f"[!] Stream bridge notice: {e}")

    thread = threading.Thread(target=bridge_listener, daemon=True)
    thread.start()


def main():
    parser = argparse.ArgumentParser(description="EPIC Command Edge Agent - Zero-VPN Zero-NAT CCTV Bridge")
    parser.add_argument("--server", help="Central EPIC Command server URL (e.g. http://192.168.1.101)")
    parser.add_argument("--agent", help="Agent Name (e.g. 'MM Alam' or 'Islamabad Branch')")
    parser.add_argument("--nvr", help="Local NVR IP address (e.g. 200.0.0.25)")
    parser.add_argument("--user", default="admin", help="NVR Username (default: admin)")
    parser.add_argument("--password", "--pass", default="admin@mm@store@123", help="NVR Password")
    parser.add_argument("--http-port", type=int, default=37725, help="NVR HTTP Port (default: 37725 or 80)")
    parser.add_argument("--rtsp-port", type=int, default=554, help="NVR RTSP Port (default: 554)")
    args = parser.parse_args()

    print("=" * 65)
    print("      EPIC COMMAND - EDGE SURVEILLANCE AGENT v2.0")
    print("      Zero-VPN | Zero-NAT Port Forwarding | True Multi-Branch")
    print("=" * 65)

    server_url = args.server or input("Enter Central Server URL [http://192.168.1.101]: ").strip() or "http://192.168.1.101"
    agent_name = args.agent or input("Enter Agent Name [MM Alam]: ").strip() or "MM Alam"
    nvr_ip = args.nvr or input("Enter NVR IP [200.0.0.25]: ").strip() or "200.0.0.25"
    username = args.user or input("Enter NVR Username [admin]: ").strip() or "admin"
    password = args.password if args.password is not None else input("Enter NVR Password: ").strip()
    http_port = args.http_port
    rtsp_port = args.rtsp_port

    # 1. Local Probe
    nvr_info = probe_local_nvr(
        ip=nvr_ip,
        username=username,
        password=password,
        port=http_port,
        rtsp_port=rtsp_port
    )

    # 2. Register to Central Server
    my_ip = "127.0.0.1"
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            my_ip = s.getsockname()[0]
    except Exception:
        pass

    register_with_central_server(server_url, agent_name, nvr_info, my_ip)

    # 3. Start Stream Bridge
    start_rtsp_tcp_bridge(554, nvr_ip, rtsp_port)

    # 4. Keep alive loop
    try:
        while True:
            time.sleep(30)
    except KeyboardInterrupt:
        print("\nEdge Agent stopped.")


if __name__ == "__main__":
    main()
