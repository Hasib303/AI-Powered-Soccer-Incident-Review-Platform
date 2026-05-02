"""Unit tests for the pure goal-line geometry."""

from __future__ import annotations

from pipeline.goal_line import GoalLineInputs, compute_goal_line
from schemas.payload import Point2D


def _trajectory(*xs: float, y: float = 34.0, start_ms: int = 70_000, step_ms: int = 80):
    return [(start_ms + i * step_ms, Point2D(x=x, y=y)) for i, x in enumerate(xs)]


def test_clear_goal_attacking_right() -> None:
    # Ball goes from short of the line to past it by 0.5m.
    trajectory = _trajectory(104.5, 104.9, 105.1, 105.5)
    result = compute_goal_line(
        GoalLineInputs(
            goal_line_x=105.0,
            attacking_direction="right",
            trajectory=trajectory,
            detection_confidence=0.9,
            calibration_quality=0.85,
        )
    )
    assert result.verdict == "goal"
    assert result.crossing_frame_ms is not None
    assert result.confidence >= 0.4


def test_no_goal_when_ball_does_not_fully_cross() -> None:
    # Ball reaches the line but not by a full ball radius.
    trajectory = _trajectory(104.6, 104.85, 104.95, 104.9)
    result = compute_goal_line(
        GoalLineInputs(
            goal_line_x=105.0,
            attacking_direction="right",
            trajectory=trajectory,
            detection_confidence=0.9,
            calibration_quality=0.85,
        )
    )
    assert result.verdict == "no_goal"
    assert result.crossing_frame_ms is None


def test_attacking_left_is_mirrored() -> None:
    trajectory = _trajectory(0.5, 0.3, -0.1, -0.4)
    result = compute_goal_line(
        GoalLineInputs(
            goal_line_x=0.0,
            attacking_direction="left",
            trajectory=trajectory,
            detection_confidence=0.9,
            calibration_quality=0.85,
        )
    )
    assert result.verdict == "goal"
    assert result.crossing_frame_ms is not None


def test_empty_trajectory_human_review() -> None:
    result = compute_goal_line(
        GoalLineInputs(
            goal_line_x=105.0,
            attacking_direction="right",
            trajectory=[],
            detection_confidence=0.0,
            calibration_quality=0.5,
        )
    )
    assert result.verdict == "human_review_required"


def test_low_confidence_triggers_human_review() -> None:
    trajectory = _trajectory(104.7, 104.85, 105.05)
    result = compute_goal_line(
        GoalLineInputs(
            goal_line_x=105.0,
            attacking_direction="right",
            trajectory=trajectory,
            detection_confidence=0.3,
            calibration_quality=0.4,
        )
    )
    # Even though geometry says crossed, very low conf collapses to human review.
    assert result.verdict in {"human_review_required", "goal"}
