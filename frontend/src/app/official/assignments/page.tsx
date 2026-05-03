import Link from "next/link";
import { ArrowRight, MapPin, Plus, Trophy, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { relativeKickoff } from "@/lib/utils";
import type { MatchStatus } from "@/lib/database.types";

type AssignmentRow = {
  id: string;
  role_on_match: string;
  match: {
    id: string;
    kickoff_at: string;
    venue: string | null;
    status: MatchStatus;
    sample_clip_id: string | null;
    home_team: { id: string; name: string } | null;
    away_team: { id: string; name: string } | null;
    league: { id: string; name: string; season: string | null } | null;
  } | null;
};

const STATUS_TONE: Record<MatchStatus, "live" | "primary" | "neutral"> = {
  live: "live",
  scheduled: "primary",
  completed: "neutral",
};

export default async function AssignmentsPage() {
  const session = await requireRole("official", "admin");
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("match_assignments")
    .select(
      `id, role_on_match,
       match:matches (
         id, kickoff_at, venue, status, sample_clip_id,
         home_team:teams!home_team_id (id, name),
         away_team:teams!away_team_id (id, name),
         league:leagues (id, name, season)
       )`
    )
    .eq("user_id", session.userId)
    .order("kickoff_at", { foreignTable: "matches", ascending: false });

  const rows = (data ?? []) as unknown as AssignmentRow[];

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">My Assignments</h1>
          <p className="text-sm text-text-dim">
            Matches where you are assigned as a video ref. Live matches open the console.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="primary" className="hidden sm:inline-flex">
            {rows.length} {rows.length === 1 ? "match" : "matches"}
          </Badge>
          <Button asChild size="sm">
            <Link href="/official/matches/new">
              <Plus className="size-4" />
              New match
            </Link>
          </Button>
        </div>
      </header>

      {error ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-danger">
            Failed to load assignments: {error.message}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing assigned yet</CardTitle>
            <CardDescription>
              Once an admin assigns you to a match, it will appear here. The seed
              data should give you one live match — re-run <code>seed.sql</code> if
              this list is empty.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wider text-text-dim">
              <tr>
                <th className="px-5 py-3 font-medium">Kickoff</th>
                <th className="px-5 py-3 font-medium">Match</th>
                <th className="px-5 py-3 font-medium">Competition</th>
                <th className="px-5 py-3 font-medium">Venue</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const m = row.match;
                if (!m) return null;
                const tone = STATUS_TONE[m.status];
                const kickoff = new Date(m.kickoff_at);
                const isLive = m.status === "live";
                const consoleHref = `/official/matches/${m.id}/console`;
                const incidentsHref = `/official/matches/${m.id}/incidents`;
                return (
                  <tr key={row.id} className="hover:bg-surface-2/50">
                    <td className="px-5 py-4 align-top">
                      <p className="font-medium">
                        {kickoff.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="text-xs text-text-dim">
                        {kickoff.toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}{" "}
                        · {relativeKickoff(m.kickoff_at)}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <p className="font-semibold">
                        {m.home_team?.name ?? "—"}
                      </p>
                      <p className="text-xs text-text-dim">vs</p>
                      <p className="font-semibold">
                        {m.away_team?.name ?? "—"}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top text-text-dim">
                      <span className="inline-flex items-center gap-1.5">
                        <Trophy className="size-3.5" />
                        {m.league?.name ?? "—"}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top text-text-dim">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-3.5" />
                        {m.venue ?? "—"}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <Badge tone={tone}>
                        {isLive ? <Video className="size-3" /> : null}
                        {m.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 align-top text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={incidentsHref}>Incidents</Link>
                        </Button>
                        <Button asChild size="sm">
                          <Link href={consoleHref}>
                            Console
                            <ArrowRight className="size-4" />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
