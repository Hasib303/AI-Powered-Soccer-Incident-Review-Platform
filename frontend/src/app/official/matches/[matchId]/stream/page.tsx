import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MonitorPlay } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StreamConnectForm } from "./connect-form";
import { requireRole } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ matchId: string }> };

export default async function StreamPage({ params }: PageProps) {
  const { matchId } = await params;
  await requireRole("official", "admin");
  const supabase = await createSupabaseServer();

  const { data: match } = await supabase
    .from("matches")
    .select(
      `id, video_source_kind, video_stream_url, stream_state,
       home_team:teams!home_team_id (name),
       away_team:teams!away_team_id (name)`,
    )
    .eq("id", matchId)
    .maybeSingle();
  if (!match) notFound();

  const matchAny = match as unknown as {
    home_team: { name: string } | null;
    away_team: { name: string } | null;
  };
  const home = matchAny.home_team?.name ?? "—";
  const away = matchAny.away_team?.name ?? "—";

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link href={`/official/matches/${matchId}/console`}>
            <ArrowLeft className="size-4" />
            Back to console
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Live stream — {home} vs {away}</h1>
        <p className="max-w-xl text-sm text-text-dim">
          Connect an RTMP/HLS source. The Python service runs FFmpeg in the
          background, maintains a 30-second rolling buffer on disk, and the
          console pulls the most recent segment when you trigger a review.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MonitorPlay className="size-4 text-primary" />
            Stream source
          </CardTitle>
          <CardDescription>
            Use a public HLS URL like{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
              https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
            </code>{" "}
            for a quick demo. RTMP requires unblocked egress on port 1935.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StreamConnectForm
            matchId={matchId}
            initialUrl={match.video_stream_url ?? ""}
            initialState={match.stream_state}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-text-dim">
        Items 4–5 of the BRD compliance round are intentionally
        prototype-quality. The buffer is disk-based, segments are 2-second
        aligned, and full-match (90-min) soak testing is part of the long-horizon
        Phase 5 plan.
      </p>
    </div>
  );
}
