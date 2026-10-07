#!/usr/bin/env python3
"""On-demand native resolver for public or user-authorized social media.

The browser starts this process for one request through native messaging. It
uses yt-dlp for format discovery and does not bypass DRM or access controls.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

MAX_MESSAGE_BYTES = 64 * 1024 * 1024
THUMBNAIL_MAX_BYTES = 15 * 1024 * 1024
THUMBNAIL_REQUEST_TIMEOUT_SECONDS = 20
EMBED_WAIT_TIMEOUT_SECONDS = 24 * 60 * 60
EMBED_POLL_SECONDS = 3
EMBEDDABLE_EXTENSIONS = {'.mp4', '.m4v', '.mov', '.m4a', '.3gp'}
ALLOWED_HOSTS = {
    "facebook.com",
    "fb.watch",
    "dailymotion.com",
    "dai.ly",
    "youtube.com",
    "youtu.be",
    "pornhub.com",
}


def is_allowed_page_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    if parsed.scheme not in {"http", "https"}:
        return False
    hostname = (parsed.hostname or "").lower().removeprefix("www.")
    return any(hostname == host or hostname.endswith("." + host) for host in ALLOWED_HOSTS)


def is_http_url(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return urlparse(value).scheme in {'http', 'https'}
    except ValueError:
        return False


def choose_thumbnail(info: dict[str, object]) -> str | None:
    thumbnail = info.get('thumbnail')
    if is_http_url(thumbnail):
        return str(thumbnail)
    thumbnails = info.get('thumbnails')
    if isinstance(thumbnails, list):
        for candidate in reversed(thumbnails):
            if isinstance(candidate, dict) and is_http_url(candidate.get('url')):
                return str(candidate['url'])
    return None


def resolve_page(payload: dict[str, object]) -> dict[str, object]:
    page_url = payload.get("url")
    if not isinstance(page_url, str) or not is_allowed_page_url(page_url):
        return {"ok": False, "error": "Only supported Facebook, YouTube, Dailymotion, and Pornhub page URLs are allowed."}

    cookie = payload.get("cookie")
    user_agent = payload.get("userAgent")
    cookie_file = find_cookie_file()
    hostname = (urlparse(page_url).hostname or "").lower().removeprefix("www.")
    clients: tuple[str | None, ...] = (
        ("web", "web_safari", "mweb", "android_vr")
        if hostname in {"youtube.com", "youtu.be"} or hostname.endswith(".youtube.com")
        else (None,)
    )
    errors: list[str] = []

    for client in clients:
        command = [
            sys.executable,
            "-m",
            "yt_dlp",
            "--dump-single-json",
            "--no-warnings",
            "--skip-download",
            "--no-playlist",
            "--js-runtimes",
            "deno",
            "--format",
            "best[protocol^=http][ext=mp4]/best[protocol^=http]",
            page_url,
        ]
        if client:
            command[9:9] = ["--extractor-args", f"youtube:player_client={client}"]
        if cookie_file:
            command[4:4] = ["--cookies", str(cookie_file)]
        elif isinstance(cookie, str) and cookie:
            command[4:4] = ["--add-header", f"Cookie: {cookie}"]
        if isinstance(user_agent, str) and user_agent:
            command[4:4] = ["--add-header", f"User-Agent: {user_agent}"]

        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=45,
                check=False,
            )
        except FileNotFoundError:
            return {"ok": False, "error": "yt-dlp is not installed. Run install.sh once for this resolver."}
        except subprocess.TimeoutExpired:
            errors.append("The social-media resolver timed out.")
            continue

        if completed.returncode != 0:
            errors.append(clean_error(completed.stderr or completed.stdout, hostname))
            continue
        try:
            info = json.loads(completed.stdout)
        except json.JSONDecodeError:
            errors.append("yt-dlp returned an invalid media description.")
            continue

        direct_url = info.get("url")
        if not isinstance(direct_url, str) or urlparse(direct_url).scheme not in {"http", "https"}:
            requested_formats = info.get("requested_formats")
            if isinstance(requested_formats, list) and requested_formats:
                first_format = requested_formats[0]
                direct_url = first_format.get("url") if isinstance(first_format, dict) else None
        if not isinstance(direct_url, str) or urlparse(direct_url).scheme not in {"http", "https"}:
            errors.append(clean_error("No direct public media format was exposed for this page.", hostname))
            continue

        ext = str(info.get("ext") or "mp4")
        file_size = info.get("filesize") or info.get("filesize_approx")
        title = str(info.get("title") or "social-media")
        filename = build_social_filename(str(info.get("_filename") or ""), title, ext)
        thumbnail = choose_thumbnail(info)
        headers = info.get("http_headers")
        safe_headers: dict[str, str] = {}
        if isinstance(headers, dict):
            for name in ("Cookie", "Referer", "User-Agent", "Accept", "Accept-Language", "Origin"):
                value = headers.get(name)
                if isinstance(value, str) and value:
                    safe_headers[name] = value

        return {
            "ok": True,
            "title": title,
            "url": direct_url,
            "filename": filename,
            "ext": ext,
            "fileSize": file_size if isinstance(file_size, int) and file_size > 0 else None,
            "mime": info.get("mime_type") if isinstance(info.get("mime_type"), str) else None,
            "thumbnail": thumbnail,
            "headers": safe_headers,
        }

    return {"ok": False, "error": errors[0] if errors else clean_error("", hostname)}


def find_cookie_file() -> Path | None:
    candidates: list[Path] = []
    configured_path = os.environ.get("MOTRIX_COOKIE_FILE")
    if configured_path:
        candidates.append(Path(configured_path).expanduser())
    candidates.append(Path(__file__).with_name("cookies.txt"))
    data_home = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    candidates.append(data_home / "media-picker" / "cookies.txt")
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        candidates.append(Path(local_app_data) / "Media Picker" / "cookies.txt")

    for path in candidates:
        if not path.is_file():
            continue
        try:
            has_cookie = any(
                line.strip() and not line.lstrip().startswith("#") and len(line.rstrip("\n").split("\t")) >= 7
                for line in path.read_text(encoding="utf-8", errors="ignore").splitlines()
            )
        except OSError:
            continue
        if has_cookie:
            return path
    return None


def build_social_filename(filename: str, title: str, ext: str) -> str:
    preferred = title if title and not is_generic_filename(title) else filename or title or "social-media"
    normalized_ext = (ext or extract_extension(filename) or "mp4").lstrip(".").lower()
    base = re.sub(r"\.[a-z0-9]{2,5}$", "", preferred, flags=re.IGNORECASE)
    base = re.sub(r"\s*\[[^\]]{4,}\]\s*$", "", base)
    base = re.sub(r"[\\/:*?\"<>|]", "_", base)
    base = re.sub(r"[\x00-\x1f]", "", base)
    base = re.sub(r"\s+", " ", base).strip()
    return f"{base or 'social-media'}.{normalized_ext}"


def is_generic_filename(value: str) -> bool:
    return bool(re.fullmatch(r"(?:download|file|media|video|audio|videoplayback|manifest|master|playlist)(?:\.[a-z0-9]{2,5})?", value.strip(), re.IGNORECASE))


def extract_extension(value: str) -> str | None:
    match = re.search(r"\.([a-z0-9]{2,5})$", value, re.IGNORECASE)
    return match.group(1) if match else None


def rename_local_file(payload: dict[str, object]) -> dict[str, object]:
    path = payload.get("path")
    filename = payload.get("filename")
    if not isinstance(path, str) or not isinstance(filename, str):
        return {"ok": False, "error": "A local file path and filename are required."}
    if not filename.strip() or any(separator in filename for separator in ("/", "\\\\")):
        return {"ok": False, "error": "The new filename must be a non-empty file name without folders."}
    clean_filename = re.sub(r"[\\/:*?\"<>|]", "_", filename)
    clean_filename = re.sub(r"\s+", " ", clean_filename).strip()
    if not clean_filename or clean_filename in {".", ".."}:
        return {"ok": False, "error": "The new filename is not valid."}
    source = os.path.abspath(path)
    if not os.path.isfile(source):
        return {"ok": False, "error": "The downloaded file is not available for renaming."}
    target = os.path.join(os.path.dirname(source), clean_filename)
    if source != target and os.path.exists(target):
        return {"ok": False, "error": "A file with that name already exists."}
    if source != target:
        os.replace(source, target)
        sidecar = f"{source}.aria2"
        if os.path.exists(sidecar):
            os.replace(sidecar, f"{target}.aria2")
    return {"ok": True, "filename": clean_filename}


def rpc_call(endpoint: str, secret: str, method: str, params: list[object]) -> object:
    rpc_params = ([f'token:{secret}'] if secret else []) + params
    body = json.dumps({
        'jsonrpc': '2.0',
        'id': f'motrix-thumbnail-{time.time_ns()}',
        'method': method,
        'params': rpc_params,
    }).encode('utf-8')
    request = urllib.request.Request(endpoint, data=body, headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(request, timeout=10) as response:
        result = json.loads(response.read().decode('utf-8'))
    if not isinstance(result, dict):
        raise RuntimeError('aria2 returned an invalid response while embedding the thumbnail')
    error = result.get('error')
    if isinstance(error, dict):
        raise RuntimeError(str(error.get('message') or 'aria2 rejected the thumbnail worker request'))
    return result.get('result')


def get_completed_file_path(endpoint: str, secret: str, gid: str) -> tuple[str | None, str | None]:
    result = rpc_call(endpoint, secret, 'aria2.tellStatus', [gid, ['status', 'dir', 'files']])
    if not isinstance(result, dict):
        return None, 'aria2 returned no task status'
    status = str(result.get('status') or '')
    if status != 'complete':
        if status in {'error', 'removed'}:
            return None, f'Download finished with status {status}'
        return None, None
    files = result.get('files')
    if not isinstance(files, list):
        return None, 'The completed download has no file list'
    selected = next((item for item in files if isinstance(item, dict) and item.get('selected') == 'true'), None)
    candidate = selected if isinstance(selected, dict) else next((item for item in files if isinstance(item, dict)), None)
    path = candidate.get('path') if isinstance(candidate, dict) else None
    if not isinstance(path, str) or not path:
        return None, 'The completed download has no local file path'
    if not os.path.isabs(path):
        directory = result.get('dir')
        if isinstance(directory, str) and directory:
            path = os.path.join(directory, path)
    return os.path.abspath(path), None


def wait_for_completed_file(endpoint: str, secret: str, gid: str) -> tuple[str | None, str | None]:
    deadline = time.monotonic() + EMBED_WAIT_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        try:
            path, reason = get_completed_file_path(endpoint, secret, gid)
        except (OSError, ValueError, RuntimeError, urllib.error.URLError) as error:
            if time.monotonic() + EMBED_POLL_SECONDS >= deadline:
                return None, str(error)
            time.sleep(EMBED_POLL_SECONDS)
            continue
        if path or reason:
            return path, reason
        time.sleep(EMBED_POLL_SECONDS)
    return None, 'Timed out waiting for the social-media download to complete'


def download_thumbnail(url: str, headers: list[dict[str, object]]) -> str:
    request_headers = {
        str(item.get('name')): str(item.get('value'))
        for item in headers
        if isinstance(item, dict) and isinstance(item.get('name'), str) and isinstance(item.get('value'), str)
    }
    request = urllib.request.Request(url, headers=request_headers)
    with urllib.request.urlopen(request, timeout=THUMBNAIL_REQUEST_TIMEOUT_SECONDS) as response:
        length = response.headers.get('Content-Length')
        if length and int(length) > THUMBNAIL_MAX_BYTES:
            raise RuntimeError('The social thumbnail is too large to embed safely')
        suffix = Path(urlparse(url).path).suffix.lower()
        suffix = suffix if suffix in {'.jpg', '.jpeg', '.png', '.webp'} else '.jpg'
        file_handle = tempfile.NamedTemporaryFile(prefix='motrix-thumbnail-', suffix=suffix, delete=False)
        path = file_handle.name
        total = 0
        try:
            with file_handle:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > THUMBNAIL_MAX_BYTES:
                        raise RuntimeError('The social thumbnail is too large to embed safely')
                    file_handle.write(chunk)
        except Exception:
            try:
                os.unlink(path)
            except OSError:
                pass
            raise
    return path


def embed_thumbnail_into_file(media_path: str, thumbnail_path: str) -> dict[str, object]:
    extension = Path(media_path).suffix.lower()
    if extension not in EMBEDDABLE_EXTENSIONS:
        return {'ok': True, 'embedded': False, 'reason': f'File type {extension or "unknown"} does not support embedded cover artwork'}
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        return {'ok': True, 'embedded': False, 'reason': 'ffmpeg is not installed'}
    temporary_path = f'{media_path}.motrix-cover{extension}'
    command = [
        ffmpeg,
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-i',
        media_path,
        '-i',
        thumbnail_path,
        '-map',
        '0',
        '-map',
        '1:v:0',
        '-map_metadata',
        '0',
        '-c',
        'copy',
        '-c:v:1',
        'mjpeg',
        '-disposition:v:1',
        'attached_pic',
        '-metadata:s:v:1',
        'title=Cover',
        temporary_path,
    ]
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=180, check=False)
        if completed.returncode != 0 or not os.path.isfile(temporary_path) or os.path.getsize(temporary_path) <= 0:
            detail = (completed.stderr or 'ffmpeg could not embed the social thumbnail').strip()
            return {'ok': True, 'embedded': False, 'reason': detail[-500:]}
        os.replace(temporary_path, media_path)
        return {'ok': True, 'embedded': True}
    finally:
        if os.path.exists(temporary_path):
            try:
                os.unlink(temporary_path)
            except OSError:
                pass


def embed_thumbnail(payload: dict[str, object]) -> dict[str, object]:
    gid = payload.get('gid')
    thumbnail = payload.get('thumbnail')
    endpoint = payload.get('endpoint')
    secret = payload.get('secret')
    raw_headers = payload.get('headers')
    if not isinstance(gid, str) or not gid:
        return {'ok': False, 'error': 'A download task ID is required for thumbnail embedding.'}
    if not is_http_url(thumbnail) or not isinstance(endpoint, str) or not is_http_url(endpoint):
        return {'ok': False, 'error': 'A valid thumbnail URL and aria2 endpoint are required.'}
    path, reason = wait_for_completed_file(endpoint, secret if isinstance(secret, str) else '', gid)
    if not path:
        return {'ok': True, 'embedded': False, 'reason': reason or 'The download did not complete.'}
    headers = raw_headers if isinstance(raw_headers, list) else []
    thumbnail_path: str | None = None
    try:
        thumbnail_path = download_thumbnail(str(thumbnail), headers)
        return embed_thumbnail_into_file(path, thumbnail_path)
    except (OSError, ValueError, RuntimeError, urllib.error.URLError) as error:
        return {'ok': True, 'embedded': False, 'reason': str(error)[:500]}
    finally:
        if thumbnail_path:
            try:
                os.unlink(thumbnail_path)
            except OSError:
                pass


def clean_error(value: str, hostname: str = "") -> str:
    lines = [line.strip() for line in value.splitlines() if line.strip()]
    detail = lines[-1] if lines else "The social-media resolver could not resolve this page."
    lowered = detail.lower()
    is_youtube = hostname in {"youtube.com", "youtu.be"} or hostname.endswith(".youtube.com")
    is_pornhub = hostname == "pornhub.com" or hostname.endswith(".pornhub.com")
    if is_youtube and ("no supported javascript runtime" in lowered or "javascript runtime" in lowered):
        return "YouTube now requires the picker's JavaScript runtime. Run the latest one-time Media Picker installer."
    if is_youtube and ("sign in to confirm" in lowered or "not a bot" in lowered):
        return "YouTube blocked this request. Keep YouTube signed in in the browser, then run the latest resolver installer and try again."
    if is_youtube and ("po token" in lowered or "poh token" in lowered):
        return "YouTube requires a valid PO Token for this request; cookies alone may not be sufficient. Open the video in the browser and use Motrix media capture instead."
    if is_pornhub and ("requested format is not available" in lowered or "no direct" in lowered or "unavailable" in lowered):
        return "Pornhub did not expose a direct downloadable media format for this request. Confirm the video is available in the authorized browser session, then use Motrix media capture."
    if "requested format is not available" in lowered or "no direct" in lowered:
        return "The site did not expose a direct downloadable HTTP media format for this request. Open the page in the browser and use Motrix media capture, or provide an authorized cookie export."
    return detail[:500]


def read_message() -> dict[str, object] | None:
    header = sys.stdin.buffer.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise ValueError("Incomplete native message header")
    length = struct.unpack("<I", header)[0]
    if length <= 0 or length > MAX_MESSAGE_BYTES:
        raise ValueError("Invalid native message size")
    body = sys.stdin.buffer.read(length)
    if len(body) != length:
        raise ValueError("Incomplete native message body")
    value = json.loads(body.decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Native message must be a JSON object")
    return value


def write_message(value: dict[str, object]) -> None:
    body = json.dumps(value, separators=(",", ":")).encode("utf-8")
    if len(body) > MAX_MESSAGE_BYTES:
        raise ValueError("Native response is too large")
    sys.stdout.buffer.write(struct.pack("<I", len(body)))
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


def run_native() -> None:
    try:
        payload = read_message()
        if payload is None:
            return
        action = payload.get("action")
        if action == "rename":
            write_message(rename_local_file(payload))
        elif action == "embed-thumbnail":
            write_message(embed_thumbnail(payload))
        else:
            write_message(resolve_page(payload))
    except Exception as error:  # Keep stdout protocol valid with a structured error.
        write_message({"ok": False, "error": str(error)[:500]})


if __name__ == "__main__":
    run_native()
