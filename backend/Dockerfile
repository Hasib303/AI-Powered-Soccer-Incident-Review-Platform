# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# Atletico Intelligence — AI/CV service container.
#
# Single-stage image based on python:3.12-slim. Installs ffmpeg + the system
# libraries OpenCV needs, copies the uv-managed project, locks deps from
# uv.lock, and pre-downloads the YOLOv8n weights at build time so the first
# /analyze request doesn't pay the model-fetch cost.
#
# This image is also what we deploy to a Hugging Face Space (Docker SDK,
# free CPU tier). It listens on $PORT (default 8000) and exposes the
# FastAPI app at /docs for live API exploration.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH=/app/.venv/bin:$PATH

# System deps:
#   - ffmpeg: clip extraction + RTMP/HLS ingest
#   - libgl1, libglib2.0-0: required by opencv-python-headless at import time
#   - curl + ca-certificates: handy for healthchecks and YOLO weight fetches
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        libgl1 \
        libglib2.0-0 \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install uv from the official static binary image (matches the dev pin).
COPY --from=ghcr.io/astral-sh/uv:0.7.13 /uv /uvx /usr/local/bin/

WORKDIR /app

# Resolve dependencies first so the layer caches across code changes.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy the rest of the source.
COPY . .

# Install the project itself (editable not needed in prod).
RUN uv sync --frozen --no-dev

# Pre-fetch YOLOv8n weights into the image. ultralytics writes to /app on
# first call, which is then baked into the layer. Failure here is non-fatal
# — the runtime will retry — but in practice it works on first build.
RUN uv run python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')" || true

# Hugging Face Spaces injects $PORT (typically 7860). Default to 8000 for
# local docker-compose.
ENV PORT=8000
EXPOSE 8000 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsSL "http://127.0.0.1:${PORT}/health" || exit 1

# Use sh -c so $PORT expands at runtime.
CMD ["sh", "-c", "uv run uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
