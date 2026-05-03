"""Routes that produce ``ai_payload`` JSON for incident verdicts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status

from auth import AuthContext, get_auth_context
from pipeline.calibration import Calibration, calibration_from_json, project_image_to_pitch
from pipeline.detection import Detection, detect_frame
from pipeline.extract import read_frame_ms
from pipeline.goal_line import GoalLineInputs, compute_goal_line
from pipeline.offside import OffsideInputs, compute_offside
from pipeline.source import ResolvedSource, resolve_match_source
from schemas.payload import (
    AnalyzeGoalLineRequest,
    AnalyzeOffsideRequest,
    GoalLineAnalysis,
    OffsideAnalysis,
    Point2D,
)
from settings import Settings, get_settings

router = APIRouter(prefix="/analyze", tags=["analyze"])


def _resolve_source(reference: str) -> ResolvedSource:
    try:
        return resolve_match_source(reference)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)
        ) from exc


def _load_annotations(clip_id: str, settings: Settings) -> dict:
    """Optional per-clip annotations file with hand-labelled team assignments.

    File path: ``samples/<clip_id>.annotations.json``.

    Schema::

        {
          "team_a_jersey_color_hex": "#22D3B5",
          "team_b_jersey_color_hex": "#E11D48",
          "frames": {
            "<locked_frame_ms>": {
              "attacker_index": 4,        # which detection (sorted) is the attacker
              "defender_index": 2,        # which is the second-last defender
              "ball_index": 9             # which detection is the ball
            }
          }
        }
    """
    path = settings.samples_path / f"{clip_id}.annotations.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def _pick_detection_index(
    detections: list[Detection],
    label: Literal["person", "ball"],
    index: int | None,
) -> Detection | None:
    matching = [d for d in detections if d.label == label]
    if not matching:
        return None
    matching.sort(key=lambda d: (d.x1, d.y1))
    if index is None:
        return matching[0]
    if index < 0 or index >= len(matching):
        return None
    return matching[index]


def _pick_nearest(
    detections: list[Detection],
    label: Literal["person", "ball"],
    target_xy: tuple[float, float],
    using: Literal["feet", "center"] = "feet",
) -> Detection | None:
    """Find the detection of ``label`` whose anchor point is closest to ``target_xy``."""
    matching = [d for d in detections if d.label == label]
    if not matching:
        return None

    def dist(det: Detection) -> float:
        anchor = det.feet_xy if using == "feet" else det.center_xy
        dx = anchor[0] - target_xy[0]
        dy = anchor[1] - target_xy[1]
        return dx * dx + dy * dy

    return min(matching, key=dist)


def _best_ball(detections: list[Detection]) -> Detection | None:
    balls = [d for d in detections if d.label == "ball"]
    if not balls:
        return None
    return max(balls, key=lambda d: d.confidence)


def _resolve_player(
    detections: list[Detection],
    frame_ann: dict,
    pixel_key: str,
    index_key: str,
    fallback_index: int,
) -> Detection | None:
    pixel = frame_ann.get(pixel_key)
    if pixel and isinstance(pixel, list) and len(pixel) == 2:
        return _pick_nearest(detections, "person", (float(pixel[0]), float(pixel[1])))
    return _pick_detection_index(detections, "person", frame_ann.get(index_key, fallback_index))


def _resolve_ball(
    detections: list[Detection],
    frame_ann: dict,
) -> Detection | None:
    pixel = frame_ann.get("ball_pixel_xy")
    if pixel and isinstance(pixel, list) and len(pixel) == 2:
        nearest = _pick_nearest(detections, "ball", (float(pixel[0]), float(pixel[1])), using="center")
        if nearest is not None:
            return nearest
    return _best_ball(detections)


def _calibration_quality(calib: Calibration) -> float:
    return 0.85 if calib.has_real_calibration else 0.5


def _detection_confidence(*detections: Detection | None) -> float:
    valid = [d for d in detections if d is not None]
    if not valid:
        return 0.0
    return sum(d.confidence for d in valid) / len(valid)


@router.post("/offside", response_model=OffsideAnalysis)
def analyze_offside(
    body: AnalyzeOffsideRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    _auth: Annotated[AuthContext, Depends(get_auth_context)],
) -> OffsideAnalysis:
    source = _resolve_source(body.source_ref)
    calib = calibration_from_json(source.clip_id, source.calibration)
    annotations = _load_annotations(source.clip_id, settings)
    frame = read_frame_ms(source.local_path, body.locked_frame_ms)
    detections = detect_frame(frame)

    if not detections:
        return OffsideAnalysis(
            verdict="human_review_required",
            confidence=0.2,
            rationale=[
                f"YOLO produced no detections at frame {body.locked_frame_ms / 1000:.2f}s.",
                "Try a different frame or pick a clip with sharper lighting.",
            ],
            pass_frame_ms=body.locked_frame_ms,
            attacker=Point2D(x=0.0, y=0.0),
            defender=Point2D(x=0.0, y=0.0),
            ball=Point2D(x=0.0, y=0.0),
            offside_line_x=0.0,
            detection_count=0,
        )

    frame_ann = annotations.get("frames", {}).get(str(body.locked_frame_ms), {})
    attacker_det = _resolve_player(
        detections, frame_ann, "attacker_pixel_xy", "attacker_index", fallback_index=0
    )
    defender_det = _resolve_player(
        detections, frame_ann, "defender_pixel_xy", "defender_index", fallback_index=1
    )
    ball_det = _resolve_ball(detections, frame_ann)

    if attacker_det is None or defender_det is None:
        return OffsideAnalysis(
            verdict="human_review_required",
            confidence=0.3,
            rationale=[
                "Could not identify both attacker and second-last defender from detections.",
                f"Detected {sum(1 for d in detections if d.label == 'person')} persons "
                f"and {sum(1 for d in detections if d.label == 'ball')} balls.",
            ],
            pass_frame_ms=body.locked_frame_ms,
            attacker=Point2D(x=0.0, y=0.0),
            defender=Point2D(x=0.0, y=0.0),
            ball=Point2D(x=0.0, y=0.0),
            offside_line_x=0.0,
            detection_count=len(detections),
        )

    a_x, a_y = project_image_to_pitch(attacker_det.feet_xy, calib)
    d_x, d_y = project_image_to_pitch(defender_det.feet_xy, calib)
    attacker_pitch = Point2D(x=a_x, y=a_y)
    defender_pitch = Point2D(x=d_x, y=d_y)
    if ball_det is not None:
        b_x, b_y = project_image_to_pitch(ball_det.center_xy, calib)
        ball_pitch = Point2D(x=b_x, y=b_y)
    else:
        ball_pitch = Point2D(x=attacker_pitch.x, y=attacker_pitch.y)

    return compute_offside(
        OffsideInputs(
            pass_frame_ms=body.locked_frame_ms,
            attacker=attacker_pitch,
            defender=defender_pitch,
            ball=ball_pitch,
            attacking_direction=calib.attacking_direction,
            detection_count=len(detections),
            detection_confidence=_detection_confidence(attacker_det, defender_det, ball_det),
            calibration_quality=_calibration_quality(calib),
            has_real_calibration=calib.has_real_calibration,
        )
    )


@router.post("/goal-line", response_model=GoalLineAnalysis)
def analyze_goal_line(
    body: AnalyzeGoalLineRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    _auth: Annotated[AuthContext, Depends(get_auth_context)],
) -> GoalLineAnalysis:
    source = _resolve_source(body.source_ref)
    calib = calibration_from_json(source.clip_id, source.calibration)
    clip_path = source.local_path
    start_ms, end_ms = body.frame_range_ms
    if end_ms <= start_ms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="frame_range_ms must be (start_ms, end_ms) with end > start.",
        )

    sample_count = 12
    step = (end_ms - start_ms) // sample_count
    trajectory: list[tuple[int, Point2D]] = []
    detection_confidences: list[float] = []

    for i in range(sample_count + 1):
        frame_ms = start_ms + i * step
        try:
            frame = read_frame_ms(clip_path, frame_ms)
        except RuntimeError:
            continue
        detections = detect_frame(frame)
        balls = [d for d in detections if d.label == "ball"]
        if not balls:
            continue
        # Highest-confidence ball detection in the frame.
        best = max(balls, key=lambda d: d.confidence)
        bx, by = project_image_to_pitch(best.center_xy, calib)
        ball_pitch = Point2D(x=bx, y=by)
        trajectory.append((frame_ms, ball_pitch))
        detection_confidences.append(best.confidence)

    avg_conf = sum(detection_confidences) / len(detection_confidences) if detection_confidences else 0.0

    return compute_goal_line(
        GoalLineInputs(
            goal_line_x=calib.goal_line_x,
            attacking_direction=calib.attacking_direction,
            trajectory=trajectory,
            detection_confidence=avg_conf,
            calibration_quality=_calibration_quality(calib),
            has_real_calibration=calib.has_real_calibration,
        )
    )
