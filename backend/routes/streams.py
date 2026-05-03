"""HTTP routes for the RTMP/HLS ingestion prototype."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl

from auth import AuthContext, get_auth_context
from pipeline.stream import (
    StreamState,
    playlist_path_for_match,
    start_stream,
    stop_stream,
    stream_status,
)
from settings import get_settings
from storage import get_supabase_client

router = APIRouter(prefix="/streams", tags=["streams"])


class StartStreamRequest(BaseModel):
    match_id: str
    source_url: HttpUrl | str  # HttpUrl for hls(s); rtmp(s) accepted as plain str.


class StreamStatusResponse(BaseModel):
    match_id: str
    state: StreamState
    kind: str
    source_url: str
    last_error: str | None
    segment_count: int
    buffered_seconds: int


def _persist_match_source(match_id: str, source_url: str) -> None:
    """Update the matches row with the new stream URL + kind so the
    frontend's video-source helper can render the live HLS playback."""
    client = get_supabase_client()
    if client is None:
        return
    kind = "rtmp" if str(source_url).startswith(("rtmp://", "rtmps://")) else "hls"
    try:
        client.table("matches").update(
            {
                "video_source_kind": kind,
                "video_stream_url": str(source_url),
                # Connecting a live source flips the match into the live
                # state — that's where the REC pulse + live console UX kicks
                # in. Disconnect intentionally does not revert; the official
                # can change it back to `completed` later if they want.
                "status": "live",
            }
        ).eq("id", match_id).execute()
    except Exception:  # noqa: BLE001
        # Demo robustness — log but don't block the user.
        import logging  # noqa: PLC0415

        logging.getLogger("atletico-backend.streams").exception(
            "Failed to persist stream source for match %s", match_id
        )


@router.post("/start", response_model=StreamStatusResponse)
def start(
    body: StartStreamRequest,
    _auth: Annotated[AuthContext, Depends(get_auth_context)],
) -> StreamStatusResponse:
    source_url = str(body.source_url)
    if not source_url.startswith(("rtmp://", "rtmps://", "http://", "https://")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="source_url must start with rtmp(s):// or http(s)://.",
        )
    worker = start_stream(body.match_id, source_url)
    _persist_match_source(body.match_id, source_url)
    info = stream_status(body.match_id)
    if info is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Stream worker failed to register.",
        )
    return StreamStatusResponse(**info)


@router.get("/{match_id}/status", response_model=StreamStatusResponse)
def status_endpoint(
    match_id: str,
    _auth: Annotated[AuthContext, Depends(get_auth_context)],
) -> StreamStatusResponse:
    info = stream_status(match_id)
    if info is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active stream worker for this match.",
        )
    return StreamStatusResponse(**info)


@router.post("/{match_id}/stop")
def stop(
    match_id: str,
    _auth: Annotated[AuthContext, Depends(get_auth_context)],
) -> dict:
    ok = stop_stream(match_id)
    return {"stopped": ok}


@router.get("/{match_id}/playlist.m3u8")
def playlist(match_id: str) -> FileResponse:
    """Serve the live HLS playlist directly so the browser <video> can play it."""
    path = playlist_path_for_match(match_id)
    if path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No playlist available yet — buffer is still warming up.",
        )
    return FileResponse(
        path,
        media_type="application/vnd.apple.mpegurl",
        headers={"Cache-Control": "no-cache"},
    )


@router.get("/{match_id}/{segment}")
def segment(match_id: str, segment: str) -> FileResponse:
    """Serve a single HLS segment (e.g. ``segment_007.ts``)."""
    if not segment.startswith("segment_") or not segment.endswith(".ts"):
        raise HTTPException(status_code=400, detail="Invalid segment name.")
    settings = get_settings()
    path = settings.project_root / "tmp" / "streams" / match_id / segment
    if not path.exists():
        raise HTTPException(status_code=404, detail="Segment not found.")
    return FileResponse(path, media_type="video/mp2t")
