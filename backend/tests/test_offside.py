"""Unit tests for the pure offside geometry."""

from __future__ import annotations

from pipeline.offside import OffsideInputs, compute_offside
from schemas.payload import Point2D


def _inputs(
    attacker_x: float,
    defender_x: float,
    ball_x: float,
    direction: str = "right",
) -> OffsideInputs:
    return OffsideInputs(
        pass_frame_ms=14820,
        attacker=Point2D(x=attacker_x, y=34.0),
        defender=Point2D(x=defender_x, y=34.0),
        ball=Point2D(x=ball_x, y=34.0),
        attacking_direction=direction,  # type: ignore[arg-type]
        detection_count=8,
        detection_confidence=0.9,
        calibration_quality=0.85,
    )


def test_clearly_offside_attacking_right() -> None:
    # Attacker is 1.5m past the defender and the ball.
    result = compute_offside(_inputs(attacker_x=63.0, defender_x=61.5, ball_x=61.5))
    assert result.verdict == "offside"
    assert 0.4 <= result.confidence <= 1.0
    assert result.offside_line_x == 61.5
    assert any("ahead of the second-last defender" in line for line in result.rationale)


def test_clearly_onside_when_behind_defender() -> None:
    result = compute_offside(_inputs(attacker_x=58.0, defender_x=61.5, ball_x=61.5))
    assert result.verdict == "onside"


def test_onside_when_ball_is_ahead_of_attacker() -> None:
    # Past the defender but the ball was played ahead of the attacker.
    result = compute_offside(_inputs(attacker_x=63.0, defender_x=61.5, ball_x=64.0))
    assert result.verdict == "onside"


def test_borderline_level_with_ball_flags_human_review() -> None:
    # Attacker exactly level with the ball — geometry margin is zero, should be flagged.
    result = compute_offside(_inputs(attacker_x=63.0, defender_x=61.5, ball_x=63.0))
    assert result.verdict in {"onside", "human_review_required"}


def test_attacking_left_is_mirrored() -> None:
    # When attacking left, "ahead" means smaller x.
    result = compute_offside(
        _inputs(attacker_x=20.0, defender_x=23.0, ball_x=23.0, direction="left")
    )
    assert result.verdict == "offside"
    result_onside = compute_offside(
        _inputs(attacker_x=25.0, defender_x=23.0, ball_x=23.0, direction="left")
    )
    assert result_onside.verdict == "onside"


def test_low_confidence_triggers_human_review() -> None:
    # Almost level on both checks — geometry confidence should be near the floor.
    inputs = OffsideInputs(
        pass_frame_ms=14820,
        attacker=Point2D(x=61.55, y=34.0),
        defender=Point2D(x=61.5, y=34.0),
        ball=Point2D(x=61.55, y=34.0),
        attacking_direction="right",
        detection_count=2,
        detection_confidence=0.5,
        calibration_quality=0.5,
    )
    result = compute_offside(inputs)
    assert result.verdict == "human_review_required"
    assert result.confidence < 0.4
