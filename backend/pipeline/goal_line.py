"""Pure-function goal-line crossing verdict.

Given a tracked ball trajectory in pitch coordinates and the goal-line
x position, decide whether the *whole ball* (centre crosses by at least
one ball radius) crossed the line during the trajectory window.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from schemas.payload import GoalLineAnalysis, GoalLineVerdict, Point2D

# Soccer ball radius is ~0.11 m. We add 5 cm headroom for noise.
BALL_RADIUS_M = 0.16


@dataclass(slots=True)
class GoalLineInputs:
    goal_line_x: float
    attacking_direction: Literal["left", "right"]
    trajectory: list[tuple[int, Point2D]]  # (frame_ms, pitch position)
    detection_confidence: float = 1.0
    calibration_quality: float = 1.0
    has_real_calibration: bool = True


def _crossed(ball_x: float, goal_line_x: float, direction: Literal["left", "right"]) -> float:
    """Signed crossing distance in metres. Positive = past the goal line."""
    if direction == "right":
        return ball_x - goal_line_x
    return goal_line_x - ball_x


def compute_goal_line(inputs: GoalLineInputs) -> GoalLineAnalysis:
    rationale: list[str] = []
    rationale.append(f"Goal line at pitch x={inputs.goal_line_x:.2f} m.")

    crossing_frame_ms: int | None = None
    max_overshoot = float("-inf")

    for frame_ms, ball in inputs.trajectory:
        signed = _crossed(ball.x, inputs.goal_line_x, inputs.attacking_direction)
        if signed > max_overshoot:
            max_overshoot = signed
        if signed >= BALL_RADIUS_M and crossing_frame_ms is None:
            crossing_frame_ms = frame_ms

    if not inputs.trajectory:
        rationale.append("Empty trajectory — flagging for human review.")
        return GoalLineAnalysis(
            verdict="human_review_required",
            confidence=0.2,
            rationale=rationale,
            goal_line_x=inputs.goal_line_x,
            ball_trajectory=[],
            crossing_frame_ms=None,
        )

    verdict: GoalLineVerdict
    if crossing_frame_ms is not None:
        verdict = "goal"
        rationale.append(
            f"Ball fully crossed the goal line at frame {crossing_frame_ms / 1000:.2f}s "
            f"(max overshoot {max_overshoot:.2f} m)."
        )
    else:
        verdict = "no_goal"
        rationale.append(
            f"Ball never fully crossed the goal line (max overshoot {max_overshoot:.2f} m, "
            f"required {BALL_RADIUS_M:.2f} m)."
        )

    margin = abs(max_overshoot)
    geometry_confidence = min(1.0, max(0.4, 0.5 + margin / 0.5))
    confidence = round(
        geometry_confidence * inputs.detection_confidence * inputs.calibration_quality, 3
    )

    rationale.append(
        f"Confidence {confidence:.2f} (margin {margin:.2f} m, "
        f"detection {inputs.detection_confidence:.2f}, calibration {inputs.calibration_quality:.2f})."
    )

    if not inputs.has_real_calibration:
        rationale.append(
            "Note: this match has no homography calibration, so the goal-line "
            "crossing margin is pixel-relative."
        )

    if confidence < 0.4:
        verdict = "human_review_required"
        rationale.append("Confidence too low — flagging for human review.")

    return GoalLineAnalysis(
        verdict=verdict,
        confidence=confidence,
        rationale=rationale,
        goal_line_x=inputs.goal_line_x,
        ball_trajectory=[ball for _, ball in inputs.trajectory],
        crossing_frame_ms=crossing_frame_ms,
    )
