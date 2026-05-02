"""POST /extract-clip — pull a 5-15s segment from a source video and upload it."""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from auth import AuthContext, get_auth_context
from pipeline.extract import cut_clip, grab_snapshot
from schemas.payload import ExtractClipRequest, ExtractClipResponse
from settings import Settings, get_settings
from storage import has_supabase, signed_url, upload_file

router = APIRouter(tags=["extract"])


def _resolve_source(source_path: str, settings: Settings) -> Path:
    candidate = Path(source_path)
    if not candidate.is_absolute():
        candidate = settings.samples_path / source_path
    if not candidate.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source video not found: {candidate}",
        )
    return candidate


@router.post("/extract-clip", response_model=ExtractClipResponse)
def extract_clip(
    body: ExtractClipRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    _auth: Annotated[AuthContext, Depends(get_auth_context)],
) -> ExtractClipResponse:
    source = _resolve_source(body.source_path, settings)

    with tempfile.TemporaryDirectory(prefix="atletico-extract-") as tmp:
        tmp_path = Path(tmp)
        clip_out = tmp_path / "clip.mp4"
        snap_out = tmp_path / "snapshot.jpg"

        duration_ms = cut_clip(source, body.start_ms, body.end_ms, clip_out)
        try:
            grab_snapshot(source, (body.start_ms + body.end_ms) // 2, snap_out)
            snapshot_uploaded = True
        except RuntimeError:
            snapshot_uploaded = False

        if has_supabase(settings):
            upload_file(settings.clips_bucket, body.out_key, clip_out, content_type="video/mp4")
            clip_url = signed_url(settings.clips_bucket, body.out_key, expires_in=300)
            snapshot_url: str | None = None
            if snapshot_uploaded:
                snap_key = body.out_key.rsplit(".", 1)[0] + ".jpg"
                upload_file(settings.snapshots_bucket, snap_key, snap_out, content_type="image/jpeg")
                snapshot_url = signed_url(settings.snapshots_bucket, snap_key, expires_in=300)
        else:
            # Dev fallback: keep the cut clip locally and return a file:// URL.
            local_dir = settings.project_root / "tmp" / "extracted"
            local_dir.mkdir(parents=True, exist_ok=True)
            local_clip = local_dir / Path(body.out_key).name
            local_clip.write_bytes(clip_out.read_bytes())
            clip_url = f"file://{local_clip.resolve()}"
            snapshot_url = None
            if snapshot_uploaded:
                local_snap = local_dir / (Path(body.out_key).stem + ".jpg")
                local_snap.write_bytes(snap_out.read_bytes())
                snapshot_url = f"file://{local_snap.resolve()}"

    return ExtractClipResponse(
        clip_url=clip_url,
        snapshot_url=snapshot_url,
        duration_ms=duration_ms,
    )
