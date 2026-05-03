/**
 * Hand-curated TypeScript bindings for the Atletico Supabase schema.
 *
 * These mirror the SQL migrations in `backend/migrations/0001_init.sql` and
 * the AI payload contract returned by the Python service. They are NOT the
 * full `supabase gen types typescript` output because we don't need every
 * column of every system table — just the application surface.
 */

export type UserRole = "admin" | "official" | "viewer";

export type MatchStatus = "scheduled" | "live" | "completed";

export type VideoSourceKind = "sample" | "upload" | "rtmp" | "hls";

export type StreamStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "buffering"
  | "reconnecting"
  | "disconnected"
  | "failed";

export type CalibrationJson = {
  image_points: [number, number][];
  pitch_points: [number, number][];
  pitch_length_m?: number;
  pitch_width_m?: number;
  attacking_direction?: "left" | "right";
  goal_line_x?: number;
};

export type IncidentType = "offside" | "goal_line";

export type IncidentStatus =
  | "capturing"
  | "processing"
  | "ready"
  | "failed"
  | "human_review_required";

export type OffsideVerdict = "offside" | "onside" | "human_review_required";
export type GoalLineVerdict = "goal" | "no_goal" | "human_review_required";
export type AnyVerdict = OffsideVerdict | GoalLineVerdict;

export type Point2D = { x: number; y: number };

export type OffsideAnalysis = {
  type: "offside";
  verdict: OffsideVerdict;
  confidence: number;
  rationale: string[];
  pass_frame_ms: number;
  attacker: Point2D;
  defender: Point2D;
  ball: Point2D;
  offside_line_x: number;
  detection_count?: number;
};

export type GoalLineAnalysis = {
  type: "goal_line";
  verdict: GoalLineVerdict;
  confidence: number;
  rationale: string[];
  goal_line_x: number;
  ball_trajectory: Point2D[];
  crossing_frame_ms: number | null;
};

export type IncidentAnalysis = OffsideAnalysis | GoalLineAnalysis;

export type UserProfile = {
  id: string;
  team_account_id: string;
  role: UserRole;
  display_name: string | null;
  avatar_url: string | null;
};

export type League = {
  id: string;
  team_account_id: string;
  name: string;
  season: string | null;
};

export type Team = {
  id: string;
  league_id: string;
  team_account_id: string;
  name: string;
  crest_url: string | null;
};

export type Match = {
  id: string;
  league_id: string;
  team_account_id: string;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
  venue: string | null;
  status: MatchStatus;
  video_source_url: string | null;
  sample_clip_id: string | null;
  video_source_kind: VideoSourceKind;
  video_source_path: string | null;
  video_stream_url: string | null;
  calibration: CalibrationJson | null;
  stream_state: StreamStatus;
  stream_state_at: string | null;
};

export type MatchAssignment = {
  id: string;
  match_id: string;
  user_id: string;
  role_on_match: string;
};

export type Incident = {
  id: string;
  match_id: string;
  team_account_id: string;
  type: IncidentType;
  status: IncidentStatus;
  verdict: string | null;
  confidence: number | null;
  match_clock: string | null;
  source_timecode_ms: number | null;
  locked_frame_ms: number | null;
  clip_path: string | null;
  snapshot_path: string | null;
  ai_payload: IncidentAnalysis | null;
  referee_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_clip_at: string | null;
};

export type MatchWithTeams = Match & {
  home_team: Pick<Team, "id" | "name" | "crest_url">;
  away_team: Pick<Team, "id" | "name" | "crest_url">;
  league: Pick<League, "id" | "name" | "season">;
};
