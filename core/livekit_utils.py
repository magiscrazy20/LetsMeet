import random
import string
from urllib.parse import urlparse, urlunparse


def random_string(length: int) -> str:
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choice(chars) for _ in range(length))


def generate_room_id() -> str:
    return f"{random_string(4)}-{random_string(4)}"


def get_livekit_url(project_url: str, region: str | None) -> str:
    """Port of lib/getLiveKitURL.ts — rewrites the host to include a region for livekit.cloud."""
    parsed = urlparse(project_url)
    if region and "livekit.cloud" in (parsed.hostname or ""):
        parts = (parsed.hostname or "").split(".")
        project_id, host_parts = parts[0], parts[1:]
        if not host_parts or host_parts[0] != "staging":
            host_parts = ["production", *host_parts]
        new_host = ".".join([project_id, region, *host_parts])
        netloc = new_host
        if parsed.port:
            netloc = f"{new_host}:{parsed.port}"
        parsed = parsed._replace(netloc=netloc)
    return urlunparse(parsed)
