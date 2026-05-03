"""Resolve a match's video source to a local file path the pipeline can read.

The frontend passes a ``match_id`` to ``/analyze/*``. This module looks the
match up in Supabase, decides which source kind to pull from, materialises
a local MP4 path, and returns the per-match calibration JSON alongside it.

Source kinds:

- ``sample`` — look up ``samples/{sample_clip_id}.mp4`` on disk plus the
  per-clip ``.calib.json``. Same path the demo seed has used since day 1.
- ``upload`` — download the Supabase Storage object at
  ``matches.video_source_path`` to a temp dir (cached per-match) and use
  ``matches.calibration`` jsonb.
- ``rtmp`` / ``hls`` — defer to ``pipeline.stream.latest_segment`` once the
  RTMP/HLS prototype lands. Returns the most recent buffered segment as if
  it were the source clip for analysis purposes.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID

from settings import get_settings
from storage import get_supabase_client

logger = logging.getLogger("atletico-backend.source")

_CACHE_DIR_NAME = "uploads"


@dataclass(slots=True)
class ResolvedSource:
    match_id: str | None
    clip_id: str
    local_path: Path
    calibration: dict[str, Any] | None
    kind: str  # 'sample' | 'upload' | 'rtmp' | 'hls'


def _is_uuid(value: str) -> bool:
    try:
        UUID(value)
        return True
    except (ValueError, AttributeError):
        return False


def _sample_path(clip_id: str) -> Path:
    settings = get_settings()
    candidates = [
        settings.samples_path / f"{clip_id}.mp4",
        settings.samples_path / f"{clip_id}.mov",
    ]
    for path in candidates:
        if path.exists():
            return path
    raise FileNotFoundError(
        f"No sample clip found for clip_id '{clip_id}' in {settings.samples_path}"
    )


def _sample_calibration(clip_id: str) -> dict[str, Any] | None:
    settings = get_settings()
    calib = settings.samples_path / f"{clip_id}.calib.json"
    if not calib.exists():
        return None
    import json  # noqa: PLC0415

    return json.loads(calib.read_text())


def _upload_cache_path(match_id: str, suffix: str = "mp4") -> Path:
    settings = get_settings()
    cache_dir = settings.project_root / "tmp" / _CACHE_DIR_NAME / match_id
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"source.{suffix}"


def _download_from_storage(bucket: str, object_key: str, target: Path) -> None:
    client = get_supabase_client()
    if client is None:
        raise RuntimeError(
            "Supabase service client not configured — cannot fetch uploads. "
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env."
        )
    payload = client.storage.from_(bucket).download(object_key)
    if payload is None:
        raise RuntimeError(
            f"Supabase Storage returned empty payload for {bucket}/{object_key}"
        )
    target.write_bytes(payload)


def _fetch_match_row(match_id: str) -> dict[str, Any]:
    client = get_supabase_client()
    if client is None:
        raise RuntimeError(
            "Supabase service client not configured. Cannot resolve match. "
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env, or pass "
            "a sample clip_id instead of a match UUID."
        )
    res = (
        client.table("matches")
        .select(
            "id, video_source_kind, video_source_path, video_stream_url, "
            "calibration, sample_clip_id"
        )
        .eq("id", match_id)
        .maybe_single()
        .execute()
    )
    if res.data is None:
        raise FileNotFoundError(f"No match found for id '{match_id}'.")
    return res.data


def resolve_match_source(reference: str) -> ResolvedSource:
    """Resolve a frontend reference (UUID or sample clip_id) to a local file.

    For backwards-compat with existing pytest fixtures and any tooling that
    still passes a literal clip_id (e.g. ``clip_offside_01``), strings that
    don't parse as a UUID are treated as sample clip ids.
    """
    settings = get_settings()

    if not _is_uuid(reference):
        return ResolvedSource(
            match_id=None,
            clip_id=reference,
            local_path=_sample_path(reference),
            calibration=_sample_calibration(reference),
            kind="sample",
        )

    row = _fetch_match_row(reference)
    kind = row.get("video_source_kind") or "sample"

    if kind == "sample":
        sample_id = row.get("sample_clip_id")
        if not sample_id:
            raise FileNotFoundError(
                f"Match {reference} has video_source_kind='sample' but no sample_clip_id."
            )
        return ResolvedSource(
            match_id=reference,
            clip_id=sample_id,
            local_path=_sample_path(sample_id),
            calibration=row.get("calibration") or _sample_calibration(sample_id),
            kind="sample",
        )

    if kind == "upload":
        object_key = row.get("video_source_path")
        if not object_key:
            raise FileNotFoundError(
                f"Match {reference} kind='upload' but video_source_path is null."
            )
        target = _upload_cache_path(reference)
        if not target.exists():
            logger.info("downloading %s/%s -> %s", settings.clips_bucket, object_key, target)
            _download_from_storage(settings.clips_bucket, object_key, target)
        return ResolvedSource(
            match_id=reference,
            clip_id=f"match_{reference}",
            local_path=target,
            calibration=row.get("calibration"),
            kind="upload",
        )

    if kind in {"rtmp", "hls"}:
        # Stream sources are wired up by pipeline.stream — import here to
        # avoid a circular dependency when the stream module isn't loaded.
        from pipeline.stream import latest_segment_for_match  # noqa: PLC0415

        segment = latest_segment_for_match(reference)
        if segment is None:
            raise FileNotFoundError(
                f"Match {reference} stream has no buffered segment yet. "
                "Wait for the ingest worker to fill the buffer."
            )
        return ResolvedSource(
            match_id=reference,
            clip_id=f"stream_{reference}",
            local_path=segment,
            calibration=row.get("calibration"),
            kind=kind,
        )

    raise ValueError(f"Unknown video_source_kind '{kind}' on match {reference}.")
