import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";

type ViewerMatchRow = {
  id: string;
  kickoff_at: string;
  venue: string | null;
  status: "scheduled" | "live" | "completed";
  home_team: { name: string } | null;
  away_team: { name: string } | null;
  league: { name: string } | null;
};

export default async function ViewerHome() {
  await requireRole("viewer");
  const supabase = await createSupabaseServer();

  const { data } = await supabase
    .from("matches")
    .select(
      `id, kickoff_at, venue, status,
       home_team:teams!home_team_id (name),
       away_team:teams!away_team_id (name),
       league:leagues (name)`,
    )
    .order("kickoff_at", { ascending: false })
    .limit(10);

  const rows = (data ?? []) as unknown as ViewerMatchRow[];

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold">Match history</h1>
        <p className="text-sm text-text-dim">
          Read-only view of incidents your team has access to. The official's
          console and editing tools are hidden for viewers.
        </p>
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No matches yet</CardTitle>
            <CardDescription>
              Once incidents are reviewed and marked ready, they'll show up here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge tone={m.status === "live" ? "live" : m.status === "completed" ? "neutral" : "primary"}>
                      {m.status}
                    </Badge>
                    <span className="text-xs text-text-dim">
                      {new Date(m.kickoff_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-base font-semibold">
                    {m.home_team?.name ?? "—"}{" "}
                    <span className="text-text-dim">vs</span>{" "}
                    {m.away_team?.name ?? "—"}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-text-dim">
                    <Trophy className="size-3.5" />
                    {m.league?.name ?? "—"}
                    {m.venue ? <span className="ml-2">· {m.venue}</span> : null}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/viewer/matches/${m.id}/incidents`}>
                    View incidents
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
