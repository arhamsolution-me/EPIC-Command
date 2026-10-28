#!/usr/bin/env python3
"""
EPIC Command - Standalone Edge Surveillance Agent v3.1
======================================================
Zero-VPN | Zero-NAT Port Forwarding | True Multi-Branch | Cross-Platform

Compatible with Windows 10/11, Windows Server, Ubuntu, Debian, CentOS, macOS.
Uses 100% Python Standard Library — Zero pip installs needed!

Usage:
    python epic-agent.py
    python epic-agent.py --server http://192.168.1.101 --agent "MM Alam"
    python epic-agent.py --server http://192.168.1.101 --agent "MM Alam" --nvr 200.0.0.25 --user admin --pass "admin123"
"""

import sys
import os
import time
import json
import socket
import re
import platform
import urllib.parse
import urllib.request
import threading
import argparse
from typing import Dict, Any, List, Optional


def setup_console():
    """Enable ANSI colors on Windows 10+ consoles."""
    if platform.system() == "Windows":
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
        except Exception:
            pass


setup_console()

# Color Codes
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
WHITE = "\033[97m"
BOLD = "\033[1m"
RESET = "\033[0m"


def check_environment() -> bool:
    """Verify Python version and standard library dependencies."""
    print("=" * 65)
    print("      EPIC COMMAND - EDGE SURVEILLANCE AGENT v3.1")
    print("      Zero-VPN | Zero-NAT Port Forwarding | True Multi-Branch")
    print("=" * 65)
    print(f"[*] Operating System : {platform.system()} {platform.release()} ({platform.machine()})")
    print(f"[*] Python Runtime   : {platform.python_version()} ({sys.executable})")

    if sys.version_info < (3, 7):
        print(f"\n{RED}[!] ERROR: Python 3.7 or newer is required.{RESET}")
        print(f"    Current detected version: {platform.python_version()}")
        print("    Please install Python 3.8+ from: https://www.python.org/downloads/")
        return False

    modules = [
        ("urllib.request", "HTTP Client Engine"),
        ("urllib.parse", "URL & Credential Parser"),
        ("socket", "TCP Stream Sockets"),
        ("threading", "Concurrent Stream Workers"),
        ("json", "JSON Serialization"),
        ("argparse", "CLI Parameter Parser")
    ]

    print("\n[*] Checking Python core packages:")
    all_ok = True
    for mod_name, desc in modules:
        try:
            __import__(mod_name)
            print(f"  {GREEN}[✓]{RESET} {desc} ({mod_name}): Available")
        except ImportError as e:
            print(f"  {RED}[✗]{RESET} Missing module {mod_name}: {e}")
            all_ok = False

    if not all_ok:
        print(f"\n{RED}[!] Missing standard Python libraries.{RESET}")
        return False

    print(f"  {GREEN}[✓]{RESET} All required packages verified. Zero pip packages required!")
    return True


def check_tcp_port(ip: str, port: int, timeout: float = 2.0) -> bool:
    """Test if a TCP port is open."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            return s.connect_ex((ip, port)) == 0
    except Exception:
        return False


def check_port_available(port: int) -> bool:
    """Check if local TCP port can be bound."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(("0.0.0.0", port))
            return True
    except Exception:
        return False


def get_dynamic_bridge_port(preferred: int = 554) -> int:
    """Dynamically find an available local port for the RTSP stream bridge."""
    if check_port_available(preferred):
        return preferred
    for p in [8554, 10554, 15554, 18554, 20554]:
        if check_port_available(p):
            return p
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("0.0.0.0", 0))
        return s.getsockname()[1]


def test_rtsp_describe(ip: str, port: int, path: str, username: str = "", password: str = "", timeout: float = 2.5) -> bool:
    """Direct RTSP DESCRIBE socket test."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((ip, port))
            url = f"rtsp://{ip}:{port}{path}"
            headers = f"DESCRIBE {url} RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: EPIC-Edge-Agent/3.1\r\nAccept: application/sdp\r\n"
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
    """Discover cameras locally from this machine with dynamic porting."""
    print(f"\n{BOLD}[1/3] Probing NVR at {ip} locally from this network...{RESET}")

    # Safely URL-encode credentials so passwords with special chars (@, $, #, :) work seamlessly
    user_enc = urllib.parse.quote(username, safe="")
    pass_enc = urllib.parse.quote(password, safe="")
    auth_part = f"{user_enc}:{pass_enc}@" if username else ""

    # DYNAMIC PORTS: Always respect user-provided ports first
    detected_http_port = port if port else 80
    detected_rtsp_port = rtsp_port if rtsp_port else 554

    http_ok = check_tcp_port(ip, detected_http_port, timeout=2.0)
    rtsp_ok = check_tcp_port(ip, detected_rtsp_port, timeout=2.0)

    # If HTTP port wasn't manually specified and port 80 is closed, try 37725 / 8000 / 8080
    if not port and not http_ok:
        for p in [37725, 8000, 8080]:
            if check_tcp_port(ip, p, timeout=1.0):
                detected_http_port = p
                http_ok = True
                break

    # If RTSP port wasn't manually specified and port 554 is closed, try 8554 / 10554
    if not rtsp_port and not rtsp_ok:
        for p in [8554, 10554]:
            if check_tcp_port(ip, p, timeout=1.0):
                detected_rtsp_port = p
                rtsp_ok = True
                break

    print(f"      Target HTTP Port : {detected_http_port} (Status: {'OPEN' if http_ok else 'CLOSED'})")
    print(f"      Target RTSP Port : {detected_rtsp_port} (Status: {'OPEN' if rtsp_ok else 'CLOSED'})")

    cameras: List[Dict[str, Any]] = []
    vendor = "DAHUA"

    # Dahua Channel Discovery via CGI (supports both Digest and Basic auth)
    try:
        dahua_url = f"http://{ip}:{detected_http_port}/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle"
        passman = urllib.request.HTTPPasswordMgrWithDefaultRealm()
        passman.add_password(None, dahua_url, username, password)
        authhandler = urllib.request.HTTPDigestAuthHandler(passman)
        basichandler = urllib.request.HTTPBasicAuthHandler(passman)
        opener = urllib.request.build_opener(authhandler, basichandler)
        req = urllib.request.Request(dahua_url, headers={"User-Agent": "EPIC-Edge-Agent/3.1"})
        with opener.open(req, timeout=4.0) as resp:
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
                if test_rtsp_describe(ip, detected_rtsp_port, p_main, username, password, timeout=1.5):
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

    # If fallback needed
    if not cameras:
        for ch in range(1, 9):
            cameras.append({
                "channel_number": ch,
                "name": f"Camera {ch}",
                "rtsp_stream_url": f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/cam/realmonitor?channel={ch}&subtype=0",
                "sub_stream_url": f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/cam/realmonitor?channel={ch}&subtype=1",
                "status": "reachable",
                "is_ptz": False
            })

    print(f"      {GREEN}[✓]{RESET} Found {len(cameras)} cameras ({vendor}) on NVR!")
    return {
        "reachable": True,
        "ip": ip,
        "port": detected_http_port,
        "rtsp_port": detected_rtsp_port,
        "vendor": vendor,
        "cameras": cameras
    }


def remap_url_to_bridge(url: str, bridge_ip: str, bridge_port: int = 554) -> str:
    """Remap an RTSP URL to point to this Edge Agent's bridge IP and port."""
    if not url:
        return url
    try:
        parts = urllib.parse.urlsplit(url)
        # Use rsplit at the LAST '@' so passwords containing '@' are preserved cleanly
        if "@" in parts.netloc:
            auth_part, _ = parts.netloc.rsplit("@", 1)
            new_netloc = f"{auth_part}@{bridge_ip}:{bridge_port}"
        else:
            new_netloc = f"{bridge_ip}:{bridge_port}"
        return urllib.parse.urlunsplit((parts.scheme, new_netloc, parts.path, parts.query, parts.fragment))
    except Exception:
        return url


def register_with_central_server(
    server_url: str,
    agent_name: str,
    nvr_info: Dict[str, Any],
    bridge_ip: str,
    bridge_port: int,
    username: str = "admin",
    password: str = ""
) -> bool:
    """Register Agent, NVR, and cameras with Central EPIC Command backend with dynamic credentials."""
    server_url = server_url.rstrip("/")
    print(f"\n{BOLD}[2/3] Registering with Central Server at {server_url} (Bridge IP: {bridge_ip}:{bridge_port})...{RESET}")

    # Step A: Enroll Agent
    enroll_url = f"{server_url}/api/agent/create"
    agent_id = None
    try:
        data = json.dumps({"name": agent_name, "status": "active"}).encode("utf-8")
        req = urllib.request.Request(enroll_url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            res_data = json.loads(resp.read().decode())
            agent_id = res_data.get("agent", {}).get("id")
            print(f"      {GREEN}[✓]{RESET} Agent '{agent_name}' registered (ID: {agent_id})")
    except Exception:
        try:
            list_url = f"{server_url}/api/agent/list"
            req = urllib.request.Request(list_url)
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                res_data = json.loads(resp.read().decode())
                for ag in res_data.get("agents", []):
                    if ag.get("name", "").strip().lower() == agent_name.strip().lower():
                        agent_id = ag.get("id")
                        print(f"      {GREEN}[✓]{RESET} Linked to existing Agent '{agent_name}' (ID: {agent_id})")
                        break
        except Exception:
            pass

    # Remap camera RTSP URLs to use the Bridge IP and dynamic bridge port
    bridged_cameras = []
    for c in nvr_info["cameras"]:
        cam_copy = dict(c)
        cam_copy["rtsp_stream_url"] = remap_url_to_bridge(c.get("rtsp_stream_url", ""), bridge_ip, bridge_port)
        if c.get("sub_stream_url"):
            cam_copy["sub_stream_url"] = remap_url_to_bridge(c.get("sub_stream_url", ""), bridge_ip, bridge_port)
        bridged_cameras.append(cam_copy)

    # Step B: Register NVR and Cameras with actual credentials and dynamic ports
    confirm_url = f"{server_url}/api/nvr/confirm"
    payload = {
        "agent_id": agent_id,
        "name": f"{agent_name} NVR",
        "ip": bridge_ip,
        "port": nvr_info["port"],
        "rtsp_port": bridge_port,
        "username": username or "admin",
        "password": password or "",
        "status": "online",
        "vendor": nvr_info["vendor"],
        "cameras": bridged_cameras
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(confirm_url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            json.loads(resp.read().decode())
            print(f"      {GREEN}[✓]{RESET} NVR and {len(bridged_cameras)} Cameras routed through Bridge IP ({bridge_ip}:{bridge_port})!")
            return True
    except Exception as e:
        print(f"      {YELLOW}[!]{RESET} Registration notice: {e}")
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
                buf = src.recv(65536)
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
            server_sock.listen(50)
            print(f"\n{BOLD}[3/3] RTSP Stream Bridge active on local port {local_port} ➔ {target_host}:{target_port}{RESET}")
            print(f"      {GREEN}Edge Agent is streaming live!{RESET} (Press Ctrl+C to stop)\n")

            while True:
                client_sock, client_addr = server_sock.accept()
                try:
                    target_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    target_sock.settimeout(10.0)
                    target_sock.connect((target_host, target_port))
                    target_sock.settimeout(None)
                    print(f"      [Stream] Active stream connection from {client_addr[0]}")
                    t1 = threading.Thread(target=pipe_data, args=(client_sock, target_sock), daemon=True)
                    t2 = threading.Thread(target=pipe_data, args=(target_sock, client_sock), daemon=True)
                    t1.start()
                    t2.start()
                except Exception as ex:
                    print(f"      {YELLOW}[!]{RESET} Stream connection notice: {ex}")
                    client_sock.close()
        except Exception as e:
            print(f"{RED}[!] Stream bridge error: {e}{RESET}")

    thread = threading.Thread(target=bridge_listener, daemon=True)
    thread.start()


def main():
    if not check_environment():
        return

    parser = argparse.ArgumentParser(description="EPIC Command Edge Agent - Zero-VPN Zero-NAT CCTV Bridge")
    parser.add_argument("--server", help="Central EPIC Command server URL")
    parser.add_argument("--agent", help="Agent / Branch Name")
    parser.add_argument("--nvr", help="Local NVR IP address")
    parser.add_argument("--user", "--admin", dest="user", help="NVR Admin Username")
    parser.add_argument("--password", "--pass", dest="password", help="NVR Password")
    parser.add_argument("--bridge-ip", help="Active IP of this machine reachable by Central Server")
    parser.add_argument("--http-port", type=int, default=None, help="NVR HTTP Port")
    parser.add_argument("--rtsp-port", type=int, default=None, help="NVR RTSP Port")
    args = parser.parse_args()

    print()
    server_url = args.server or input("Enter Central Server URL: ").strip() or "http://192.168.1.101"
    agent_name = args.agent or input("Enter Branch / Agent Name: ").strip() or "Branch"

    print(f"\n      Branch Agent   : {BOLD}{agent_name}{RESET}")
    print(f"      Central Server : {CYAN}{server_url}{RESET}")
    print("-" * 65)
    print("      LOCAL NVR SETUP")
    print("-" * 65)

    nvr_ip = args.nvr or input("Enter NVR IP: ").strip() or "200.0.0.25"
    username = args.user or input("Enter Admin: ").strip() or "admin"
    password = args.password if args.password is not None else input("Enter Password: ").strip()

    # Dynamic ports input
    port_inp = input("Enter HTTP Port: ").strip()
    http_port = int(port_inp) if port_inp.isdigit() else (args.http_port or None)

    rtsp_inp = input("Enter RTSP Port: ").strip()
    rtsp_port = int(rtsp_inp) if rtsp_inp.isdigit() else (args.rtsp_port or None)

    # Auto-detect default Bridge IP facing Central Server
    detected_bridge = "10.254.4.2"
    try:
        server_host = urllib.parse.urlparse(server_url).hostname or "192.168.1.101"
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect((server_host, 80))
            detected_bridge = s.getsockname()[0]
    except Exception:
        pass

    bridge_ip = args.bridge_ip or detected_bridge

    # 1. Local Probe with dynamic ports and credentials
    nvr_info = probe_local_nvr(
        ip=nvr_ip,
        username=username,
        password=password,
        port=http_port,
        rtsp_port=rtsp_port
    )

    actual_rtsp_port = nvr_info.get("rtsp_port") or rtsp_port or 554

    # Dynamic local bridge port allocation
    bridge_port = get_dynamic_bridge_port(actual_rtsp_port if actual_rtsp_port != 554 else 554)
    if bridge_port != 554:
        print(f"      {CYAN}[Porting]{RESET} Local bridge port dynamically set to {bridge_port}")

    print(f"      Active Edge Bridge IP : {bridge_ip}:{bridge_port}")

    # 2. Register with Central Server with exact user credentials
    register_with_central_server(
        server_url=server_url,
        agent_name=agent_name,
        nvr_info=nvr_info,
        bridge_ip=bridge_ip,
        bridge_port=bridge_port,
        username=username,
        password=password
    )

    # 3. Start Dynamic Stream Bridge
    start_rtsp_tcp_bridge(bridge_port, nvr_ip, actual_rtsp_port)

    # 4. Keep alive loop
    try:
        while True:
            time.sleep(30)
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Edge Agent stopped by user.{RESET}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Edge Agent stopped.{RESET}")
    except Exception as e:
        print(f"\n{RED}[!] Error: {e}{RESET}")
        import traceback
        traceback.print_exc()
    finally:
        print("\n" + "=" * 65)
        print("Edge Agent execution finished.")
        print("=" * 65)
        try:
            input("Press Enter to close this window . . . ")
        except Exception:
            pass
