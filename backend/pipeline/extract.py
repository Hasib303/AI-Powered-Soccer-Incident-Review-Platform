"""FFmpeg-based clip + snapshot extraction.

This is the synchronous Flavor A from the plan — fine for uploaded
sample MP4s. Live RTMP/HLS ingestion belongs in a separate worker.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


def _ffmpeg_or_raise() -> str:
    binary = shutil.which("ffmpeg")
    if not binary:
        raise RuntimeError("ffmpeg not on PATH. Install via 'brew install ffmpeg'.")
    return binary


def _ms_to_timestamp(ms: int) -> str:
    seconds, milliseconds = divmod(ms, 1000)
    minutes, sec = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours:02d}:{minutes:02d}:{sec:02d}.{milliseconds:03d}"


def cut_clip(source_path: Path, start_ms: int, end_ms: int, out_path: Path) -> int:
    """Cut [start_ms, end_ms] from ``source_path`` to ``out_path``.

    Returns the duration in milliseconds. Uses ``-c copy`` for speed; a
    later pass with re-encoding can run if frame-accurate cutting is needed.
    """
    if end_ms <= start_ms:
        raise ValueError("end_ms must be greater than start_ms")
    binary = _ffmpeg_or_raise()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    duration_ms = end_ms - start_ms
    cmd = [
        binary,
        "-y",
        "-ss",
        _ms_to_timestamp(start_ms),
        "-to",
        _ms_to_timestamp(end_ms),
        "-i",
        str(source_path),
        "-c",
        "copy",
        str(out_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg cut failed: {proc.stderr.strip()[:500]}")
    return duration_ms


def grab_snapshot(source_path: Path, frame_ms: int, out_path: Path) -> None:
    """Grab a single JPEG snapshot at ``frame_ms`` from ``source_path``."""
    binary = _ffmpeg_or_raise()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        binary,
        "-y",
        "-ss",
        _ms_to_timestamp(frame_ms),
        "-i",
        str(source_path),
        "-frames:v",
        "1",
        "-q:v",
        "2",
        str(out_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg snapshot failed: {proc.stderr.strip()[:500]}")


def read_frame_ms(source_path: Path, frame_ms: int) -> "any":  # noqa: F821
    """Read the BGR frame at ``frame_ms`` from ``source_path`` as a numpy array.

    Implemented in this module to keep video IO together. Imports cv2
    lazily so unit tests that stub this function don't pay the cost.
    """
    import cv2  # noqa: PLC0415

    cap = cv2.VideoCapture(str(source_path))
    try:
        if not cap.isOpened():
            raise RuntimeError(f"Could not open video at {source_path}")
        cap.set(cv2.CAP_PROP_POS_MSEC, frame_ms)
        ok, frame = cap.read()
        if not ok or frame is None:
            raise RuntimeError(f"Could not read frame at {frame_ms}ms in {source_path}")
        return frame
    finally:
        cap.release()
