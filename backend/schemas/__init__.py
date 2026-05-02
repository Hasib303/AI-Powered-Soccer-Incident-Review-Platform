"""Pydantic schemas exposed by the AI service."""

from .payload import (
    AnalyzeGoalLineRequest,
    AnalyzeOffsideRequest,
    ExtractClipRequest,
    ExtractClipResponse,
    GoalLineAnalysis,
    HealthResponse,
    IncidentAnalysis,
    OffsideAnalysis,
    Point2D,
)

__all__ = [
    "AnalyzeGoalLineRequest",
    "AnalyzeOffsideRequest",
    "ExtractClipRequest",
    "ExtractClipResponse",
    "GoalLineAnalysis",
    "HealthResponse",
    "IncidentAnalysis",
    "OffsideAnalysis",
    "Point2D",
]
