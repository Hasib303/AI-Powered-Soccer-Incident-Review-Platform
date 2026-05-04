"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import { requireRole } from "@/lib/auth";
import { createSupabaseServer, createSupabaseServiceRole } from "@/lib/supabase/server";
import { UuidLike } from "@/lib/zod";

const CreateMatchSchema = z
  .object({
    league_id: UuidLike,
    home_team_id: UuidLike,
    away_team_id: UuidLike,
    kickoff_at: z.string().min(1),
    venue: z.string().trim().max(120).optional(),
    // "upload" → MP4 in Supabase Storage; "stream" → live RTMP/HLS URL.
    source_kind: z.enum(["upload", "stream"]).default("upload"),
    video_source_path: z.string().max(500).optional(),
    video_stream_url: z.string().max(500).optional(),
    // Uploaded matches default to `completed` (post-match recording). Streams
    // transition the row to `live` automatically via the action below.
    status: z.enum(["scheduled", "live", "completed"]).default("completed"),
  })
  .refine(
    (data) => {
      if (data.source_kind === "upload") return !!data.video_source_path;
      // For stream sources, accept rtmp(s):// or http(s)://
      const url = data.video_stream_url?.trim() ?? "";
      return /^(rtmps?|https?):\/\//i.test(url);
    },
    {
      message:
        "Provide a video file (upload) or a valid RTMP/HLS URL (live stream).",
      path: ["video_source_path"],
    },
  );

const SaveCalibrationSchema = z.object({
  match_id: UuidLike,
  calibration: z.object({
    image_points: z.array(z.tuple([z.number(), z.number()])).length(4),
    pitch_points: z.array(z.tuple([z.number(), z.number()])).length(4),
    pitch_length_m: z.number().positive().default(105),
    pitch_width_m: z.number().positive().default(68),
    attacking_direction: z.enum(["left", "right"]).default("right"),
    goal_line_x: z.number().default(105),
  }),
});

export type CreateMatchResult =
  | { ok: true; matchId: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export async function createMatchAction(
  input: z.input<typeof CreateMatchSchema>,
): Promise<CreateMatchResult> {
  const parsed = CreateMatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Form validation failed.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  if (parsed.data.home_team_id === parsed.data.away_team_id) {
    return { ok: false, message: "Home and away teams must be different." };
  }

  const session = await requireRole("official", "admin");
  const supabase = await createSupabaseServer();

  const isStream = parsed.data.source_kind === "stream";
  const streamUrl = parsed.data.video_stream_url?.trim() ?? "";
  const videoKind: "upload" | "rtmp" | "hls" = isStream
    ? streamUrl.toLowerCase().startsWith("rtmp")
      ? "rtmp"
      : "hls"
    : "upload";

  const { data, error } = await supabase
    .from("matches")
    .insert({
      league_id: parsed.data.league_id,
      team_account_id: session.profile.team_account_id,
      home_team_id: parsed.data.home_team_id,
      away_team_id: parsed.data.away_team_id,
      kickoff_at: new Date(parsed.data.kickoff_at).toISOString(),
      venue: parsed.data.venue ?? null,
      // Live streams flip the match into "live" the moment they're created.
      status: isStream ? "live" : parsed.data.status,
      video_source_kind: videoKind,
      video_source_path: isStream ? null : parsed.data.video_source_path,
      video_stream_url: isStream ? streamUrl : null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, message: error?.message ?? "Insert failed." };
  }

  // Auto-assign the creating official to the match so they can review.
  // The match_assignments RLS policy is admin-only, but authz is already
  // enforced at the perimeter by `requireRole("official", "admin")` above —
  // so we use the service-role client to bypass RLS just for this row.
  const adminClient = createSupabaseServiceRole();
  const { error: assignError } = await adminClient
    .from("match_assignments")
    .insert({
      match_id: data.id,
      user_id: session.userId,
      role_on_match: "video_ref",
    });
  if (assignError) {
    return {
      ok: false,
      message: `Match created but assignment failed: ${assignError.message}`,
    };
  }

  await supabase.from("audit_events").insert({
    team_account_id: session.profile.team_account_id,
    actor_id: session.userId,
    action: "match.created",
    target_type: "match",
    target_id: data.id,
    payload: isStream
      ? { kind: videoKind, video_stream_url: streamUrl }
      : { kind: "upload", video_source_path: parsed.data.video_source_path },
  });

  // For live streams, kick off the FFmpeg ingest worker now so the user
  // doesn't have to make a second click on the /stream page. Failure here
  // is non-fatal — the match still exists and they can retry on /stream.
  if (isStream) {
    const aiUrl = process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8000";
    try {
      await fetch(`${aiUrl}/streams/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: data.id, source_url: streamUrl }),
        cache: "no-store",
      });
    } catch {
      // Swallow — the user can connect manually on the stream page.
    }
  }

  revalidatePath("/official/assignments");
  return { ok: true, matchId: data.id };
}

export async function saveCalibrationAction(
  input: z.input<typeof SaveCalibrationSchema>,
): Promise<{ ok: boolean; message?: string }> {
  const parsed = SaveCalibrationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }
  await requireRole("official", "admin");
  const supabase = await createSupabaseServer();

  const { error } = await supabase
    .from("matches")
    .update({ calibration: parsed.data.calibration })
    .eq("id", parsed.data.match_id);

  if (error) return { ok: false, message: error.message };
  revalidatePath(`/official/matches/${parsed.data.match_id}/console`);
  return { ok: true };
}

export async function deleteMatchAction(input: {
  matchId: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (!input.matchId) return { ok: false, message: "Missing matchId." };
  await requireRole("official", "admin");
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("matches").delete().eq("id", input.matchId);
  if (error) return { ok: false, message: error.message };
  redirect("/official/assignments");
}
