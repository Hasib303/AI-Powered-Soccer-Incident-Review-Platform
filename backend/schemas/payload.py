"""Schemas that define the AI service's public contract.

These types match the `ai_payload` jsonb column on the `incidents` table and
are the single source of truth for what the Next.js frontend will consume.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field


class Point2D(BaseModel):
    """2D point in pitch coordinates (metres). Origin = bottom-left of pitch."""

    x: float = Field(description="Distance from left touchline along pitch length, in metres.")
    y: float = Field(description="Distance from bottom byline along pitch width, in metres.")


# ---- Request schemas --------------------------------------------------------


class AnalyzeOffsideRequest(BaseModel):
    clip_id: str = Field(description="Logical id matching a file in samples/, e.g. 'clip_offside_01'.")
    locked_frame_ms: int = Field(ge=0, description="Pass/contact frame timestamp in milliseconds.")
    attacking_team: Literal["A", "B"] = Field(
        description="Which annotated team in the clip is the attacking side."
    )


class AnalyzeGoalLineRequest(BaseModel):
    clip_id: str
    frame_range_ms: tuple[int, int] = Field(description="(start_ms, end_ms) range to track the ball over.")


class ExtractClipRequest(BaseModel):
    source_path: str = Field(description="Absolute or sample-relative path to the source video.")
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    out_key: str = Field(description="Storage object key, e.g. 'team_<id>/match_<id>/incident_<id>/clip.mp4'.")


class ExtractClipResponse(BaseModel):
    clip_url: str
    snapshot_url: str | None = None
    duration_ms: int


# ---- Verdict payloads -------------------------------------------------------


OffsideVerdict = Literal["offside", "onside", "human_review_required"]
GoalLineVerdict = Literal["goal", "no_goal", "human_review_required"]


class OffsideAnalysis(BaseModel):
    """Result of an offside review. Stored as `incidents.ai_payload`."""

    type: Literal["offside"] = "offside"
    verdict: OffsideVerdict
    confidence: float = Field(ge=0, le=1)
    rationale: list[str]
    pass_frame_ms: int
    attacker: Point2D
    defender: Point2D
    ball: Point2D
    offside_line_x: float = Field(
        description="Pitch x-coordinate (metres) of the second-last defender = the offside line."
    )
    detection_count: int = Field(default=0, description="How many players were detected on the frame.")


class GoalLineAnalysis(BaseModel):
    """Result of a goal-line review."""

    type: Literal["goal_line"] = "goal_line"
    verdict: GoalLineVerdict
    confidence: float = Field(ge=0, le=1)
    rationale: list[str]
    goal_line_x: float = Field(description="Pitch x-coordinate of the goal line being reviewed.")
    ball_trajectory: list[Point2D] = Field(default_factory=list)
    crossing_frame_ms: int | None = None


IncidentAnalysis = Annotated[OffsideAnalysis | GoalLineAnalysis, Field(discriminator="type")]


# ---- Misc -------------------------------------------------------------------


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    model_loaded: bool
    samples_dir: str
