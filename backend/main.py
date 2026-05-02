"""FastAPI entrypoint for the Atletico AI/CV service."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pipeline.detection import get_model, is_model_loaded
from routes.analyze import router as analyze_router
from routes.extract import router as extract_router
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
    yield


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

    app.include_router(analyze_router)
    app.include_router(extract_router)
    return app


app = create_app()
