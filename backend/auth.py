"""Validate Supabase JWTs forwarded from the Next.js frontend.

The frontend attaches the user's Supabase access token in the
``Authorization: Bearer <token>`` header. We verify it against the
``SUPABASE_JWT_SECRET`` (HS256) and pull the ``sub`` (user id) and any
``team_account_id`` claim out of the payload.

If no JWT secret is configured (early local dev) we let the request
through and tag it as anonymous so the API still works while you bring
the rest of the infrastructure online.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status

from settings import Settings, get_settings


@dataclass(slots=True)
class AuthContext:
    user_id: str | None
    team_account_id: str | None
    role: str | None


def _decode(token: str, secret: str) -> dict:
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
            options={"verify_aud": False},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Supabase JWT: {exc}",
        ) from exc


def get_auth_context(
    authorization: Annotated[str | None, Header()] = None,
    settings: Annotated[Settings, Depends(get_settings)] = ...,  # type: ignore[assignment]
) -> AuthContext:
    if not settings.auth_required or not settings.supabase_jwt_secret:
        return AuthContext(user_id=None, team_account_id=None, role=None)

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing.",
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must be 'Bearer <token>'.",
        )

    claims = _decode(token, settings.supabase_jwt_secret)
    app_metadata = claims.get("app_metadata") or {}
    user_metadata = claims.get("user_metadata") or {}

    return AuthContext(
        user_id=claims.get("sub"),
        team_account_id=(
            claims.get("team_account_id")
            or app_metadata.get("team_account_id")
            or user_metadata.get("team_account_id")
        ),
        role=claims.get("role") or app_metadata.get("role"),
    )
