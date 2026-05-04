"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { requireRole, requireUser } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { analyzeGoalLine, analyzeOffside } from "@/lib/ai-service";
import { containsProfanity } from "@/lib/profanity";
import { clipDownloadUrl } from "@/lib/video-source";
import { UuidLike } from "@/lib/zod";
import type {
  IncidentAnalysis,
  IncidentStatus,
  IncidentType,
} from "@/lib/database.types";

// Confidence below this value flips the verdict to `human_review_required`
// per BRD §2.3. Env-driven so demos can lower it (e.g., 0.4) without
// touching code, while production keeps a stricter default.
const HUMAN_REVIEW_THRESHOLD = Number(
  process.env.HUMAN_REVIEW_THRESHOLD ?? "0.4",
);

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CreateIncidentSchema = z.object({
  matchId: UuidLike,
  type: z.enum(["offside", "goal_line"]),
});

const AnalyzeIncidentSchema = z.object({
  incidentId: UuidLike,
  lockedFrameMs: z.number().int().min(0),
});

const SaveNoteSchema = z.object({
  incidentId: UuidLike,
  note: z.string().max(300, "Referee notes are limited to 300 characters."),
});

const DeleteClipSchema = z.object({
  incidentId: UuidLike,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function thresholdedStatus(
  payload: IncidentAnalysis,
  baseStatus: IncidentStatus = "ready",
): IncidentStatus {
  if (payload.verdict === "human_review_required") return "human_review_required";
  if (typeof payload.confidence === "number" && payload.confidence < HUMAN_REVIEW_THRESHOLD) {
    return "human_review_required";
  }
  return baseStatus;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type CreateIncidentResult = { ok: true; incidentId: string } | { ok: false; message: string };

export async function createIncidentAction(input: {
  matchId: string;
  type: IncidentType;
}): Promise<CreateIncidentResult> {
  const parsed = CreateIncidentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };

  const session = await requireRole("official", "admin");
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("incidents")
    .insert({
      match_id: parsed.data.matchId,
      team_account_id: session.profile.team_account_id,
      type: parsed.data.type,
      status: "capturing",
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, message: error?.message ?? "Insert failed." };

  // Don't revalidate the console page here — the client subscribes to
  // incidents via Supabase Realtime and updates the match log itself.
  // Re-rendering the console would mint a fresh signed video URL, which
  // resets the user's scrubbed playhead to 00:00.00 right before they
  // click "Review this frame". The incidents-log page can refresh.
  revalidatePath(`/official/matches/${parsed.data.matchId}/incidents`);
  return { ok: true, incidentId: data.id };
}

export async function lockFrameAction(input: {
  incidentId: string;
  lockedFrameMs: number;
}): Promise<CreateIncidentResult> {
  const parsed = AnalyzeIncidentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  await requireRole("official", "admin");
  const supabase = await createSupabaseServer();

  const { error } = await supabase
    .from("incidents")
    .update({
      locked_frame_ms: parsed.data.lockedFrameMs,
      status: "processing",
    })
    .eq("id", parsed.data.incidentId);

  if (error) return { ok: false, message: error.message };
  return { ok: true, incidentId: parsed.data.incidentId };
}

export async function analyzeIncidentAction(input: {
  incidentId: string;
  lockedFrameMs?: number;
}): Promise<CreateIncidentResult> {
  if (!input.incidentId) return { ok: false, message: "Missing incidentId." };
  const session = await requireRole("official", "admin");
  const supabase = await createSupabaseServer();

  const { data: incident, error: loadErr } = await supabase
    .from("incidents")
    .select("id, type, match_id, locked_frame_ms")
    .eq("id", input.incidentId)
    .maybeSingle();

  if (loadErr || !incident) {
    return { ok: false, message: loadErr?.message ?? "Incident not found." };
  }

  const lockedFrameMs = input.lockedFrameMs ?? incident.locked_frame_ms ?? 0;
  if (incident.type === "offside" && !lockedFrameMs) {
    return { ok: false, message: "Lock a pass frame before requesting analysis." };
  }

  await supabase
    .from("incidents")
    .update({ status: "processing", locked_frame_ms: lockedFrameMs })
    .eq("id", incident.id);

  let analysis: IncidentAnalysis;
  try {
    analysis =
      incident.type === "offside"
        ? await analyzeOffside({
            match_id: incident.match_id,
            locked_frame_ms: lockedFrameMs,
          })
        : await analyzeGoalLine({
            match_id: incident.match_id,
            frame_range_ms: [
              Math.max(0, lockedFrameMs - 1500),
              lockedFrameMs + 3000,
            ],
          });
  } catch (err) {
    await supabase
      .from("incidents")
      .update({ status: "failed" })
      .eq("id", incident.id);
    return {
      ok: false,
      message:
        err instanceof Error
          ? `AI service failed: ${err.message}`
          : "AI service failed.",
    };
  }

  const status = thresholdedStatus(analysis);

  const matchClock = (() => {
    const minutes = Math.floor(lockedFrameMs / 60000);
    const seconds = Math.floor((lockedFrameMs % 60000) / 1000);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  })();

  await supabase
    .from("incidents")
    .update({
      status,
      verdict: analysis.verdict,
      confidence: analysis.confidence,
      ai_payload: analysis,
      match_clock: matchClock,
      source_timecode_ms: lockedFrameMs,
    })
    .eq("id", incident.id);

  revalidatePath(`/official/matches/${incident.match_id}/console`);
  revalidatePath(`/official/matches/${incident.match_id}/incidents`);
  revalidatePath(`/official/incidents/${incident.id}`);

  // Audit (best-effort; ignore policy errors for the demo).
  await supabase.from("audit_events").insert({
    team_account_id: session.profile.team_account_id,
    actor_id: session.userId,
    action: "incident.analyzed",
    target_type: "incident",
    target_id: incident.id,
    payload: { verdict: analysis.verdict, confidence: analysis.confidence },
  });

  return { ok: true, incidentId: incident.id };
}

export async function saveRefereeNoteAction(input: {
  incidentId: string;
  note: string;
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = SaveNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }
  if (containsProfanity(parsed.data.note)) {
    return {
      ok: false,
      message:
        "Note contains disallowed language. Please rephrase before saving.",
    };
  }
  await requireRole("official", "admin");
  const supabase = await createSupabaseServer();

  const { error } = await supabase
    .from("incidents")
    .update({ referee_note: parsed.data.note })
    .eq("id", parsed.data.incidentId);

  if (error) return { ok: false, message: error.message };
  revalidatePath(`/official/incidents/${parsed.data.incidentId}`);
  return { ok: true };
}

export async function getClipDownloadUrlAction(input: {
  incidentId: string;
}): Promise<{ ok: true; url: string; filename: string } | { ok: false; message: string }> {
  if (!input.incidentId) return { ok: false, message: "Missing incidentId." };
  const session = await requireUser();
  const supabase = await createSupabaseServer();

  const { data: incident, error: incidentErr } = await supabase
    .from("incidents")
    .select("id, match_id, type, clip_path, deleted_clip_at, match_clock")
    .eq("id", input.incidentId)
    .maybeSingle();
  if (incidentErr || !incident) {
    return { ok: false, message: incidentErr?.message ?? "Incident not found." };
  }
  if (incident.deleted_clip_at) {
    return { ok: false, message: "Clip has already been deleted." };
  }

  // For the demo, the source video doubles as the "clip" — incident-specific
  // clip extraction will land when /extract-clip is wired into the review flow.
  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("video_source_kind, video_source_path, sample_clip_id")
    .eq("id", incident.match_id)
    .maybeSingle();
  if (matchErr || !match) {
    return { ok: false, message: matchErr?.message ?? "Match not found." };
  }

  const filename = `incident-${incident.id.slice(0, 8)}-${incident.type}-${
    incident.match_clock ?? "clip"
  }.mp4`.replace(/[^A-Za-z0-9._-]/g, "_");

  if (match.video_source_kind === "upload" && match.video_source_path) {
    const url = await clipDownloadUrl(match.video_source_path, filename);
    if (!url) return { ok: false, message: "Could not generate signed URL." };
    await supabase.from("audit_events").insert({
      team_account_id: session.profile.team_account_id,
      actor_id: session.userId,
      action: "incident.clip_downloaded",
      target_type: "incident",
      target_id: incident.id,
    });
    return { ok: true, url, filename };
  }

  if (match.video_source_kind === "sample" && match.sample_clip_id) {
    const aiUrl = process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8000";
    return {
      ok: true,
      url: `${aiUrl}/samples/${match.sample_clip_id}.mp4`,
      filename,
    };
  }

  return {
    ok: false,
    message:
      "Live-stream clips can't be downloaded directly — extract a clip first.",
  };
}

export async function deleteClipAction(input: {
  incidentId: string;
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = DeleteClipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid id." };
  const session = await requireRole("official", "admin");
  const supabase = await createSupabaseServer();

  const { error } = await supabase
    .from("incidents")
    .update({ clip_path: null, deleted_clip_at: new Date().toISOString() })
    .eq("id", parsed.data.incidentId);

  if (error) return { ok: false, message: error.message };

  await supabase.from("audit_events").insert({
    team_account_id: session.profile.team_account_id,
    actor_id: session.userId,
    action: "incident.clip_deleted",
    target_type: "incident",
    target_id: parsed.data.incidentId,
  });

  revalidatePath(`/official/incidents/${parsed.data.incidentId}`);
  return { ok: true };
}
