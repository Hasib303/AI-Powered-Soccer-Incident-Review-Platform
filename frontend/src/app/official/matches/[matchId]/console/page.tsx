import Link from "next/link";
import { notFound } from "next/navigation";
import { ListChecks, Radio } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConsoleClient } from "./console-client";
import { requireRole } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { videoUrlForMatch } from "@/lib/video-source";
import type {
  Incident,
  MatchStatus,
  StreamStatus,
  VideoSourceKind,
} from "@/lib/database.types";

type ConsolePageProps = { params: Promise<{ matchId: string }> };

type ConsoleMatch = {
  id: string;
  status: MatchStatus;
  kickoff_at: string;
  venue: string | null;
  sample_clip_id: string | null;
  video_source_kind: VideoSourceKind;
  video_source_path: string | null;
  video_stream_url: string | null;
  stream_state: StreamStatus;
  home_team: { id: string; name: string } | null;
  away_team: { id: string; name: string } | null;
};

export default async function ConsolePage({ params }: ConsolePageProps) {
  const { matchId } = await params;
  await requireRole("official", "admin");
  const supabase = await createSupabaseServer();

  const { data: matchRaw } = await supabase
    .from("matches")
    .select(
      `id, status, kickoff_at, venue, sample_clip_id, video_source_kind,
       video_source_path, video_stream_url, stream_state,
       home_team:teams!home_team_id (id, name),
       away_team:teams!away_team_id (id, name)`,
    )
    .eq("id", matchId)
    .maybeSingle();

  if (!matchRaw) notFound();
  const match = matchRaw as unknown as ConsoleMatch;

  const { data: incidents } = await supabase
    .from("incidents")
    .select(
      "id, type, status, verdict, confidence, match_clock, locked_frame_ms, created_at, ai_payload",
    )
    .eq("match_id", matchId)
    .order("created_at", { ascending: false });

  const videoSrc = await videoUrlForMatch(match);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-8 py-4">
        <div className="flex items-center gap-3">
          {match.status === "live" ? (
            <Badge tone="live">
              <span className="size-2 rounded-full bg-danger rec-pulse" />
              REC
            </Badge>
          ) : (
            <Badge tone="primary">{match.status}</Badge>
          )}
          <h1 className="text-lg font-semibold">
            {match.home_team?.name ?? "—"}{" "}
            <span className="px-2 text-text-dim">vs</span>{" "}
            {match.away_team?.name ?? "—"}
          </h1>
          <span className="font-mono text-sm tabular-nums text-text-dim">
            {match.venue ?? ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/official/matches/${matchId}/stream`}>
              <Radio className="size-4" />
              Live Stream
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/official/matches/${matchId}/incidents`}>
              <ListChecks className="size-4" />
              Incidents Log
            </Link>
          </Button>
        </div>
      </header>

      <ConsoleClient
        matchId={matchId}
        videoSrc={videoSrc}
        videoSourceKind={match.video_source_kind}
        videoStreamUrl={match.video_stream_url}
        initialStreamState={match.stream_state}
        initialIncidents={(incidents ?? []) as unknown as Incident[]}
      />
    </div>
  );
}
