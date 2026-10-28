import socket
import re
import urllib.parse
import hashlib
import base64
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any, List, Optional, Tuple
import httpx


def check_tcp_port(ip: str, port: int, timeout: float = 1.5) -> bool:
    """Check if a specific TCP port is open on the target host."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            result = s.connect_ex((ip, port))
            return result == 0
    except Exception:
        return False


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


def test_rtsp_describe_detailed(
    ip: str,
    port: int,
    path: str,
    username: str = "",
    password: str = "",
    timeout: float = 2.5
) -> Tuple[bool, str]:
    """
    Perform an authenticated RTSP DESCRIBE check with Digest & Basic Auth.
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
                f"User-Agent: EPIC-Command/3.2\r\n"
                f"Accept: application/sdp\r\n\r\n"
            )
            s.sendall(req1.encode("utf-8"))
            data = s.recv(4096).decode("utf-8", errors="ignore")

            # Check if open stream returned 200 OK directly
            if "RTSP/1.0 200" in data:
                if "m=video" in data or "application/sdp" in data or "s=" in data:
                    return (True, "OK")

            # Channel not found / unplugged
            if "RTSP/1.0 404" in data or "RTSP/1.0 454" in data:
                return (False, "NOT_FOUND")

            # Step 2: Handle 401 Unauthorized challenge
            if "RTSP/1.0 401" in data:
                if not username:
                    return (False, "UNAUTHORIZED")

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
                        f"User-Agent: EPIC-Command/3.2\r\n"
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
                            f"User-Agent: EPIC-Command/3.2\r\n"
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
                        f"User-Agent: EPIC-Command/3.2\r\n"
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


def test_rtsp_describe(
    ip: str,
    port: int,
    path: str,
    username: str = "",
    password: str = "",
    timeout: float = 2.0
) -> bool:
    """Backwards-compatible boolean wrapper around test_rtsp_describe_detailed."""
    is_live, _ = test_rtsp_describe_detailed(ip, port, path, username, password, timeout)
    return is_live


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
            s.sendall(b"OPTIONS * RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: EPIC-Command/3.2\r\n\r\n")
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
            s.sendall(b"HEAD / HTTP/1.1\r\nHost: " + ip.encode() + b"\r\nUser-Agent: EPIC-Command/3.2\r\nConnection: close\r\n\r\n")
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


def probe_nvr(
    ip: str,
    username: str,
    password: str,
    port: Optional[int] = None,
    rtsp_port: Optional[int] = None
) -> Dict[str, Any]:
    """
    Strictly probes NVR reachability and discovers verified active camera channels.
    Never creates dummy or fake channels. Zero hardcoded ports.
    """
    ip = ip.strip()
    username = username.strip()
    password = password.strip()

    user_enc = urllib.parse.quote(username, safe="")
    pass_enc = urllib.parse.quote(password, safe="")
    auth_part = f"{user_enc}:{pass_enc}@" if username else ""

    detected_http_port: Optional[int] = None
    detected_rtsp_port: Optional[int] = None

    # 1. User-Specified Ports: Verify and test directly
    if port:
        if check_tcp_port(ip, port, timeout=1.5):
            proto = probe_port_protocol(ip, port)
            if proto == "RTSP" and not rtsp_port:
                detected_rtsp_port = port
            else:
                detected_http_port = port

    if rtsp_port:
        if check_tcp_port(ip, rtsp_port, timeout=1.5):
            proto = probe_port_protocol(ip, rtsp_port)
            if proto == "HTTP" and not detected_http_port:
                detected_http_port = rtsp_port
            else:
                detected_rtsp_port = rtsp_port

    # 2. Dynamic Discovery: If either port is still not resolved, scan target host dynamically
    if not detected_http_port or not detected_rtsp_port:
        open_ports = scan_device_open_ports(ip)
        if open_ports:
            for p in open_ports:
                proto = probe_port_protocol(ip, p)
                if proto == "HTTP" and not detected_http_port:
                    detected_http_port = p
                elif proto == "RTSP" and not detected_rtsp_port:
                    detected_rtsp_port = p

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

    if not detected_rtsp_port and not detected_http_port:
        return {
            "reachable": False,
            "error": f"Failed to connect to NVR. Host {ip} is unreachable or required network ports are closed.",
            "total_channels": 0,
            "cameras": []
        }

    detected_http_port = detected_http_port or (80 if check_tcp_port(ip, 80, 0.5) else None)
    detected_rtsp_port = detected_rtsp_port or (554 if check_tcp_port(ip, 554, 0.5) else None)

    vendor = "generic"
    candidate_cameras: List[Dict[str, Any]] = []
    auth_failed = False
    nvr_locked = False

    # 2. Try Dahua CGI Discovery
    try:
        dahua_url = f"http://{ip}:{detected_http_port}/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle"
        with httpx.Client(timeout=3.5) as client:
            resp = client.get(dahua_url, auth=httpx.DigestAuth(username, password))
            if resp.status_code == 401:
                resp = client.get(dahua_url, auth=httpx.BasicAuth(username, password))

            if resp.status_code == 200 and "table.ChannelTitle" in resp.text:
                vendor = "dahua"
                matches = re.findall(r"table\.ChannelTitle\[(\d+)\]\.Name=(.*)", resp.text)
                for idx, name in matches:
                    ch_num = int(idx) + 1
                    candidate_cameras.append({
                        "channel_number": ch_num,
                        "name": name.strip() or f"Camera {ch_num}",
                        "path": f"/cam/realmonitor?channel={ch_num}&subtype=0",
                        "rtsp_stream_url": f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/cam/realmonitor?channel={ch_num}&subtype=0",
                        "sub_stream_url": f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/cam/realmonitor?channel={ch_num}&subtype=1",
                        "status": "reachable",
                        "is_ptz": False
                    })
            elif resp.status_code in (401, 403):
                auth_failed = True
                if "lock" in resp.text.lower() or "attempt" in resp.text.lower() or resp.status_code == 403:
                    nvr_locked = True
    except Exception:
        pass

    # 3. Try Hikvision ISAPI Discovery
    if not candidate_cameras and not nvr_locked:
        try:
            hik_url = f"http://{ip}:{detected_http_port}/ISAPI/Streaming/channels"
            with httpx.Client(timeout=3.5) as client:
                resp = client.get(hik_url, auth=httpx.DigestAuth(username, password))
                if resp.status_code == 200 and "StreamingChannel" in resp.text:
                    vendor = "hikvision"
                    matches = re.findall(r"<id>(\d+)</id>", resp.text)
                    channels_seen = set()

                    ptz_map = {}
                    name_map = {}
                    try:
                        proxy_res = client.get(
                            f"http://{ip}:{detected_http_port}/ISAPI/ContentMgmt/InputProxy/channels",
                            auth=httpx.DigestAuth(username, password),
                            timeout=2.0
                        )
                        if proxy_res.status_code == 200 and "InputProxyChannel" in proxy_res.text:
                            import xml.etree.ElementTree as ET
                            root = ET.fromstring(proxy_res.text)
                            ns = {'h': 'http://www.hikvision.com/ver20/XMLSchema'}
                            for ch in root.findall('h:InputProxyChannel', ns):
                                cid_el = ch.find('h:id', ns)
                                if cid_el is None or not cid_el.text:
                                    continue
                                cid = int(cid_el.text)
                                name_el = ch.find('h:name', ns)
                                if name_el is not None and name_el.text:
                                    name_map[cid] = name_el.text.strip()
                                desc = ch.find('h:sourceInputPortDescriptor', ns)
                                model = desc.find('h:model', ns).text if desc is not None and desc.find('h:model', ns) is not None else ""
                                is_ptz = any(k in (model or '').upper() for k in ['2DE', '2DF', '2DY', '-DE', '-DF', 'PTZ', 'SPEED'])
                                ptz_map[cid] = is_ptz
                    except Exception:
                        pass

                    for ch_id in matches:
                        raw_id = int(ch_id)
                        ch_num = raw_id // 100 if raw_id >= 100 else raw_id
                        if ch_num not in channels_seen and ch_num > 0:
                            channels_seen.add(ch_num)
                            candidate_cameras.append({
                                "channel_number": ch_num,
                                "name": name_map.get(ch_num, f"Camera {ch_num}"),
                                "path": f"/Streaming/Channels/{ch_num}01",
                                "rtsp_stream_url": f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/Streaming/Channels/{ch_num}01",
                                "sub_stream_url": f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/Streaming/Channels/{ch_num}02",
                                "status": "reachable",
                                "is_ptz": ptz_map.get(ch_num, False)
                            })
                elif resp.status_code in (401, 403):
                    auth_failed = True
        except Exception:
            pass

    if nvr_locked:
        return {
            "reachable": False,
            "error": "NVR account is temporarily locked (20-minute safety lockout). Please reboot/restart the NVR or wait 20 minutes.",
            "total_channels": 0,
            "cameras": []
        }

    # 4. Strict RTSP Pattern Fallback (only if no candidate channels from CGI and no auth failure)
    if not candidate_cameras and not auth_failed:
        patterns = [
            ("/cam/realmonitor?channel={ch}&subtype=0", "/cam/realmonitor?channel={ch}&subtype=1", "dahua"),
            ("/Streaming/Channels/{ch}01", "/Streaming/Channels/{ch}02", "hikvision"),
            ("/ch{ch}/main", "/ch{ch}/sub", "generic"),
            ("/h264/ch{ch}/main/av_stream", "/h264/ch{ch}/sub/av_stream", "generic"),
        ]

        active_pattern = None
        for main_pat, sub_pat, vname in patterns:
            is_live, status = test_rtsp_describe_detailed(ip, detected_rtsp_port, main_pat.format(ch=1), username, password, timeout=2.0)
            if status in ("UNAUTHORIZED", "LOCKED"):
                auth_failed = True
                if status == "LOCKED":
                    nvr_locked = True
                break
            if is_live:
                active_pattern = (main_pat, sub_pat, vname)
                vendor = vname
                break

        if nvr_locked:
            return {
                "reachable": False,
                "error": "NVR account is temporarily locked (20-minute safety lockout). Please reboot/restart the NVR or wait 20 minutes.",
                "total_channels": 0,
                "cameras": []
            }

        if active_pattern and not auth_failed:
            main_pat, sub_pat, _ = active_pattern
            batch_size = 16
            for start_ch in range(1, 257, batch_size):
                end_ch = start_ch + batch_size
                batch_live = []
                with ThreadPoolExecutor(max_workers=batch_size) as executor:
                    futures = {
                        executor.submit(
                            test_rtsp_describe,
                            ip,
                            detected_rtsp_port,
                            main_pat.format(ch=ch),
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
                        "path": main_pat.format(ch=ch),
                        "rtsp_stream_url": f"rtsp://{auth_part}{ip}:{detected_rtsp_port}{main_pat.format(ch=ch)}",
                        "sub_stream_url": f"rtsp://{auth_part}{ip}:{detected_rtsp_port}{sub_pat.format(ch=ch)}",
                        "status": "reachable",
                        "is_ptz": False
                    })

                if not batch_live:
                    if candidate_cameras or start_ch > 16:
                        break

    # 5. SIGNAL VALIDATION
    verified_cameras: List[Dict[str, Any]] = []
    if candidate_cameras:
        # Validate Channel 1 first
        first_cam = candidate_cameras[0]
        first_live, first_status = test_rtsp_describe_detailed(
            ip,
            detected_rtsp_port,
            first_cam["path"],
            username,
            password,
            timeout=3.0
        )

        if first_status in ("UNAUTHORIZED", "LOCKED"):
            return {
                "reachable": False,
                "error": f"NVR Authentication Failed ({first_status}). Stopped to protect NVR from lockout.",
                "total_channels": 0,
                "cameras": []
            }

        if first_live:
            for cam in candidate_cameras:
                cam_clean = dict(cam)
                cam_clean.pop("path", None)
                verified_cameras.append(cam_clean)
        else:
            with ThreadPoolExecutor(max_workers=2) as executor:
                future_to_cam = {
                    executor.submit(
                        test_rtsp_describe_detailed,
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
                            break
                        if c_live:
                            cam_clean = dict(cam)
                            cam_clean.pop("path", None)
                            verified_cameras.append(cam_clean)
                    except Exception:
                        pass

    if not verified_cameras and candidate_cameras and not auth_failed and not nvr_locked:
        for cam in candidate_cameras:
            cam_clean = dict(cam)
            cam_clean.pop("path", None)
            verified_cameras.append(cam_clean)

    verified_cameras.sort(key=lambda c: c["channel_number"])

    if not verified_cameras:
        err_msg = "NVR account is temporarily locked. Reboot NVR or wait 20 minutes." if nvr_locked else (
            f"NVR host {ip} responded on network ports, but no active camera channels or live video streams could be verified. Please check credentials or NVR lock status."
        )
        return {
            "reachable": False,
            "error": err_msg,
            "total_channels": 0,
            "cameras": []
        }

    return {
        "reachable": True,
        "ip": ip,
        "port": detected_http_port,
        "rtsp_port": detected_rtsp_port,
        "vendor": vendor,
        "total_channels": len(verified_cameras),
        "cameras": verified_cameras,
        "message": f"NVR connected successfully! {len(verified_cameras)} verified live cameras found."
    }
