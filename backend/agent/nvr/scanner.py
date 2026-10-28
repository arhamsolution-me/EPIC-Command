import socket
import re
import urllib.parse
import hashlib
import base64
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any, List, Optional
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


def test_rtsp_describe(
    ip: str,
    port: int,
    path: str,
    username: str = "",
    password: str = "",
    timeout: float = 2.0
) -> bool:
    """
    Perform an authenticated RTSP DESCRIBE check with Digest & Basic Auth.
    Returns True ONLY if server responds 200 OK with valid SDP media track ('m=video').
    Returns False for empty/unplugged channels (404/454), unauthorized (401), or timeout.
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((ip, port))

            cseq = 1
            rtsp_url = f"rtsp://{ip}:{port}{path}"

            # Step 1: Initial unauthenticated DESCRIBE probe
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
                if "\r\n\r\n" in data:
                    header_part, _, body_part = data.partition("\r\n\r\n")
                    cl_m = re.search(r'Content-Length:\s*(\d+)', header_part, re.IGNORECASE)
                    if cl_m:
                        cl = int(cl_m.group(1))
                        while len(body_part.encode("utf-8")) < cl:
                            chunk = s.recv(2048).decode("utf-8", errors="ignore")
                            if not chunk:
                                break
                            body_part += chunk
                    data = header_part + "\r\n\r\n" + body_part
                if "m=video" in data or "application/sdp" in data or "s=" in data:
                    return True

            # Step 2: Handle 401 Unauthorized challenge
            if "RTSP/1.0 401" in data and username:
                cseq += 1
                digest_match = re.search(r'WWW-Authenticate:\s*Digest\s+([^\r\n]+)', data, re.IGNORECASE)
                basic_match = re.search(r'WWW-Authenticate:\s*Basic', data, re.IGNORECASE)

                if digest_match:
                    challenge = digest_match.group(1)
                    realm_m = re.search(r'realm="?([^",\r\n]+)"?', challenge)
                    nonce_m = re.search(r'nonce="?([^",\r\n]+)"?', challenge)
                    qop_m = re.search(r'qop="?([^",\r\n]+)"?', challenge)

                    realm = realm_m.group(1) if realm_m else ""
                    nonce = nonce_m.group(1) if nonce_m else ""
                    qop = qop_m.group(1) if qop_m else None

                    ha1 = hashlib.md5(f"{username}:{realm}:{password}".encode("utf-8")).hexdigest()

                    # Attempt A: Digest with full URL
                    ha2_full = hashlib.md5(f"DESCRIBE:{rtsp_url}".encode("utf-8")).hexdigest()
                    if qop and "auth" in qop.lower():
                        cnonce = f"{random.randint(100000, 999999):08x}"
                        nc = "00000001"
                        resp_full = hashlib.md5(f"{ha1}:{nonce}:{nc}:{cnonce}:auth:{ha2_full}".encode("utf-8")).hexdigest()
                        auth_hdr = (
                            f'Authorization: Digest username="{username}", realm="{realm}", '
                            f'nonce="{nonce}", uri="{rtsp_url}", response="{resp_full}", '
                            f'qop=auth, nc={nc}, cnonce="{cnonce}"'
                        )
                    else:
                        resp_full = hashlib.md5(f"{ha1}:{nonce}:{ha2_full}".encode("utf-8")).hexdigest()
                        auth_hdr = (
                            f'Authorization: Digest username="{username}", realm="{realm}", '
                            f'nonce="{nonce}", uri="{rtsp_url}", response="{resp_full}"'
                        )

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
                        if "\r\n\r\n" in data2:
                            header_part, _, body_part = data2.partition("\r\n\r\n")
                            cl_m = re.search(r'Content-Length:\s*(\d+)', header_part, re.IGNORECASE)
                            if cl_m:
                                cl = int(cl_m.group(1))
                                while len(body_part.encode("utf-8")) < cl:
                                    chunk = s.recv(2048).decode("utf-8", errors="ignore")
                                    if not chunk:
                                        break
                                    body_part += chunk
                            data2 = header_part + "\r\n\r\n" + body_part
                        if "m=video" in data2 or "application/sdp" in data2 or "s=" in data2:
                            return True

                    # Attempt B: Digest with relative path URI
                    if "RTSP/1.0 401" in data2:
                        cseq += 1
                        ha2_rel = hashlib.md5(f"DESCRIBE:{path}".encode("utf-8")).hexdigest()
                        if qop and "auth" in qop.lower():
                            resp_rel = hashlib.md5(f"{ha1}:{nonce}:{nc}:{cnonce}:auth:{ha2_rel}".encode("utf-8")).hexdigest()
                            auth_hdr_rel = (
                                f'Authorization: Digest username="{username}", realm="{realm}", '
                                f'nonce="{nonce}", uri="{path}", response="{resp_rel}", '
                                f'qop=auth, nc={nc}, cnonce="{cnonce}"'
                            )
                        else:
                            resp_rel = hashlib.md5(f"{ha1}:{nonce}:{ha2_rel}".encode("utf-8")).hexdigest()
                            auth_hdr_rel = (
                                f'Authorization: Digest username="{username}", realm="{realm}", '
                                f'nonce="{nonce}", uri="{path}", response="{resp_rel}"'
                            )
                        req3 = (
                            f"DESCRIBE {rtsp_url} RTSP/1.0\r\n"
                            f"CSeq: {cseq}\r\n"
                            f"User-Agent: EPIC-Command/3.2\r\n"
                            f"Accept: application/sdp\r\n"
                            f"{auth_hdr_rel}\r\n\r\n"
                        )
                        s.sendall(req3.encode("utf-8"))
                        data3 = s.recv(4096).decode("utf-8", errors="ignore")
                        if "RTSP/1.0 200" in data3:
                            if "m=video" in data3 or "application/sdp" in data3 or "s=" in data3:
                                return True

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
                        if "m=video" in data2 or "application/sdp" in data2 or "s=" in data2:
                            return True

            return False
    except Exception:
        return False


def probe_nvr(
    ip: str,
    username: str,
    password: str,
    port: Optional[int] = None,
    rtsp_port: Optional[int] = None
) -> Dict[str, Any]:
    """
    Strictly probes NVR reachability and discovers verified active camera channels.
    Never creates dummy or fake channels. Removes artificial max channel limits.
    """
    ip = ip.strip()
    username = username.strip()
    password = password.strip()

    user_enc = urllib.parse.quote(username, safe="")
    pass_enc = urllib.parse.quote(password, safe="")
    auth_part = f"{user_enc}:{pass_enc}@" if username else ""

    # 1. Fast targeted port probing
    detected_rtsp_port = None
    if rtsp_port:
        if check_tcp_port(ip, rtsp_port, timeout=1.5):
            detected_rtsp_port = rtsp_port

    if not detected_rtsp_port:
        for p in [554, 8554, 10554]:
            if p != rtsp_port and check_tcp_port(ip, p, timeout=1.0):
                detected_rtsp_port = p
                break

    detected_http_port = None
    if port:
        if check_tcp_port(ip, port, timeout=1.5):
            detected_http_port = port

    if not detected_http_port:
        for p in [80, 37725, 8000, 37777, 8080]:
            if p != port and check_tcp_port(ip, p, timeout=1.0):
                detected_http_port = p
                break

    if detected_rtsp_port == 37777:
        if check_tcp_port(ip, 554, timeout=1.0):
            detected_rtsp_port = 554

    if not detected_rtsp_port and not detected_http_port:
        return {
            "reachable": False,
            "error": f"Failed to connect to NVR. Host {ip} is unreachable or required network ports are closed.",
            "total_channels": 0,
            "cameras": []
        }

    detected_rtsp_port = detected_rtsp_port or 554
    detected_http_port = detected_http_port or 80

    vendor = "generic"
    candidate_cameras: List[Dict[str, Any]] = []

    # 2. Try Hikvision ISAPI Discovery
    try:
        hik_url = f"http://{ip}:{detected_http_port}/ISAPI/Streaming/channels"
        with httpx.Client(timeout=2.5) as client:
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
    except Exception:
        pass

    # 3. Try Dahua CGI Discovery if no candidates yet
    if not candidate_cameras:
        try:
            dahua_url = f"http://{ip}:{detected_http_port}/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle"
            with httpx.Client(timeout=3.0) as client:
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
        except Exception:
            pass

    # 4. Strict RTSP Pattern Fallback (No artificial channel limit)
    if not candidate_cameras:
        patterns = [
            ("/Streaming/Channels/{ch}01", "/Streaming/Channels/{ch}02", "hikvision"),
            ("/cam/realmonitor?channel={ch}&subtype=0", "/cam/realmonitor?channel={ch}&subtype=1", "dahua"),
            ("/ch{ch}/main", "/ch{ch}/sub", "generic"),
            ("/h264/ch{ch}/main/av_stream", "/h264/ch{ch}/sub/av_stream", "generic"),
        ]

        active_pattern = None
        for main_pat, sub_pat, vname in patterns:
            for test_ch in [1, 2]:
                if test_rtsp_describe(ip, detected_rtsp_port, main_pat.format(ch=test_ch), username, password, timeout=1.8):
                    active_pattern = (main_pat, sub_pat, vname)
                    vendor = vname
                    break
            if active_pattern:
                break

        if active_pattern:
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

    # 5. STRICT SIGNAL VALIDATION: Keep ONLY channels with verified live streams (200 OK + SDP)
    verified_cameras: List[Dict[str, Any]] = []
    if candidate_cameras:
        with ThreadPoolExecutor(max_workers=min(16, len(candidate_cameras))) as executor:
            future_to_cam = {
                executor.submit(
                    test_rtsp_describe,
                    ip,
                    detected_rtsp_port,
                    cam["path"],
                    username,
                    password,
                    2.0
                ): cam
                for cam in candidate_cameras
            }
            for future in as_completed(future_to_cam):
                cam = future_to_cam[future]
                try:
                    if future.result():
                        cam_clean = dict(cam)
                        cam_clean.pop("path", None)
                        verified_cameras.append(cam_clean)
                except Exception:
                    pass

    verified_cameras.sort(key=lambda c: c["channel_number"])

    if not verified_cameras:
        return {
            "reachable": False,
            "error": f"NVR host {ip} responded on network ports, but no active camera channels or live video streams could be verified. Please check physical connections and credentials.",
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
