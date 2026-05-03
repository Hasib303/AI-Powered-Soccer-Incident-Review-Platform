"""RTMP / HLS ingestion prototype.

This module is intentionally **prototype-quality**. It demonstrates the
architecture required by BRD §2.1.1 and §3.2 — accepting a live source URL,
maintaining a rolling on-disk HLS buffer, and reconnecting with backoff —
but it is not battle-tested for the 90-minute soak in §5.2.

Design:

- One ``StreamWorker`` per match, registered globally in ``_workers``.
- Each worker runs FFmpeg in a background thread, writing 2-second HLS
  segments to ``settings.project_root/tmp/streams/<match_id>/``.
- The worker watches the FFmpeg process; on unexpected exit it transitions
  through ``disconnected → reconnecting`` with exponential backoff (1, 2, 4,
  8, 16 s, capped at 30 s) and restarts FFmpeg until ``stop_stream`` is
  called explicitly.
- State transitions are written to the ``matches.stream_state`` column via
  the service-role Supabase client so the frontend sees them via Realtime.

What's deliberately not built:

- GOP-aware frame-accurate cutting (segments are 2 s aligned).
- Bitrate/quality observability.
- Cross-process / multi-replica coordination — workers are bound to a
  single uvicorn process.
- 90-minute soak / load-test verification.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from settings import get_settings
from storage import get_supabase_client

logger = logging.getLogger("atletico-backend.stream")

StreamState = Literal[
    "idle",
    "connecting",
    "connected",
    "buffering",
    "reconnecting",
    "disconnected",
    "failed",
    "stopped",
]

# Backoff schedule, capped at 30 s.
_BACKOFF_SCHEDULE: list[float] = [1.0, 2.0, 4.0, 8.0, 16.0, 30.0]


@dataclass
class StreamWorker:
    match_id: str
    source_url: str
    kind: Literal["rtmp", "hls"]
    state: StreamState = "idle"
    last_error: str | None = None
    output_dir: Path = field(default_factory=Path)
    process: subprocess.Popen | None = None
    thread: threading.Thread | None = None
    stop_requested: threading.Event = field(default_factory=threading.Event)
    started_at: float = field(default_factory=time.time)
    last_state_change: float = field(default_factory=time.time)


_workers: dict[str, StreamWorker] = {}
_lock = threading.Lock()


def _stream_root() -> Path:
    settings = get_settings()
    root = settings.project_root / "tmp" / "streams"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _ffmpeg_or_raise() -> str:
    binary = shutil.which("ffmpeg")
    if not binary:
        raise RuntimeError("ffmpeg not on PATH. Install via 'brew install ffmpeg'.")
    return binary


def _kind_for(url: str) -> Literal["rtmp", "hls"]:
    if url.startswith("rtmp://") or url.startswith("rtmps://"):
        return "rtmp"
    return "hls"


def _persist_state(worker: StreamWorker) -> None:
    """Write the worker's state to ``matches.stream_state`` (best-effort)."""
    client = get_supabase_client()
    if client is None:
        return
    try:
        client.table("matches").update(
            {
                "stream_state": worker.state,
                "stream_state_at": datetime.now(UTC).isoformat(),
            }
        ).eq("id", worker.match_id).execute()
    except Exception:  # noqa: BLE001
        logger.exception("Failed to persist stream state for match %s", worker.match_id)


def _set_state(worker: StreamWorker, state: StreamState, error: str | None = None) -> None:
    if worker.state == state:
        return
    worker.state = state
    worker.last_error = error
    worker.last_state_change = time.time()
    logger.info("[stream %s] state -> %s%s", worker.match_id, state, f" ({error})" if error else "")
    _persist_state(worker)


def _spawn_ffmpeg(worker: StreamWorker) -> subprocess.Popen:
    binary = _ffmpeg_or_raise()
    worker.output_dir.mkdir(parents=True, exist_ok=True)
    playlist = worker.output_dir / "playlist.m3u8"
    cmd = [
        binary,
        "-hide_banner",
        "-loglevel",
        "error",
        "-rw_timeout",
        "10000000",  # 10s read/write timeout (microseconds)
        "-i",
        worker.source_url,
        "-c",
        "copy",
        "-f",
        "hls",
        "-hls_time",
        "2",
        "-hls_list_size",
        "15",
        "-hls_flags",
        "delete_segments+append_list+independent_segments",
        "-hls_segment_type",
        "mpegts",
        "-hls_segment_filename",
        str(worker.output_dir / "segment_%03d.ts"),
        str(playlist),
    ]
    logger.info("[stream %s] spawning FFmpeg: %s", worker.match_id, " ".join(cmd))
    return subprocess.Popen(  # noqa: S603
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )


def _wait_for_first_segment(worker: StreamWorker, timeout_s: float = 12.0) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if worker.stop_requested.is_set():
            return False
        segments = sorted(worker.output_dir.glob("segment_*.ts"))
        if segments:
            return True
        time.sleep(0.25)
    return False


def _drain_proc(worker: StreamWorker) -> int | None:
    if worker.process is None:
        return None
    try:
        return worker.process.wait(timeout=1.0)
    except subprocess.TimeoutExpired:
        return None


def _kill_proc(worker: StreamWorker) -> None:
    proc = worker.process
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        proc.kill()


def _worker_loop(worker: StreamWorker) -> None:
    """Lifecycle thread: connect → run → reconnect with backoff."""
    backoff_index = 0
    try:
        while not worker.stop_requested.is_set():
            _set_state(worker, "connecting")
            try:
                worker.process = _spawn_ffmpeg(worker)
            except Exception as exc:  # noqa: BLE001
                _set_state(worker, "failed", error=str(exc))
                return

            if _wait_for_first_segment(worker):
                _set_state(worker, "connected")
                backoff_index = 0
            else:
                _set_state(worker, "buffering")

            assert worker.process is not None
            stderr_lines: list[str] = []
            while not worker.stop_requested.is_set():
                exit_code = _drain_proc(worker)
                if exit_code is not None:
                    if worker.process and worker.process.stderr:
                        try:
                            stderr_lines.extend(worker.process.stderr.readlines())
                        except Exception:  # noqa: BLE001
                            pass
                    break
                time.sleep(0.5)

            _kill_proc(worker)
            if worker.stop_requested.is_set():
                break

            tail = "".join(stderr_lines)[-400:] if stderr_lines else None
            _set_state(worker, "disconnected", error=tail)

            delay = _BACKOFF_SCHEDULE[min(backoff_index, len(_BACKOFF_SCHEDULE) - 1)]
            backoff_index += 1
            _set_state(worker, "reconnecting", error=f"retry in {delay:.0f}s")

            slept = 0.0
            while slept < delay and not worker.stop_requested.is_set():
                time.sleep(0.25)
                slept += 0.25

        _set_state(worker, "stopped")
    finally:
        _kill_proc(worker)


def start_stream(match_id: str, source_url: str) -> StreamWorker:
    with _lock:
        existing = _workers.get(match_id)
        if existing and existing.thread and existing.thread.is_alive():
            return existing
        worker = StreamWorker(
            match_id=match_id,
            source_url=source_url,
            kind=_kind_for(source_url),
            output_dir=_stream_root() / match_id,
        )
        worker.output_dir.mkdir(parents=True, exist_ok=True)
        worker.thread = threading.Thread(
            target=_worker_loop, args=(worker,), name=f"stream-{match_id[:8]}", daemon=True
        )
        _workers[match_id] = worker
        worker.thread.start()
        return worker


def stop_stream(match_id: str) -> bool:
    with _lock:
        worker = _workers.get(match_id)
    if not worker:
        return False
    worker.stop_requested.set()
    _kill_proc(worker)
    if worker.thread:
        worker.thread.join(timeout=5)
    with _lock:
        _workers.pop(match_id, None)
    _set_state(worker, "stopped")
    return True


def stop_all() -> None:
    with _lock:
        ids = list(_workers.keys())
    for mid in ids:
        try:
            stop_stream(mid)
        except Exception:  # noqa: BLE001
            logger.exception("stop_stream failed for %s", mid)


def stream_status(match_id: str) -> dict | None:
    with _lock:
        worker = _workers.get(match_id)
    if not worker:
        return None
    segments = sorted(worker.output_dir.glob("segment_*.ts"))
    return {
        "match_id": worker.match_id,
        "state": worker.state,
        "kind": worker.kind,
        "source_url": worker.source_url,
        "last_error": worker.last_error,
        "segment_count": len(segments),
        "buffered_seconds": len(segments) * 2,
        "started_at": worker.started_at,
        "last_state_change": worker.last_state_change,
    }


def latest_segment_for_match(match_id: str) -> Path | None:
    """Return the path to the most recent segment for analyze pipelines."""
    output_dir = _stream_root() / match_id
    if not output_dir.exists():
        return None
    segments = sorted(output_dir.glob("segment_*.ts"))
    if not segments:
        return None
    # Skip the very latest one — FFmpeg may still be writing to it.
    if len(segments) >= 2:
        return segments[-2]
    return segments[-1]


def playlist_path_for_match(match_id: str) -> Path | None:
    p = _stream_root() / match_id / "playlist.m3u8"
    return p if p.exists() else None
