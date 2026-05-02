"""Tests for the homography solver."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pipeline.calibration import load_calibration, project_image_to_pitch
from settings import get_settings


@pytest.fixture
def tmp_clip_calibration(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> str:
    settings = get_settings()
    monkeypatch.setattr(settings, "samples_dir", str(tmp_path))
    # Refresh cache so load_calibration sees the new samples dir.
    load_calibration.cache_clear()
    clip_id = "test_clip"
    calib = {
        # Image points form a trapezoid like the bottom of a broadcast frame.
        "image_points": [
            [200, 600],   # back-left
            [1080, 600],  # back-right
            [1280, 700],  # front-right
            [0, 700],     # front-left
        ],
        # Pitch coords (m): a 30m x 5m strip near our goal.
        "pitch_points": [
            [60, 30],
            [60, 38],
            [70, 38],
            [70, 30],
        ],
        "pitch_length_m": 105,
        "pitch_width_m": 68,
        "attacking_direction": "right",
        "goal_line_x": 105.0,
    }
    (tmp_path / f"{clip_id}.calib.json").write_text(json.dumps(calib))
    yield clip_id
    load_calibration.cache_clear()


def test_homography_solves_for_known_correspondences(tmp_clip_calibration: str) -> None:
    calib = load_calibration(tmp_clip_calibration)
    assert calib.has_real_calibration
    assert calib.attacking_direction == "right"
    assert calib.goal_line_x == 105.0


def test_known_image_point_projects_to_pitch_point(tmp_clip_calibration: str) -> None:
    calib = load_calibration(tmp_clip_calibration)
    # Use one of the four landmark points; expect to land at its pitch coordinate.
    pitch_x, pitch_y = project_image_to_pitch((200.0, 600.0), calib)
    assert pitch_x == pytest.approx(60.0, abs=0.5)
    assert pitch_y == pytest.approx(30.0, abs=0.5)


def test_missing_calibration_falls_back_to_identity(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "samples_dir", str(tmp_path))
    load_calibration.cache_clear()
    calib = load_calibration("does_not_exist")
    assert not calib.has_real_calibration
    assert calib.attacking_direction == "right"
    pitch_x, pitch_y = project_image_to_pitch((100.0, 200.0), calib)
    assert pitch_x == 100.0
    assert pitch_y == 200.0
