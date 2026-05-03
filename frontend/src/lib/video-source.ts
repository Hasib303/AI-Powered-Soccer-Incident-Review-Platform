import "server-only";

import { createSupabaseServer } from "@/lib/supabase/server";
import type { Match } from "@/lib/database.types";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8000";
const CLIPS_BUCKET = "clips";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

type VideoSourceFields = Pick<
  Match,
  | "video_source_kind"
  | "video_source_path"
  | "video_stream_url"
  | "sample_clip_id"
>;

/**
 * Resolve a match row to a playback URL the browser can stream.
 *
 * - `sample` → AI service serves the MP4 directly.
 * - `upload` → Supabase Storage signed URL (1h TTL).
 * - `rtmp` / `hls` → return the stream URL; the player must use HLS.js.
 */
export async function videoUrlForMatch(
  match: VideoSourceFields,
): Promise<string | null> {
  switch (match.video_source_kind) {
    case "sample":
      if (!match.sample_clip_id) return null;
      return `${AI_SERVICE_URL}/samples/${match.sample_clip_id}.mp4`;

    case "upload": {
      if (!match.video_source_path) return null;
      const supabase = await createSupabaseServer();
      const { data, error } = await supabase.storage
        .from(CLIPS_BUCKET)
        .createSignedUrl(match.video_source_path, SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    }

    case "rtmp":
    case "hls":
      return match.video_stream_url ?? null;

    default:
      return null;
  }
}

/**
 * Generate a short-lived signed URL forced to download mode (the user clicks
 * "Download clip" and gets the MP4 with the right filename).
 */
export async function clipDownloadUrl(
  storagePath: string,
  filename: string,
): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.storage
    .from(CLIPS_BUCKET)
    .createSignedUrl(storagePath, 5 * 60, { download: filename });
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
