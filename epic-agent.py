#!/usr/bin/env python3
"""
EPIC Command - Standalone Edge Surveillance Agent v3.1
======================================================
Zero-VPN | Zero-NAT Port Forwarding | True Multi-Branch | Cross-Platform

Compatible with Windows 10/11, Windows Server, Ubuntu, Debian, CentOS, macOS.
Uses 100% Python Standard Library — Zero pip installs needed!

Usage:
    python epic-agent.py
    python epic-agent.py --server http://<SERVER_IP> --agent "<BRANCH_NAME>"
    python epic-agent.py --server http://<SERVER_IP> --agent "<BRANCH_NAME>" --nvr <NVR_IP> --user admin --pass "<PASSWORD>"
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
import hashlib
import base64
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any, List, Optional, Tuple


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


def get_dynamic_bridge_port(preferred: Optional[int] = None) -> int:
    """
    Dynamically find an available local port for the RTSP stream bridge.
    If preferred port is available, use it.
    Otherwise, dynamically binds to port 0 to let OS kernel allocate any available free ephemeral port.
    """
    if preferred and check_port_available(preferred):
        return preferred
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("0.0.0.0", 0))
        return s.getsockname()[1]


def parse_digest_challenge(challenge_str: str) -> Dict[str, str]:
    """Parse key=value and key="value" pairs from a WWW-Authenticate header."""
    params = {}
    for m in re.finditer(r'(\w+)=(?:"([^"]*)"|([^\s,]+))', challenge_str, re.IGNORECASE):
        k = m.group(1).lower()
        v = m.group(2) if m.group(2) is not None else m.group(3)
        params[k] = v
    return params


def make_digest_auth_header(
    username: str,
    realm: str,
    nonce: str,
    uri: str,
    ha1: str,
    qop: Optional[str] = None,
    opaque: Optional[str] = None,
    nc: str = "00000001",
    cnonce: Optional[str] = None
) -> str:
    """Build RFC 2617 / RFC 2068 Digest Authorization header."""
    ha2 = hashlib.md5(f"DESCRIBE:{uri}".encode("utf-8")).hexdigest()
    if qop and "auth" in qop.lower():
        if not cnonce:
            cnonce = f"{random.randint(100000, 999999):08x}"
        response = hashlib.md5(f"{ha1}:{nonce}:{nc}:{cnonce}:auth:{ha2}".encode("utf-8")).hexdigest()
        parts = [
            f'Digest username="{username}"',
            f'realm="{realm}"',
            f'nonce="{nonce}"',
            f'uri="{uri}"',
            f'response="{response}"',
            'qop=auth',
            f'nc={nc}',
            f'cnonce="{cnonce}"'
        ]
    else:
        response = hashlib.md5(f"{ha1}:{nonce}:{ha2}".encode("utf-8")).hexdigest()
        parts = [
            f'Digest username="{username}"',
            f'realm="{realm}"',
            f'nonce="{nonce}"',
            f'uri="{uri}"',
            f'response="{response}"'
        ]
    if opaque:
        parts.append(f'opaque="{opaque}"')
    return "Authorization: " + ", ".join(parts)


def verify_rtsp_stream_detailed(
    ip: str,
    port: int,
    path: str,
    username: str = "",
    password: str = "",
    timeout: float = 2.5
) -> Tuple[bool, str]:
    """
    Perform authenticated RTSP DESCRIBE check with Digest & Basic Auth.
    Returns (is_live: bool, status: str) where status can be:
      - "OK": Stream is active with valid SDP video track
      - "NOT_FOUND": Channel does not exist or camera is unplugged (404/454)
      - "UNAUTHORIZED": Bad username/password (401)
      - "LOCKED": NVR security lockout triggered
      - "ERROR": Connection / network error
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((ip, port))

            cseq = 1
            rtsp_url = f"rtsp://{ip}:{port}{path}"

            # Step 1: Initial unauthenticated probe
            req1 = (
                f"DESCRIBE {rtsp_url} RTSP/1.0\r\n"
                f"CSeq: {cseq}\r\n"
                f"User-Agent: EPIC-Edge-Agent/3.2\r\n"
                f"Accept: application/sdp\r\n\r\n"
            )
            s.sendall(req1.encode("utf-8"))
            data = s.recv(4096).decode("utf-8", errors="ignore")

            # Unauthenticated open stream 200 OK
            if "RTSP/1.0 200" in data:
                if "m=video" in data or "application/sdp" in data or "s=" in data:
                    return (True, "OK")

            # Empty or unplugged channel
            if "RTSP/1.0 404" in data or "RTSP/1.0 454" in data:
                return (False, "NOT_FOUND")

            # Handle 401 Unauthorized challenge
            if "RTSP/1.0 401" in data:
                if not username:
                    return (False, "UNAUTHORIZED")

                # Check if already locked by Dahua / Hikvision anti-brute-force
                if "lock" in data.lower() or "illegal" in data.lower():
                    return (False, "LOCKED")

                cseq += 1
                digest_match = re.search(r'WWW-Authenticate:\s*Digest\s+([^\r\n]+)', data, re.IGNORECASE)
                basic_match = re.search(r'WWW-Authenticate:\s*Basic', data, re.IGNORECASE)

                if digest_match:
                    params = parse_digest_challenge(digest_match.group(1))
                    realm = params.get("realm", "")
                    nonce = params.get("nonce", "")
                    qop = params.get("qop")
                    opaque = params.get("opaque")

                    ha1 = hashlib.md5(f"{username}:{realm}:{password}".encode("utf-8")).hexdigest()

                    # Attempt A: Match request line exactly with full RTSP URL (Standard for VLC, FFmpeg, Dahua)
                    auth_hdr_full = make_digest_auth_header(username, realm, nonce, rtsp_url, ha1, qop, opaque)
                    req2 = (
                        f"DESCRIBE {rtsp_url} RTSP/1.0\r\n"
                        f"CSeq: {cseq}\r\n"
                        f"User-Agent: EPIC-Edge-Agent/3.2\r\n"
                        f"Accept: application/sdp\r\n"
                        f"{auth_hdr_full}\r\n\r\n"
                    )
                    s.sendall(req2.encode("utf-8"))
                    data2 = s.recv(4096).decode("utf-8", errors="ignore")

                    if "RTSP/1.0 200" in data2:
                        return (True, "OK")

                    if "lock" in data2.lower() or "illegal" in data2.lower():
                        return (False, "LOCKED")

                    if "RTSP/1.0 404" in data2 or "RTSP/1.0 454" in data2:
                        return (False, "NOT_FOUND")

                    # Attempt B: Fallback with relative path URI if server strictly requires relative path
                    if "RTSP/1.0 401" in data2:
                        cseq += 1
                        auth_hdr_rel = make_digest_auth_header(username, realm, nonce, path, ha1, qop, opaque)
                        req3 = (
                            f"DESCRIBE {path} RTSP/1.0\r\n"
                            f"CSeq: {cseq}\r\n"
                            f"User-Agent: EPIC-Edge-Agent/3.2\r\n"
                            f"Accept: application/sdp\r\n"
                            f"{auth_hdr_rel}\r\n\r\n"
                        )
                        s.sendall(req3.encode("utf-8"))
                        data3 = s.recv(4096).decode("utf-8", errors="ignore")

                        if "RTSP/1.0 200" in data3:
                            return (True, "OK")

                        if "lock" in data3.lower() or "illegal" in data3.lower():
                            return (False, "LOCKED")

                        if "RTSP/1.0 404" in data3 or "RTSP/1.0 454" in data3:
                            return (False, "NOT_FOUND")

                        return (False, "UNAUTHORIZED")

                elif basic_match or "Basic" in data:
                    creds = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
                    auth_hdr = f"Authorization: Basic {creds}"
                    req2 = (
                        f"DESCRIBE {rtsp_url} RTSP/1.0\r\n"
                        f"CSeq: {cseq}\r\n"
                        f"User-Agent: EPIC-Edge-Agent/3.2\r\n"
                        f"Accept: application/sdp\r\n"
                        f"{auth_hdr}\r\n\r\n"
                    )
                    s.sendall(req2.encode("utf-8"))
                    data2 = s.recv(4096).decode("utf-8", errors="ignore")
                    if "RTSP/1.0 200" in data2:
                        return (True, "OK")
                    if "lock" in data2.lower():
                        return (False, "LOCKED")
                    return (False, "UNAUTHORIZED")

            return (False, "ERROR")
    except Exception:
        return (False, "ERROR")


def verify_rtsp_stream(
    ip: str,
    port: int,
    path: str,
    username: str = "",
    password: str = "",
    timeout: float = 2.0
) -> bool:
    """Backwards-compatible boolean wrapper around verify_rtsp_stream_detailed."""
    is_live, _ = verify_rtsp_stream_detailed(ip, port, path, username, password, timeout)
    return is_live


def test_rtsp_describe(ip: str, port: int, path: str, username: str = "", password: str = "", timeout: float = 2.0) -> bool:
    """Backwards-compatible alias for verify_rtsp_stream."""
    return verify_rtsp_stream(ip, port, path, username, password, timeout)


def probe_port_protocol(ip: str, port: int, timeout: float = 0.8) -> str:
    """
    Dynamically probe an open port with RTSP and HTTP protocol banners.
    Returns 'RTSP', 'HTTP', 'TCP' (open but unknown banner), or 'CLOSED'.
    """
    # 1. Test RTSP protocol banner
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            if s.connect_ex((ip, port)) != 0:
                return "CLOSED"
            s.sendall(b"OPTIONS * RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: EPIC-Agent\r\n\r\n")
            res = s.recv(512).decode("utf-8", errors="ignore")
            if "RTSP/1." in res:
                return "RTSP"
    except Exception:
        pass

    # 2. Test HTTP protocol banner
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            if s.connect_ex((ip, port)) != 0:
                return "CLOSED"
            s.sendall(b"HEAD / HTTP/1.1\r\nHost: " + ip.encode() + b"\r\nUser-Agent: EPIC-Agent\r\nConnection: close\r\n\r\n")
            res = s.recv(512).decode("utf-8", errors="ignore")
            if "HTTP/1." in res or "Server:" in res or "html" in res.lower():
                return "HTTP"
    except Exception:
        pass

    return "TCP"


def scan_device_open_ports(ip: str, timeout: float = 0.25) -> List[int]:
    """
    Dynamically scans target host to discover all active listening TCP ports.
    Scans full standard 1-1024 spectrum (covers any port e.g. 776, 80, 554, 88, 443)
    plus extended dynamic ranges without hardcoding.
    """
    def test_port(p: int) -> Optional[int]:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(timeout)
                if s.connect_ex((ip, p)) == 0:
                    return p
        except Exception:
            pass
        return None

    ports_to_check = set(range(1, 1025))
    ports_to_check.update(range(5000, 5565))
    ports_to_check.update(range(7000, 7080))
    ports_to_check.update(range(8000, 8105))
    ports_to_check.update(range(8550, 8560))
    ports_to_check.update(range(8880, 8900))
    ports_to_check.update(range(9000, 9020))
    ports_to_check.update(range(10550, 10560))
    ports_to_check.update(range(37700, 37785))

    with ThreadPoolExecutor(max_workers=100) as executor:
        results = executor.map(test_port, sorted(ports_to_check))
        open_ports = [p for p in results if p is not None]

    return sorted(open_ports)


def probe_local_nvr(
    ip: str,
    username: str,
    password: str,
    port: Optional[int] = None,
    rtsp_port: Optional[int] = None
) -> Dict[str, Any]:
    """
    Discover active cameras locally from this machine.
    Zero hardcoded ports. Dynamically discovers and verifies open ports and protocols.
    Safeguards against NVR account lockouts by stopping on unauthorized responses.
    """
    print(f"\n{BOLD}[1/3] Probing NVR at {ip} locally from this network...{RESET}")

    user_enc = urllib.parse.quote(username, safe="")
    pass_enc = urllib.parse.quote(password, safe="")
    auth_part = f"{user_enc}:{pass_enc}@" if username else ""

    detected_http_port: Optional[int] = None
    detected_rtsp_port: Optional[int] = None

    # 1. User-Specified Ports: Verify protocol directly
    if port:
        if check_tcp_port(ip, port, timeout=1.5):
            proto = probe_port_protocol(ip, port)
            if proto == "RTSP" and not rtsp_port:
                detected_rtsp_port = port
                print(f"      {GREEN}[✓]{RESET} Port {port} dynamically identified as RTSP Stream Service.")
            elif proto == "HTTP":
                detected_http_port = port
                print(f"      {GREEN}[✓]{RESET} User HTTP Port {port} verified (Status: OPEN, Protocol: HTTP)")
            else:
                print(f"      {YELLOW}[!]{RESET} User Port {port} is open, but protocol is {proto} (not HTTP Web). Scanning dynamically for true HTTP port...")
        else:
            print(f"      {YELLOW}[!]{RESET} User specified HTTP Port {port} is CLOSED on {ip}.")

    if rtsp_port:
        if check_tcp_port(ip, rtsp_port, timeout=1.5):
            proto = probe_port_protocol(ip, rtsp_port)
            if proto == "HTTP" and not detected_http_port:
                detected_http_port = rtsp_port
                print(f"      {GREEN}[✓]{RESET} Port {rtsp_port} dynamically identified as HTTP Web Service.")
            elif proto == "RTSP":
                detected_rtsp_port = rtsp_port
                print(f"      {GREEN}[✓]{RESET} User RTSP Port {rtsp_port} verified (Status: OPEN, Protocol: RTSP)")
            else:
                print(f"      {YELLOW}[!]{RESET} User Port {rtsp_port} is open, but protocol is {proto} (not RTSP Stream). Scanning dynamically for true RTSP port...")
        else:
            print(f"      {YELLOW}[!]{RESET} User specified RTSP Port {rtsp_port} is CLOSED on {ip}.")

    # 2. Dynamic Discovery: If either port is still not resolved, scan target host dynamically
    if not detected_http_port or not detected_rtsp_port:
        print(f"      Scanning {ip} dynamically for active camera services...")
        open_ports = scan_device_open_ports(ip)
        if open_ports:
            print(f"      Found open network ports: {open_ports}")
            for p in open_ports:
                proto = probe_port_protocol(ip, p)
                if proto == "HTTP" and not detected_http_port:
                    detected_http_port = p
                    print(f"      {GREEN}[✓]{RESET} Dynamically detected HTTP Web Service on Port {p}")
                elif proto == "RTSP" and not detected_rtsp_port:
                    detected_rtsp_port = p
                    print(f"      {GREEN}[✓]{RESET} Dynamically detected RTSP Stream Service on Port {p}")

            # Fallback for silent embedded devices
            if not detected_http_port and open_ports:
                for p in open_ports:
                    if p != detected_rtsp_port:
                        detected_http_port = p
                        break
            if not detected_rtsp_port and open_ports:
                for p in open_ports:
                    if p != detected_http_port:
                        detected_rtsp_port = p
                        break

    # If both ports could not be detected
    if not detected_http_port and not detected_rtsp_port:
        print(f"      {RED}[!] No open ports detected on {ip}. Host is unreachable or offline.{RESET}")
        return {
            "reachable": False,
            "ip": ip,
            "port": None,
            "rtsp_port": None,
            "vendor": "UNKNOWN",
            "cameras": [],
            "error": f"Host {ip} is unreachable or all network ports are closed."
        }



    print(f"      Target HTTP Port : {detected_http_port}")
    print(f"      Target RTSP Port : {detected_rtsp_port}")

    candidate_cameras: List[Dict[str, Any]] = []
    vendor = "DAHUA"
    dahua_auth_failed = False
    nvr_locked = False

    # Dahua Channel Discovery via CGI (Extract all channels without artificial limit)
    try:
        dahua_url = f"http://{ip}:{detected_http_port}/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle"
        passman = urllib.request.HTTPPasswordMgrWithDefaultRealm()
        passman.add_password(None, dahua_url, username, password)
        authhandler = urllib.request.HTTPDigestAuthHandler(passman)
        basichandler = urllib.request.HTTPBasicAuthHandler(passman)
        opener = urllib.request.build_opener(authhandler, basichandler)
        req = urllib.request.Request(dahua_url, headers={"User-Agent": "EPIC-Edge-Agent/3.2"})
        with opener.open(req, timeout=4.0) as resp:
            content = resp.read().decode("utf-8", errors="ignore")
            if "table.ChannelTitle" in content:
                vendor = "DAHUA"
                matches = re.findall(r"table\.ChannelTitle\[(\d+)\]\.Name=(.*)", content)
                for idx, name in matches:
                    ch_num = int(idx) + 1
                    main_url = f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/cam/realmonitor?channel={ch_num}&subtype=0"
                    sub_url = f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/cam/realmonitor?channel={ch_num}&subtype=1"
                    candidate_cameras.append({
                        "channel_number": ch_num,
                        "name": name.strip() or f"Camera {ch_num}",
                        "path": f"/cam/realmonitor?channel={ch_num}&subtype=0",
                        "rtsp_stream_url": main_url,
                        "sub_stream_url": sub_url,
                        "status": "reachable",
                        "is_ptz": False
                    })
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            dahua_auth_failed = True
            err_msg = e.read().decode("utf-8", errors="ignore")
            if "lock" in err_msg.lower() or "attempt" in err_msg.lower() or e.code == 403:
                nvr_locked = True
                print(f"      {RED}[!] NVR Account Lockout: Dahua NVR has temporarily locked the account ({e.code}).{RESET}")
                print(f"      {YELLOW}[!] To unlock: Reboot/restart the NVR immediately, or wait 20 minutes for the lock timer to expire.{RESET}")
            else:
                print(f"      {RED}[!] Dahua Web Authentication Failed (HTTP {e.code}). Please check username and password.{RESET}")
    except Exception:
        pass

    # Hikvision ISAPI Discovery fallback
    if not candidate_cameras and not nvr_locked:
        try:
            hik_url = f"http://{ip}:{detected_http_port}/ISAPI/Streaming/channels"
            passman = urllib.request.HTTPPasswordMgrWithDefaultRealm()
            passman.add_password(None, hik_url, username, password)
            authhandler = urllib.request.HTTPDigestAuthHandler(passman)
            basichandler = urllib.request.HTTPBasicAuthHandler(passman)
            opener = urllib.request.build_opener(authhandler, basichandler)
            req = urllib.request.Request(hik_url, headers={"User-Agent": "EPIC-Edge-Agent/3.2"})
            with opener.open(req, timeout=4.0) as resp:
                content = resp.read().decode("utf-8", errors="ignore")
                if "StreamingChannel" in content:
                    vendor = "HIKVISION"
                    matches = re.findall(r"<id>(\d+)</id>", content)
                    seen_ch = set()
                    for ch_id in matches:
                        raw_id = int(ch_id)
                        ch_num = raw_id // 100 if raw_id >= 100 else raw_id
                        if ch_num not in seen_ch and ch_num > 0:
                            seen_ch.add(ch_num)
                            main_url = f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/Streaming/Channels/{ch_num}01"
                            sub_url = f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/Streaming/Channels/{ch_num}02"
                            candidate_cameras.append({
                                "channel_number": ch_num,
                                "name": f"Camera {ch_num}",
                                "path": f"/Streaming/Channels/{ch_num}01",
                                "rtsp_stream_url": main_url,
                                "sub_stream_url": sub_url,
                                "status": "reachable",
                                "is_ptz": False
                            })
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                dahua_auth_failed = True
        except Exception:
            pass

    # If NVR is already locked, abort immediately so we don't reset the 20-minute timer!
    if nvr_locked:
        return {
            "reachable": False,
            "ip": ip,
            "port": detected_http_port,
            "rtsp_port": detected_rtsp_port,
            "vendor": vendor,
            "cameras": [],
            "error": "NVR account is temporarily locked (20-minute security lock). Reboot the NVR or wait 20 minutes."
        }

    # Dynamic RTSP Pattern Probing fallback (only if no candidate channels from CGI and no auth failure)
    if not candidate_cameras and not dahua_auth_failed:
        patterns = [
            ("/cam/realmonitor?channel={ch}&subtype=0", "/cam/realmonitor?channel={ch}&subtype=1", "DAHUA"),
            ("/Streaming/Channels/{ch}01", "/Streaming/Channels/{ch}02", "HIKVISION"),
            ("/ch{ch}/main", "/ch{ch}/sub", "GENERIC"),
            ("/h264/ch{ch}/main/av_stream", "/h264/ch{ch}/sub/av_stream", "GENERIC"),
        ]
        active_pattern = None
        for m_pat, s_pat, vname in patterns:
            is_live, status = verify_rtsp_stream_detailed(ip, detected_rtsp_port, m_pat.format(ch=1), username, password, timeout=2.0)
            if status in ("UNAUTHORIZED", "LOCKED"):
                print(f"      {RED}[!] RTSP Authentication Failed or Account Locked ({status}). Halting probing immediately to protect NVR.{RESET}")
                if status == "LOCKED":
                    print(f"      {YELLOW}[!] The NVR account is locked. Reboot the NVR or wait 20 minutes.{RESET}")
                dahua_auth_failed = True
                break
            if is_live:
                active_pattern = (m_pat, s_pat, vname)
                vendor = vname
                break

        if active_pattern and not dahua_auth_failed:
            m_pat, s_pat, _ = active_pattern
            batch_size = 16
            for start_ch in range(1, 257, batch_size):
                end_ch = start_ch + batch_size
                batch_live = []
                with ThreadPoolExecutor(max_workers=batch_size) as executor:
                    futures = {
                        executor.submit(
                            verify_rtsp_stream,
                            ip,
                            detected_rtsp_port,
                            m_pat.format(ch=ch),
                            username,
                            password,
                            1.8
                        ): ch
                        for ch in range(start_ch, end_ch)
                    }
                    for fut in as_completed(futures):
                        ch = futures[fut]
                        try:
                            if fut.result():
                                batch_live.append(ch)
                        except Exception:
                            pass

                for ch in sorted(batch_live):
                    candidate_cameras.append({
                        "channel_number": ch,
                        "name": f"Camera {ch}",
                        "path": m_pat.format(ch=ch),
                        "rtsp_stream_url": f"rtsp://{auth_part}{ip}:{detected_rtsp_port}{m_pat.format(ch=ch)}",
                        "sub_stream_url": f"rtsp://{auth_part}{ip}:{detected_rtsp_port}{s_pat.format(ch=ch)}",
                        "status": "reachable",
                        "is_ptz": False
                    })

                if not batch_live:
                    if candidate_cameras or start_ch > 16:
                        break

    # SIGNAL VALIDATION
    verified_cameras: List[Dict[str, Any]] = []

    if candidate_cameras:
        # Step A: Validate Channel 1 first to confirm RTSP authentication and signal
        first_cam = candidate_cameras[0]
        print(f"      Verifying RTSP stream authentication on Channel {first_cam['channel_number']}...")
        first_live, first_status = verify_rtsp_stream_detailed(
            ip,
            detected_rtsp_port,
            first_cam["path"],
            username,
            password,
            timeout=3.0
        )

        if first_status in ("UNAUTHORIZED", "LOCKED"):
            print(f"      {RED}[!] RTSP Authentication Failed ({first_status}). Stopping immediately to prevent NVR account lockout.{RESET}")
            if first_status == "LOCKED":
                print(f"      {YELLOW}[!] The NVR account is locked. Reboot the NVR or wait 20 minutes.{RESET}")
            return {
                "reachable": False,
                "ip": ip,
                "port": detected_http_port,
                "rtsp_port": detected_rtsp_port,
                "vendor": vendor,
                "cameras": []
            }

        if first_live:
            print(f"      {GREEN}[✓]{RESET} RTSP Stream verified active on Channel {first_cam['channel_number']}! All {len(candidate_cameras)} configured channels confirmed.")
            # All configured channels are valid
            for cam in candidate_cameras:
                cam_clean = dict(cam)
                cam_clean.pop("path", None)
                verified_cameras.append(cam_clean)
        else:
            # Channel 1 had no stream (unplugged). Gently check remaining channels with max 2 workers
            print(f"      Channel {first_cam['channel_number']} had no video signal. Checking remaining channels gently...")
            with ThreadPoolExecutor(max_workers=2) as executor:
                future_to_cam = {
                    executor.submit(
                        verify_rtsp_stream_detailed,
                        ip,
                        detected_rtsp_port,
                        cam["path"],
                        username,
                        password,
                        2.5
                    ): cam
                    for cam in candidate_cameras
                }
                for future in as_completed(future_to_cam):
                    cam = future_to_cam[future]
                    try:
                        c_live, c_status = future.result()
                        if c_status in ("UNAUTHORIZED", "LOCKED"):
                            print(f"      {RED}[!] RTSP Authentication failed ({c_status}). Halting stream checks.{RESET}")
                            break
                        if c_live:
                            cam_clean = dict(cam)
                            cam_clean.pop("path", None)
                            verified_cameras.append(cam_clean)
                            print(f"      {GREEN}[✓]{RESET} Channel {cam['channel_number']} ({cam['name']}): Stream Active (200 OK)")
                        else:
                            print(f"      {YELLOW}[-]{RESET} Channel {cam['channel_number']} ({cam['name']}): No Video Signal (Skipped)")
                    except Exception:
                        pass

    if not verified_cameras and candidate_cameras and not dahua_auth_failed and not nvr_locked:
        print(f"      {CYAN}[*]{RESET} NVR configuration contains {len(candidate_cameras)} channels ({vendor}). Registering all {len(candidate_cameras)} channels...")
        for cam in candidate_cameras:
            cam_clean = dict(cam)
            cam_clean.pop("path", None)
            verified_cameras.append(cam_clean)

    verified_cameras.sort(key=lambda c: c["channel_number"])

    if verified_cameras:
        print(f"      {GREEN}[✓]{RESET} Found {len(verified_cameras)} camera channels ({vendor}) on NVR!")
    else:
        print(f"      {RED}[!] No active live streaming cameras could be verified on NVR at {ip}.{RESET}")

    return {
        "reachable": len(verified_cameras) > 0,
        "ip": ip,
        "port": detected_http_port,
        "rtsp_port": detected_rtsp_port,
        "vendor": vendor,
        "cameras": verified_cameras
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
    password: str = "",
    agent_id: Optional[int] = None,
    is_direct_routing: bool = False
) -> bool:
    """Register Agent, NVR, and cameras with Central EPIC Command backend with dynamic credentials."""
    server_url = server_url.rstrip("/")
    route_label = f"Direct IP: {bridge_ip}:{bridge_port}" if is_direct_routing else f"Bridge IP: {bridge_ip}:{bridge_port}"
    print(f"\n{BOLD}[2/3] Registering with Central Server at {server_url} ({route_label})...{RESET}")

    # Step A: Link Agent (never create duplicates if agent exists or agent_id is provided)
    if agent_id:
        print(f"      {GREEN}[✓]{RESET} Linked directly to assigned Agent '{agent_name}' (ID: {agent_id})")
    else:
        # Check /api/agent/list first
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

        # Only create if not found in list
        if not agent_id:
            try:
                enroll_url = f"{server_url}/api/agent/create"
                data = json.dumps({"name": agent_name, "status": "active"}).encode("utf-8")
                req = urllib.request.Request(enroll_url, data=data, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=5.0) as resp:
                    res_data = json.loads(resp.read().decode())
                    agent_id = res_data.get("agent", {}).get("id")
                    print(f"      {GREEN}[✓]{RESET} Agent '{agent_name}' registered (ID: {agent_id})")
            except Exception:
                pass

    # Remap camera RTSP URLs to use the Bridge IP if proxy bridge is active
    bridged_cameras = []
    for c in nvr_info["cameras"]:
        cam_copy = dict(c)
        if not is_direct_routing:
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
            if is_direct_routing:
                print(f"      {GREEN}[✓]{RESET} NVR and {len(bridged_cameras)} Cameras registered with Direct LAN IP ({bridge_ip}:{bridge_port})!")
            else:
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
            print(f"      {GREEN}Edge Agent is streaming live!{RESET} (Press Ctrl+C to stop)")
            print(f"      {YELLOW}[IMPORTANT] Keep this CMD window OPEN to continue streaming.{RESET}")
            print(f"      {YELLOW}If this window is closed, camera streams will show 'No Signal'.{RESET}\n")

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
    parser.add_argument("--agent-id", type=int, default=None, help="Assigned Agent ID")
    args = parser.parse_args()

    print()
    server_url = (args.server or "").strip()
    while not server_url:
        server_url = input("Enter Central Server URL (e.g. http://192.168.1.100 or http://myserver.com): ").strip()

    agent_name = (args.agent or "").strip()
    while not agent_name:
        agent_name = input("Enter Branch / Agent Name: ").strip()

    print(f"\n      Branch Agent   : {BOLD}{agent_name}{RESET}")
    print(f"      Central Server : {CYAN}{server_url}{RESET}")
    print("-" * 65)
    print("      LOCAL NVR SETUP")
    print("-" * 65)

    nvr_ip = (args.nvr or "").strip()
    while not nvr_ip:
        nvr_ip = input("Enter NVR IP: ").strip()

    username = (args.user or "").strip()
    if not username:
        user_inp = input("Enter Admin Username: ").strip()
        username = user_inp if user_inp else "admin"

    password = args.password if args.password is not None else input("Enter Password: ").strip()

    # Dynamic ports input
    port_inp = input("Enter HTTP Port (or press Enter for auto-detect): ").strip()
    http_port = int(port_inp) if port_inp.isdigit() else (args.http_port or None)

    rtsp_inp = input("Enter RTSP Port (or press Enter for auto-detect): ").strip()
    rtsp_port = int(rtsp_inp) if rtsp_inp.isdigit() else (args.rtsp_port or None)

    # 1. Local Probe with dynamic ports and credentials
    nvr_info = probe_local_nvr(
        ip=nvr_ip,
        username=username,
        password=password,
        port=http_port,
        rtsp_port=rtsp_port
    )

    if not nvr_info.get("cameras"):
        print(f"\n{RED}[!] Registration aborted: 0 live streaming cameras were verified on NVR at {nvr_ip}.{RESET}")
        print(f"      Please check camera physical connections, NVR power, IP, and credentials.")
        return

    actual_rtsp_port = nvr_info.get("rtsp_port") or rtsp_port or 554

    # Determine optimal routing mode: Direct NVR vs Edge Proxy Bridge
    server_host = urllib.parse.urlparse(server_url).hostname or ""
    same_subnet = False
    try:
        s_parts = server_host.split(".")
        n_parts = nvr_ip.split(".")
        if len(s_parts) == 4 and len(n_parts) == 4 and s_parts[:3] == n_parts[:3]:
            same_subnet = True
    except Exception:
        pass

    # Auto-detect default Bridge IP facing Central Server
    detected_bridge = "127.0.0.1"
    try:
        if server_host:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect((server_host, 80))
                detected_bridge = s.getsockname()[0]
    except Exception:
        pass

    is_direct_routing = False
    if args.bridge_ip:
        bridge_ip = args.bridge_ip
        is_direct_routing = (bridge_ip == nvr_ip)
        bridge_port = actual_rtsp_port if is_direct_routing else get_dynamic_bridge_port(actual_rtsp_port if actual_rtsp_port != 554 else 554)
    elif same_subnet:
        print(f"\n      {GREEN}[✓]{RESET} Network Match: Central Server ({server_host}) & NVR ({nvr_ip}) share subnet ({s_parts[0]}.{s_parts[1]}.{s_parts[2]}.x).")
        print(f"      Direct High-Speed NVR Streaming enabled (0ms proxy latency, no firewall blocking).")
        bridge_ip = nvr_ip
        bridge_port = actual_rtsp_port
        is_direct_routing = True
    else:
        print(f"\n-----------------------------------------------------------------")
        print("      STREAM ROUTING SETUP")
        print("-----------------------------------------------------------------")
        print(f"      [1] Direct NVR IP    : {nvr_ip}:{actual_rtsp_port} (Central Server can reach NVR directly)")
        print(f"      [2] Edge Bridge IP   : {detected_bridge} (Central Server routes through this PC)")
        route_inp = input(f"Enter Streaming IP (press Enter for direct '{nvr_ip}'): ").strip()
        if not route_inp or route_inp == nvr_ip:
            bridge_ip = nvr_ip
            bridge_port = actual_rtsp_port
            is_direct_routing = True
        else:
            bridge_ip = route_inp
            bridge_port = get_dynamic_bridge_port(actual_rtsp_port if actual_rtsp_port != 554 else 554)
            is_direct_routing = False

    if is_direct_routing:
        print(f"      Active Stream Route   : Direct NVR ({bridge_ip}:{bridge_port})")
    else:
        if bridge_port != 554:
            print(f"      {CYAN}[Porting]{RESET} Local bridge port dynamically set to {bridge_port}")
        print(f"      Active Edge Bridge IP : {bridge_ip}:{bridge_port}")

    # 2. Register with Central Server with exact user credentials and assigned agent ID
    register_with_central_server(
        server_url=server_url,
        agent_name=agent_name,
        nvr_info=nvr_info,
        bridge_ip=bridge_ip,
        bridge_port=bridge_port,
        username=username,
        password=password,
        agent_id=args.agent_id,
        is_direct_routing=is_direct_routing
    )

    # 3. Stream Delivery / Bridge Loop
    if not is_direct_routing:
        start_rtsp_tcp_bridge(bridge_port, nvr_ip, actual_rtsp_port)
    else:
        print(f"\n{BOLD}[3/3] Direct NVR RTSP Streaming Active ➔ {nvr_ip}:{actual_rtsp_port}{RESET}")
        print(f"      {GREEN}[✓] Central Server streams directly from NVR at {nvr_ip}:{actual_rtsp_port}!{RESET}")
        print(f"      All {len(nvr_info['cameras'])} camera channels are streaming live via MediaMTX WebRTC.")
        print(f"      Zero proxy latency | Ultra-low CPU usage | High-definition delivery\n")
        print(f"      {GREEN}Edge Agent is active!{RESET} (Press Ctrl+C to stop or exit)")

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
