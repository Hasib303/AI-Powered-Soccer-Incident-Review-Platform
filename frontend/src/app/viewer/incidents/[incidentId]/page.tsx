import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PitchDiagram } from "@/components/pitch-diagram";
import { RefereeNoteForm } from "@/components/referee-note";
import { VerdictBadge } from "@/components/ui/status-pill";
import { VerdictCard } from "@/components/verdict-card";
import { requireRole } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { formatClock } from "@/lib/utils";
import type { IncidentAnalysis } from "@/lib/database.types";
import { videoUrlForMatch } from "@/lib/video-source";

type PageProps = { params: Promise<{ incidentId: string }> };

export default async function ViewerIncidentDetailPage({ params }: PageProps) {
  const { incidentId } = await params;
  await requireRole("viewer");
  const supabase = await createSupabaseServer();

  const { data: incident } = await supabase
    .from("incidents")
    .select(
      "id, match_id, type, verdict, confidence, match_clock, locked_frame_ms, ai_payload, referee_note",
    )
    .eq("id", incidentId)
    .maybeSingle();
  if (!incident) notFound();

  const { data: matchRow } = await supabase
    .from("matches")
    .select(
      `id, sample_clip_id, video_source_kind, video_source_path, video_stream_url,
       home_team:teams!home_team_id (name),
       away_team:teams!away_team_id (name)`,
    )
    .eq("id", incident.match_id)
    .maybeSingle();
  const match = matchRow as unknown as
    | {
        sample_clip_id: string | null;
        video_source_kind: "sample" | "upload" | "rtmp" | "hls";
        video_source_path: string | null;
        video_stream_url: string | null;
        home_team: { name: string } | null;
        away_team: { name: string } | null;
      }
    | null;

  const ai = incident.ai_payload as IncidentAnalysis | null;
  const isOffside = ai?.type === "offside";
  const isGoalLine = ai?.type === "goal_line";

  const videoSrc = match
    ? await videoUrlForMatch({
        video_source_kind: match.video_source_kind,
        video_source_path: match.video_source_path,
        video_stream_url: match.video_stream_url,
        sample_clip_id: match.sample_clip_id,
      })
    : null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link href={`/viewer/matches/${incident.match_id}/incidents`}>
              <ArrowLeft className="size-4" />
              Back to incidents
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold capitalize">
            {incident.type.replace("_", " ")} review
          </h1>
          <p className="text-sm text-text-dim">
            {match?.home_team?.name ?? "—"} vs {match?.away_team?.name ?? "—"}
            <span className="mx-2">·</span>
            <span className="font-mono">{incident.match_clock ?? "--:--"}</span>
            <span className="mx-2">·</span>
            Locked at {formatClock(incident.locked_frame_ms)}
          </p>
        </div>
        <VerdictBadge type={incident.type as "offside" | "goal_line"} verdict={incident.verdict} />
      </header>

      <div className="grid grid-cols-[1.4fr_1fr] gap-6">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Clip</CardTitle>
            </CardHeader>
            <CardContent>
              {videoSrc ? (
                <video
                  src={videoSrc}
                  controls
                  preload="metadata"
                  className="aspect-video w-full rounded-md bg-black"
                />
              ) : (
                <p className="text-sm text-text-dim">Clip not available.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Positional diagram</CardTitle>
            </CardHeader>
            <CardContent>
              {ai ? (
                <PitchDiagram
                  attacker={isOffside ? ai.attacker : null}
                  defender={isOffside ? ai.defender : null}
                  ball={isOffside ? ai.ball : null}
                  offsideLineX={isOffside ? ai.offside_line_x : null}
                  goalLineX={isGoalLine ? ai.goal_line_x : null}
                  ballTrajectory={isGoalLine ? ai.ball_trajectory : undefined}
                  className="w-full"
                />
              ) : (
                <p className="text-sm text-text-dim">No AI analysis stored.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {ai ? (
            <VerdictCard analysis={ai} />
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-text-dim">
                Verdict not available.
              </CardContent>
            </Card>
          )}
          <RefereeNoteForm
            incidentId={incident.id}
            initialNote={incident.referee_note ?? null}
            readOnly
          />
        </div>
      </div>
    </div>
  );
}
