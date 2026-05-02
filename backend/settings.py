"""Centralised configuration via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"

    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    # When true, every request must carry a valid Supabase JWT. Default false
    # for local development so curl + the Next.js server can call the API
    # without forging tokens. Production must set AUTH_REQUIRED=true.
    auth_required: bool = False

    clips_bucket: str = "clips"
    snapshots_bucket: str = "snapshots"

    yolo_model: str = "yolov8n.pt"
    yolo_person_confidence: float = 0.2
    yolo_ball_confidence: float = 0.4
    yolo_imgsz: int = 1920

    human_review_threshold: float = 0.6

    samples_dir: str = "samples"

    project_root: Path = Field(default_factory=lambda: Path(__file__).parent.resolve())

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def samples_path(self) -> Path:
        path = Path(self.samples_dir)
        if not path.is_absolute():
            path = self.project_root / path
        return path


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
