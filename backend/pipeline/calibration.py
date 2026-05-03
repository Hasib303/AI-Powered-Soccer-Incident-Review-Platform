"""Per-clip homography from hand-clicked landmarks.

Each sample clip ships with a ``<clip_id>.calib.json`` that maps four
known image-pixel points to four known pitch-coordinate points. We
solve a 3x3 perspective transform once per clip and reuse it for every
detection.

JSON shape::

    {
      "image_points": [[x,y], [x,y], [x,y], [x,y]],
      "pitch_points": [[x,y], [x,y], [x,y], [x,y]],
      "pitch_length_m": 105,
      "pitch_width_m": 68,
      "attacking_direction": "right",
      "goal_line_x": 105.0,
      "team_a_color_hex": "#22D3B5",
      "team_b_color_hex": "#E11D48",
      "team_a_jersey_team": "A",
      "notes": "..."
    }

If a clip's calibration file is missing we fall back to a synthetic
identity calibration that lets the offside / goal-line logic still run
on raw pixel coordinates so the pipeline doesn't hard-fail in dev.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

import cv2
import numpy as np

from settings import get_settings


@dataclass(slots=True)
class Calibration:
    clip_id: str
    homography: np.ndarray
    pitch_length_m: float
    pitch_width_m: float
    attacking_direction: Literal["left", "right"]
    goal_line_x: float
    has_real_calibration: bool


def _solve_homography(image_points: list[list[float]], pitch_points: list[list[float]]) -> np.ndarray:
    if len(image_points) < 4 or len(pitch_points) < 4:
        raise ValueError("Need at least 4 corresponding points to compute a homography.")
    src = np.asarray(image_points, dtype=np.float32)
    dst = np.asarray(pitch_points, dtype=np.float32)
    matrix, _mask = cv2.findHomography(src, dst, method=0)
    if matrix is None:
        raise ValueError("cv2.findHomography returned None.")
    return matrix


def _identity_for_dev(clip_id: str) -> Calibration:
    return Calibration(
        clip_id=clip_id,
        homography=np.eye(3, dtype=np.float32),
        pitch_length_m=105.0,
        pitch_width_m=68.0,
        attacking_direction="right",
        goal_line_x=105.0,
        has_real_calibration=False,
    )


def calibration_from_json(clip_id: str, raw: dict | None) -> Calibration:
    """Build a ``Calibration`` from an inline JSON payload.

    When ``raw`` is None or missing the required keys, falls back to an
    identity-style calibration so the pipeline still runs (useful for
    uploaded clips before the user has provided 4-point landmarks).
    """
    if not raw or "image_points" not in raw or "pitch_points" not in raw:
        return _identity_for_dev(clip_id)
    homography = _solve_homography(raw["image_points"], raw["pitch_points"])
    return Calibration(
        clip_id=clip_id,
        homography=homography,
        pitch_length_m=float(raw.get("pitch_length_m", 105.0)),
        pitch_width_m=float(raw.get("pitch_width_m", 68.0)),
        attacking_direction=raw.get("attacking_direction", "right"),
        goal_line_x=float(raw.get("goal_line_x", 105.0)),
        has_real_calibration=True,
    )


@lru_cache(maxsize=8)
def load_calibration(clip_id: str) -> Calibration:
    """Legacy: load a sample clip's `<clip_id>.calib.json` from disk."""
    settings = get_settings()
    calib_path: Path = settings.samples_path / f"{clip_id}.calib.json"

    if not calib_path.exists():
        return _identity_for_dev(clip_id)

    raw = json.loads(calib_path.read_text())
    return calibration_from_json(clip_id, raw)


def project_image_to_pitch(point_xy: tuple[float, float], calib: Calibration) -> tuple[float, float]:
    """Map a single image-pixel point through the homography to pitch coords."""
    pt = np.asarray([[[point_xy[0], point_xy[1]]]], dtype=np.float32)
    out = cv2.perspectiveTransform(pt, calib.homography)
    x, y = out[0][0]
    return float(x), float(y)
