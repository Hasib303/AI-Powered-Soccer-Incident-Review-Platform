"""End-to-end smoke tests against the real sample clips.

These tests are skipped automatically when the sample clips aren't present
(e.g., on CI without large media files). When they run, they exercise the
full pipeline: video read → YOLO detection → calibration → geometry verdict.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from main import create_app

_SAMPLES = Path(__file__).resolve().parent.parent / "samples"
_OFFSIDE_CLIP = _SAMPLES / "clip_offside_01.mp4"
_GOAL_CLIP = _SAMPLES / "clip_goal_01.mp4"

requires_clips = pytest.mark.skipif(
    not (_OFFSIDE_CLIP.exists() and _GOAL_CLIP.exists()),
    reason="Sample clips not present; download via the Pexels URLs in samples/README.md",
)


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(create_app())


def test_health(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"


@requires_clips
def test_offside_returns_valid_verdict(client: TestClient) -> None:
    r = client.post(
        "/analyze/offside",
        json={
            "clip_id": "clip_offside_01",
            "locked_frame_ms": 8000,
            "attacking_team": "A",
        },
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["type"] == "offside"
    assert payload["verdict"] in {"offside", "onside", "human_review_required"}
    assert 0.0 <= payload["confidence"] <= 1.0
    assert payload["pass_frame_ms"] == 8000
    assert payload["detection_count"] >= 2
    assert payload["offside_line_x"] == payload["defender"]["x"]
    assert any("Pass frame locked at 8.00s" in line for line in payload["rationale"])


@requires_clips
def test_goal_line_returns_valid_verdict(client: TestClient) -> None:
    r = client.post(
        "/analyze/goal-line",
        json={
            "clip_id": "clip_goal_01",
            "frame_range_ms": [2000, 6500],
        },
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["type"] == "goal_line"
    assert payload["verdict"] in {"goal", "no_goal", "human_review_required"}
    assert 0.0 <= payload["confidence"] <= 1.0
    assert payload["goal_line_x"] == 105.0


@requires_clips
def test_offside_unknown_clip_404(client: TestClient) -> None:
    r = client.post(
        "/analyze/offside",
        json={
            "clip_id": "nonexistent",
            "locked_frame_ms": 1000,
            "attacking_team": "A",
        },
    )
    assert r.status_code == 404
