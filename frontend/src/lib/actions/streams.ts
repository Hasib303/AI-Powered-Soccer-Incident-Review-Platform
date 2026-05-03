"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { requireRole } from "@/lib/auth";
import { UuidLike } from "@/lib/zod";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8000";

const StartStreamSchema = z.object({
  matchId: UuidLike,
  sourceUrl: z
    .string()
    .trim()
    .min(8)
    .refine(
      (s) =>
        s.startsWith("http://") ||
        s.startsWith("https://") ||
        s.startsWith("rtmp://") ||
        s.startsWith("rtmps://"),
      { message: "Source URL must start with http(s):// or rtmp(s)://." },
    ),
});

export type StreamStatus = {
  state:
    | "idle"
    | "connecting"
    | "connected"
    | "buffering"
    | "reconnecting"
    | "disconnected"
    | "failed"
    | "stopped";
  kind: "rtmp" | "hls";
  source_url: string;
  last_error: string | null;
  segment_count: number;
  buffered_seconds: number;
};

async function aiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${AI_SERVICE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`AI service ${path} returned ${r.status}: ${text.slice(0, 200)}`);
  }
  return (await r.json()) as T;
}

async function aiGet<T>(path: string): Promise<T | null> {
  const r = await fetch(`${AI_SERVICE_URL}${path}`, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`AI service ${path} returned ${r.status}`);
  return (await r.json()) as T;
}

export async function startStreamAction(input: {
  matchId: string;
  sourceUrl: string;
}): Promise<{ ok: true; status: StreamStatus } | { ok: false; message: string }> {
  const parsed = StartStreamSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  await requireRole("official", "admin");

  try {
    const status = await aiPost<StreamStatus>("/streams/start", {
      match_id: parsed.data.matchId,
      source_url: parsed.data.sourceUrl,
    });
    revalidatePath(`/official/matches/${parsed.data.matchId}/console`);
    revalidatePath(`/official/matches/${parsed.data.matchId}/stream`);
    return { ok: true, status };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to start stream.",
    };
  }
}

export async function stopStreamAction(input: {
  matchId: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (!input.matchId) return { ok: false, message: "Missing matchId." };
  await requireRole("official", "admin");
  try {
    await aiPost(`/streams/${input.matchId}/stop`, {});
    revalidatePath(`/official/matches/${input.matchId}/console`);
    revalidatePath(`/official/matches/${input.matchId}/stream`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to stop stream.",
    };
  }
}

export async function getStreamStatusAction(input: {
  matchId: string;
}): Promise<StreamStatus | null> {
  if (!input.matchId) return null;
  await requireRole("official", "admin");
  try {
    return await aiGet<StreamStatus>(`/streams/${input.matchId}/status`);
  } catch {
    return null;
  }
}
