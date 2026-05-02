"""YOLOv8 detection wrapper.

Loads ``yolov8n.pt`` once at import time and exposes a tiny API for
detecting persons (class 0) and sports balls (class 32) in BGR frames.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

import numpy as np
from ultralytics import YOLO

from settings import get_settings

# COCO class ids that we actually care about.
PERSON_CLASS_ID = 0
BALL_CLASS_ID = 32


@dataclass(slots=True)
class Detection:
    label: Literal["person", "ball"]
    confidence: float
    # xyxy in image pixel coordinates (top-left, bottom-right).
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def feet_xy(self) -> tuple[float, float]:
        """Approximate foot-of-bbox point used as the player's pitch position."""
        return ((self.x1 + self.x2) / 2.0, self.y2)

    @property
    def center_xy(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2.0, (self.y1 + self.y2) / 2.0)


@lru_cache(maxsize=1)
def get_model() -> YOLO:
    settings = get_settings()
    return YOLO(settings.yolo_model)


def detect_frame(frame: np.ndarray) -> list[Detection]:
    """Run YOLO on a single BGR frame, returning person + ball detections."""
    settings = get_settings()
    model = get_model()
    min_conf = min(settings.yolo_person_confidence, settings.yolo_ball_confidence)

    results = model.predict(
        source=frame,
        classes=[PERSON_CLASS_ID, BALL_CLASS_ID],
        conf=min_conf,
        imgsz=settings.yolo_imgsz,
        verbose=False,
    )

    detections: list[Detection] = []
    if not results:
        return detections

    boxes = results[0].boxes
    if boxes is None or boxes.xyxy is None:
        return detections

    xyxy = boxes.xyxy.cpu().numpy()
    confs = boxes.conf.cpu().numpy()
    cls = boxes.cls.cpu().numpy().astype(int)

    for (x1, y1, x2, y2), conf, cid in zip(xyxy, confs, cls, strict=False):
        label: Literal["person", "ball"]
        if cid == PERSON_CLASS_ID:
            if conf < settings.yolo_person_confidence:
                continue
            label = "person"
        elif cid == BALL_CLASS_ID:
            if conf < settings.yolo_ball_confidence:
                continue
            label = "ball"
        else:
            continue

        detections.append(
            Detection(
                label=label,
                confidence=float(conf),
                x1=float(x1),
                y1=float(y1),
                x2=float(x2),
                y2=float(y2),
            )
        )
    return detections


def is_model_loaded() -> bool:
    return "get_model" in globals() and get_model.cache_info().currsize > 0
