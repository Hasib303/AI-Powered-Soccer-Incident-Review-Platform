"""Pure-function offside verdict.

Given an attacker pitch position, the second-last defender's pitch
position, the ball's pitch position at the moment of pass, and which
direction the attackers are going, decide ``offside`` / ``onside`` /
``human_review_required`` and produce a human-readable rationale.

Offside is judged at the moment the ball is played. A player is offside
if at that moment they are nearer to the opponents' goal line than:

  - the second-last defender, AND
  - the ball.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from schemas.payload import OffsideAnalysis, OffsideVerdict, Point2D


@dataclass(slots=True)
class OffsideInputs:
    pass_frame_ms: int
    attacker: Point2D
    defender: Point2D  # second-last defender
    ball: Point2D
    attacking_direction: Literal["left", "right"]
    detection_count: int = 0
    detection_confidence: float = 1.0
    calibration_quality: float = 1.0


def _ahead(point_x: float, reference_x: float, direction: Literal["left", "right"]) -> float:
    """Signed distance (metres) by which ``point`` is ahead of ``reference``.

    Positive value = ahead toward the goal the attacker is shooting at.
    """
    if direction == "right":
        return point_x - reference_x
    return reference_x - point_x


def compute_offside(inputs: OffsideInputs) -> OffsideAnalysis:
    attacker_ahead_of_defender = _ahead(inputs.attacker.x, inputs.defender.x, inputs.attacking_direction)
    attacker_ahead_of_ball = _ahead(inputs.attacker.x, inputs.ball.x, inputs.attacking_direction)

    rationale: list[str] = []
    rationale.append(f"Pass frame locked at {inputs.pass_frame_ms / 1000:.2f}s.")

    is_ahead_of_defender = attacker_ahead_of_defender > 0.0
    is_ahead_of_ball = attacker_ahead_of_ball > 0.0

    if is_ahead_of_defender:
        rationale.append(
            f"Attacker is ahead of the second-last defender by {attacker_ahead_of_defender:.2f} m."
        )
    else:
        rationale.append(
            f"Attacker is level with or behind the second-last defender (margin {-attacker_ahead_of_defender:.2f} m)."
        )

    if is_ahead_of_ball:
        rationale.append(
            f"Attacker is ahead of the ball at moment of pass by {attacker_ahead_of_ball:.2f} m."
        )
    else:
        rationale.append("Attacker is level with or behind the ball at moment of pass.")

    verdict: OffsideVerdict
    if is_ahead_of_defender and is_ahead_of_ball:
        verdict = "offside"
        rationale.append("Verdict: OFFSIDE — both conditions satisfied.")
    else:
        verdict = "onside"
        rationale.append("Verdict: ONSIDE — at least one condition fails.")

    margin = min(abs(attacker_ahead_of_defender), abs(attacker_ahead_of_ball))
    geometry_confidence = min(1.0, max(0.4, 0.5 + margin / 4.0))
    confidence = round(
        geometry_confidence * inputs.detection_confidence * inputs.calibration_quality, 3
    )

    rationale.append(
        f"Confidence {confidence:.2f} (geometry margin {margin:.2f} m, "
        f"detection {inputs.detection_confidence:.2f}, calibration {inputs.calibration_quality:.2f})."
    )

    if confidence < 0.4 and verdict != "human_review_required":
        verdict = "human_review_required"
        rationale.append("Margin and detection are too tight — flagging for human review.")

    return OffsideAnalysis(
        verdict=verdict,
        confidence=confidence,
        rationale=rationale,
        pass_frame_ms=inputs.pass_frame_ms,
        attacker=inputs.attacker,
        defender=inputs.defender,
        ball=inputs.ball,
        offside_line_x=inputs.defender.x,
        detection_count=inputs.detection_count,
    )
