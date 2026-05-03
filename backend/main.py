"""FastAPI entrypoint for the Atletico AI/CV service."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from pipeline.detection import get_model, is_model_loaded
from pipeline.stream import stop_all as stop_all_streams
from routes.analyze import router as analyze_router
from routes.extract import router as extract_router
from routes.streams import router as streams_router
from schemas.payload import HealthResponse
from settings import get_settings

logger = logging.getLogger("atletico-backend")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Pre-warm the YOLO model so the first /analyze request doesn't pay the load cost.
    try:
        get_model()
        logger.info("YOLO model preloaded.")
    except Exception:  # noqa: BLE001
        logger.exception("YOLO model preload failed; will retry on first request.")
    try:
        yield
    finally:
        # Make sure FFmpeg subprocesses don't outlive the API.
        try:
            stop_all_streams()
        except Exception:  # noqa: BLE001
            logger.exception("Error stopping stream workers during shutdown.")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Atletico Intelligence — AI/CV Service",
        version="0.1.0",
        description="Single-camera offside and goal-line incident review.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", response_model=HealthResponse, tags=["health"])
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            model_loaded=is_model_loaded(),
            samples_dir=str(settings.samples_path),
        )

    @app.get("/samples/{clip_id}.mp4", tags=["samples"])
    def serve_sample_clip(clip_id: str) -> FileResponse:
        """Serve a sample MP4 directly so the frontend can play it without
        re-uploading to Supabase Storage. Demo-only convenience."""
        path = settings.samples_path / f"{clip_id}.mp4"
        if not path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No sample clip for id '{clip_id}'.",
            )
        return FileResponse(path, media_type="video/mp4", filename=path.name)

    app.include_router(analyze_router)
    app.include_router(extract_router)
    app.include_router(streams_router)
    return app


app = create_app()
