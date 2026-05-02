"""Run YOLO on a sample frame and dump detections + an annotated preview.

Usage::

    uv run python scripts/validate_detection.py samples/preview_offside.jpg
    uv run python scripts/validate_detection.py samples/preview_goal.jpg

Writes ``<input>.detections.json`` and ``<input>.annotated.jpg`` next to the input.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2  # type: ignore[import-untyped]

# Make ``backend/`` importable when running from anywhere.
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from pipeline.detection import detect_frame  # noqa: E402


def main(image_path: str) -> int:
    src = Path(image_path)
    if not src.exists():
        print(f"file not found: {src}", file=sys.stderr)
        return 1

    frame = cv2.imread(str(src))
    if frame is None:
        print(f"could not read image: {src}", file=sys.stderr)
        return 1

    detections = detect_frame(frame)
    persons = [d for d in detections if d.label == "person"]
    balls = [d for d in detections if d.label == "ball"]
    print(f"{src.name}: {len(persons)} person, {len(balls)} ball")

    annotated = frame.copy()
    for det in detections:
        color = (0, 255, 60) if det.label == "person" else (40, 200, 255)
        cv2.rectangle(annotated, (int(det.x1), int(det.y1)), (int(det.x2), int(det.y2)), color, 2)
        cv2.putText(
            annotated,
            f"{det.label} {det.confidence:.2f}",
            (int(det.x1), max(20, int(det.y1) - 6)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            color,
            2,
        )

    out_jpg = src.with_suffix(".annotated.jpg")
    cv2.imwrite(str(out_jpg), annotated)

    out_json = src.with_suffix(".detections.json")
    out_json.write_text(
        json.dumps(
            [
                {
                    "label": d.label,
                    "confidence": round(d.confidence, 3),
                    "x1": round(d.x1, 1),
                    "y1": round(d.y1, 1),
                    "x2": round(d.x2, 1),
                    "y2": round(d.y2, 1),
                    "feet_xy": [round(c, 1) for c in d.feet_xy],
                    "center_xy": [round(c, 1) for c in d.center_xy],
                }
                for d in detections
            ],
            indent=2,
        )
    )
    print(f"  wrote {out_jpg.name} and {out_json.name}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: validate_detection.py <image_path>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
