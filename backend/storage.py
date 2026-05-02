"""Thin Supabase Storage wrapper used by the extract-clip endpoint."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from supabase import Client, create_client

from settings import Settings, get_settings


@lru_cache(maxsize=1)
def get_supabase_client() -> Client | None:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def upload_file(
    bucket: str,
    object_key: str,
    file_path: Path,
    content_type: str = "video/mp4",
    upsert: bool = True,
) -> None:
    client = get_supabase_client()
    if client is None:
        raise RuntimeError(
            "Supabase client not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
        )
    with file_path.open("rb") as fh:
        client.storage.from_(bucket).upload(
            path=object_key,
            file=fh,
            file_options={
                "content-type": content_type,
                "upsert": "true" if upsert else "false",
            },
        )


def signed_url(bucket: str, object_key: str, expires_in: int = 60) -> str:
    """Return a short-lived signed URL for a private storage object."""
    client = get_supabase_client()
    if client is None:
        raise RuntimeError("Supabase client not configured.")
    result = client.storage.from_(bucket).create_signed_url(object_key, expires_in)
    return result["signedURL"] if isinstance(result, dict) else result.signed_url


def has_supabase(_settings: Settings | None = None) -> bool:
    settings = _settings or get_settings()
    return bool(settings.supabase_url and settings.supabase_service_role_key)
