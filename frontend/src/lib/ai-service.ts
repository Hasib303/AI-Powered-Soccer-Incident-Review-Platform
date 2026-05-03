import "server-only";

import type { IncidentAnalysis } from "@/lib/database.types";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8000";

async function postJson<TIn, TOut>(path: string, body: TIn): Promise<TOut> {
  const res = await fetch(`${AI_SERVICE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `AI service ${path} returned ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  return (await res.json()) as TOut;
}

type SourceRef = { match_id: string } | { clip_id: string };

export async function analyzeOffside(
  input: SourceRef & {
    locked_frame_ms: number;
    attacking_team?: "A" | "B";
  },
): Promise<IncidentAnalysis> {
  return postJson("/analyze/offside", { attacking_team: "A", ...input });
}

export async function analyzeGoalLine(
  input: SourceRef & { frame_range_ms: [number, number] },
): Promise<IncidentAnalysis> {
  return postJson("/analyze/goal-line", input);
}

export async function pingAiService(): Promise<{ status: string }> {
  const res = await fetch(`${AI_SERVICE_URL}/health`, { cache: "no-store" });
  if (!res.ok) throw new Error(`AI service /health returned ${res.status}`);
  return res.json();
}
