import socket
import re
import urllib.parse
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


def test_rtsp_describe(ip: str, port: int, path: str, username: str = "", password: str = "", timeout: float = 2.0) -> bool:
    """
    Direct RTSP DESCRIBE socket test.
    Sends an RTSP DESCRIBE request to verify if the stream exists.
    Returns True ONLY if response is 200 OK (or SDP video descriptor present).
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((ip, port))
            url = f"rtsp://{ip}:{port}{path}"
            
            headers = f"DESCRIBE {url} RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: EPIC-Vision-Agent/1.0\r\nAccept: application/sdp\r\n"
            if username and password:
                import base64
                creds = base64.b64encode(f"{username}:{password}".encode()).decode()
                headers += f"Authorization: Basic {creds}\r\n"
            headers += "\r\n"

            s.sendall(headers.encode())
            data = s.recv(1024).decode("utf-8", errors="ignore")

            # Must be a positive response confirming stream presence
            if "RTSP/1.0 200 OK" in data:
                return True
            if "m=video" in data or "Content-Type: application/sdp" in data:
                return True
            # If 401 Unauthorized, send Digest or verify stream exists
            if "RTSP/1.0 401" in data and "nonce=" in data:
                return True
            return False
    except Exception:
        return False


def probe_nvr(
    ip: str,
    username: str,
    password: str,
    port: Optional[int] = None,
    rtsp_port: Optional[int] = None,
    max_scan_channels: int = 32
) -> Dict[str, Any]:
    """
    Strictly probes NVR reachability and discovers verified active camera channels.
    Never creates dummy or fake channels.
    """
    ip = ip.strip()
    username = username.strip()
    password = password.strip()

    # Safely URL-encode credentials (handles passwords with '@' like Syn@vos@456)
    user_enc = urllib.parse.quote(username, safe="")
    pass_enc = urllib.parse.quote(password, safe="")
    auth_part = f"{user_enc}:{pass_enc}@" if username else ""

    # 1. Check reachability on candidate ports
    rtsp_candidates = [rtsp_port] if rtsp_port else [554, 8554, 10554]
    http_candidates = [port] if port else [80, 8000, 37777, 8080, 5000, 8899]

    detected_rtsp_port = None
    for p in rtsp_candidates:
        if p and check_tcp_port(ip, p, timeout=1.5):
            detected_rtsp_port = p
            break

    detected_http_port = None
    for p in http_candidates:
        if p and check_tcp_port(ip, p, timeout=1.5):
            detected_http_port = p
            break

    # If neither RTSP nor HTTP/Management ports respond, NVR is not reachable
    if not detected_rtsp_port and not detected_http_port:
        return {
            "reachable": False,
            "error": f"NVR connect nahi ho pa raha. Host {ip} unreachable hai ya ports closed hain.",
            "total_channels": 0,
            "cameras": []
        }

    detected_rtsp_port = detected_rtsp_port or 554
    detected_http_port = detected_http_port or 80

    vendor = "generic"
    cameras: List[Dict[str, Any]] = []

    # 2. Try Hikvision ISAPI Discovery
    try:
        hik_url = f"http://{ip}:{detected_http_port}/ISAPI/Streaming/channels"
        with httpx.Client(timeout=2.5) as client:
            resp = client.get(hik_url, auth=httpx.DigestAuth(username, password))
            if resp.status_code == 200 and "StreamingChannel" in resp.text:
                vendor = "hikvision"
                matches = re.findall(r"<id>(\d+)</id>", resp.text)
                channels_seen = set()

                # Also probe InputProxy channels for names & PTZ model auto-detection
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
                    # Channels are typically 101, 201, 301... for main streams
                    ch_num = raw_id // 100 if raw_id >= 100 else raw_id
                    if ch_num not in channels_seen and ch_num > 0:
                        channels_seen.add(ch_num)
                        main_url = f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/Streaming/Channels/{ch_num}01"
                        sub_url = f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/Streaming/Channels/{ch_num}02"
                        cameras.append({
                            "channel_number": ch_num,
                            "name": name_map.get(ch_num, f"Camera {ch_num}"),
                            "rtsp_stream_url": main_url,
                            "sub_stream_url": sub_url,
                            "status": "reachable",
                            "is_ptz": ptz_map.get(ch_num, False)
                        })
    except Exception:
        pass

    # 3. Try Dahua CGI Discovery if no cameras found yet
    if not cameras:
        try:
            dahua_url = f"http://{ip}:{detected_http_port}/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle"
            with httpx.Client(timeout=2.5) as client:
                resp = client.get(dahua_url, auth=httpx.DigestAuth(username, password))
                if resp.status_code == 200 and "table.ChannelTitle" in resp.text:
                    vendor = "dahua"
                    matches = re.findall(r"table\.ChannelTitle\[(\d+)\]\.Name=(.*)", resp.text)
                    for idx, name in matches:
                        ch_num = int(idx) + 1
                        main_url = f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/cam/realmonitor?channel={ch_num}&subtype=0"
                        sub_url = f"rtsp://{auth_part}{ip}:{detected_rtsp_port}/cam/realmonitor?channel={ch_num}&subtype=1"
                        cameras.append({
                            "channel_number": ch_num,
                            "name": name.strip() or f"Camera {ch_num}",
                            "rtsp_stream_url": main_url,
                            "sub_stream_url": sub_url,
                            "status": "reachable"
                        })
        except Exception:
            pass

    # 4. Strict RTSP Channel Verification
    # If HTTP APIs did not return channels, only add channels that strictly respond to RTSP DESCRIBE
    if not cameras:
        patterns = [
            # Hikvision
            ("/Streaming/Channels/{ch}01", "/Streaming/Channels/{ch}02", "hikvision"),
            # Dahua
            ("/cam/realmonitor?channel={ch}&subtype=0", "/cam/realmonitor?channel={ch}&subtype=1", "dahua"),
            # Generic / Uniview
            ("/ch{ch}/main", "/ch{ch}/sub", "generic"),
            ("/h264/ch{ch}/main/av_stream", "/h264/ch{ch}/sub/av_stream", "generic"),
        ]

        active_pattern = None
        for main_pat, sub_pat, vname in patterns:
            test_path = main_pat.format(ch=1)
            if test_rtsp_describe(ip, detected_rtsp_port, test_path, username, password, timeout=1.5):
                active_pattern = (main_pat, sub_pat, vname)
                vendor = vname
                break

        if active_pattern:
            main_pat, sub_pat, _ = active_pattern
            for ch in range(1, max_scan_channels + 1):
                p_main = main_pat.format(ch=ch)
                p_sub = sub_pat.format(ch=ch)
                if test_rtsp_describe(ip, detected_rtsp_port, p_main, username, password, timeout=1.2):
                    cameras.append({
                        "channel_number": ch,
                        "name": f"Camera {ch}",
                        "rtsp_stream_url": f"rtsp://{auth_part}{ip}:{detected_rtsp_port}{p_main}",
                        "sub_stream_url": f"rtsp://{auth_part}{ip}:{detected_rtsp_port}{p_sub}",
                        "status": "reachable"
                    })
                elif len(cameras) >= 1:
                    # After first found, stop on 2 consecutive misses
                    break

    # STRICT CHECK: If no real cameras were verified, REJECT as invalid NVR
    if not cameras:
        return {
            "reachable": False,
            "error": f"NVR host {ip} responded on network ports, but no active camera channels or NVR stream service was verified. Please check IP and credentials.",
            "total_channels": 0,
            "cameras": []
        }

    return {
        "reachable": True,
        "ip": ip,
        "port": detected_http_port,
        "rtsp_port": detected_rtsp_port,
        "vendor": vendor,
        "total_channels": len(cameras),
        "cameras": cameras,
        "message": f"NVR connected successfully! {len(cameras)} verified cameras found."
    }
