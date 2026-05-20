import asyncio
import json
from datetime import datetime, timezone
from email.utils import format_datetime
from urllib.parse import urlparse

from django.conf import settings
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET

from livekit import api
from livekit.protocol.egress import (
    EncodedFileOutput,
    EncodedFileType,
    RoomCompositeEgressRequest,
    S3Upload,
)

from .livekit_utils import generate_room_id, get_livekit_url, random_string

COOKIE_KEY = "random-participant-postfix"


def home(request: HttpRequest) -> HttpResponse:
    return render(request, "landing.html")


def video(request: HttpRequest) -> HttpResponse:
    return render(
        request,
        "home.html",
        {"suggested_room_id": generate_room_id()},
    )


def voice(request: HttpRequest) -> HttpResponse:
    return render(
        request,
        "voice.html",
        {"suggested_room_id": generate_room_id()},
    )


def voice_room(request: HttpRequest, room_name: str) -> HttpResponse:
    return render(
        request,
        "voice_room.html",
        {
            "room_name": room_name,
            "connection_details_endpoint": "/api/connection-details",
        },
    )


def chat(request: HttpRequest) -> HttpResponse:
    return render(
        request,
        "chat.html",
        {"suggested_room_id": generate_room_id()},
    )


def chat_room(request: HttpRequest, room_name: str) -> HttpResponse:
    return render(
        request,
        "chat_room.html",
        {
            "room_name": room_name,
            "connection_details_endpoint": "/api/connection-details",
        },
    )


def custom_page(request: HttpRequest) -> HttpResponse:
    return render(
        request,
        "custom.html",
        {
            "livekit_url": request.GET.get("liveKitUrl", ""),
            "token": request.GET.get("token", ""),
        },
    )


def room(request: HttpRequest, room_name: str) -> HttpResponse:
    return render(
        request,
        "room.html",
        {
            "room_name": room_name,
            "connection_details_endpoint": "/api/connection-details",
        },
    )


@require_GET
def connection_details(request: HttpRequest) -> HttpResponse:
    """Port of app/api/connection-details/route.ts"""
    if not settings.LIVEKIT_URL:
        return HttpResponse("LIVEKIT_URL is not defined", status=500)
    if not settings.LIVEKIT_API_KEY or not settings.LIVEKIT_API_SECRET:
        return HttpResponse("LiveKit API credentials are not configured", status=500)

    room_name = request.GET.get("roomName")
    participant_name = request.GET.get("participantName")
    metadata = request.GET.get("metadata", "")
    region = request.GET.get("region")

    if room_name is None:
        return HttpResponse("Missing required query parameter: roomName", status=400)
    if participant_name is None:
        return HttpResponse("Missing required query parameter: participantName", status=400)

    try:
        livekit_server_url = (
            get_livekit_url(settings.LIVEKIT_URL, region) if region else settings.LIVEKIT_URL
        )
    except Exception:
        return HttpResponse("Invalid region", status=500)

    postfix = request.COOKIES.get(COOKIE_KEY) or random_string(4)

    grants = api.VideoGrants(
        room=room_name,
        room_join=True,
        can_publish=True,
        can_publish_data=True,
        can_subscribe=True,
    )
    token = (
        api.AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        .with_identity(f"{participant_name}__{postfix}")
        .with_name(participant_name)
        .with_metadata(metadata)
        .with_grants(grants)
        .with_ttl(_minutes(5))
        .to_jwt()
    )

    response = JsonResponse(
        {
            "serverUrl": livekit_server_url,
            "roomName": room_name,
            "participantToken": token,
            "participantName": participant_name,
        }
    )
    response.set_cookie(
        COOKIE_KEY,
        postfix,
        max_age=60 * 120,
        path="/",
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Strict",
    )
    return response


def _minutes(n: int):
    from datetime import timedelta

    return timedelta(minutes=n)


@require_GET
def record_start(request: HttpRequest) -> HttpResponse:
    """Port of app/api/record/start/route.ts.

    CAUTION: like the original, this is unauthenticated — anyone with the room
    name can start a recording. Do not deploy as-is.
    """
    room_name = request.GET.get("roomName")
    if not room_name:
        return HttpResponse("Missing roomName parameter", status=403)
    if not settings.LIVEKIT_URL:
        return HttpResponse("LIVEKIT_URL is not defined", status=500)

    host_url = _https_origin(settings.LIVEKIT_URL)

    async def _run():
        client = api.LiveKitAPI(
            url=host_url,
            api_key=settings.LIVEKIT_API_KEY,
            api_secret=settings.LIVEKIT_API_SECRET,
        )
        try:
            existing = await client.egress.list_egress(api.ListEgressRequest(room_name=room_name))
            for info in existing.items:
                # statuses 0=STARTING, 1=ACTIVE — already running
                if info.status < 2:
                    return HttpResponse("Meeting is already being recorded", status=409)

            now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            file_output = EncodedFileOutput(
                file_type=EncodedFileType.MP4,
                filepath=f"{now}-{room_name}.mp4",
                s3=S3Upload(
                    access_key=settings.S3_KEY_ID,
                    secret=settings.S3_KEY_SECRET,
                    region=settings.S3_REGION,
                    bucket=settings.S3_BUCKET,
                    endpoint=settings.S3_ENDPOINT,
                ),
            )
            await client.egress.start_room_composite_egress(
                RoomCompositeEgressRequest(
                    room_name=room_name,
                    layout="speaker",
                    file_outputs=[file_output],
                )
            )
            return HttpResponse(status=200)
        finally:
            await client.aclose()

    try:
        return asyncio.run(_run())
    except Exception as exc:
        return HttpResponse(str(exc), status=500)


@require_GET
def record_stop(request: HttpRequest) -> HttpResponse:
    """Port of app/api/record/stop/route.ts."""
    room_name = request.GET.get("roomName")
    if not room_name:
        return HttpResponse("Missing roomName parameter", status=403)
    if not settings.LIVEKIT_URL:
        return HttpResponse("LIVEKIT_URL is not defined", status=500)

    host_url = _https_origin(settings.LIVEKIT_URL)

    async def _run():
        client = api.LiveKitAPI(
            url=host_url,
            api_key=settings.LIVEKIT_API_KEY,
            api_secret=settings.LIVEKIT_API_SECRET,
        )
        try:
            existing = await client.egress.list_egress(api.ListEgressRequest(room_name=room_name))
            active = [info for info in existing.items if info.status < 2]
            if not active:
                return HttpResponse("No active recording found", status=404)
            for info in active:
                await client.egress.stop_egress(api.StopEgressRequest(egress_id=info.egress_id))
            return HttpResponse(status=200)
        finally:
            await client.aclose()

    try:
        return asyncio.run(_run())
    except Exception as exc:
        return HttpResponse(str(exc), status=500)


def _https_origin(ws_url: str) -> str:
    parsed = urlparse(ws_url)
    scheme = "https"
    netloc = parsed.netloc or parsed.path
    return f"{scheme}://{netloc}"
