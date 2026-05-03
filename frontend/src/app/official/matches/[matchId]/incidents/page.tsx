import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill, VerdictBadge } from "@/components/ui/status-pill";
import { requireRole } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { formatPercent } from "@/lib/utils";

type PageProps = { params: Promise<{ matchId: string }> };

export default async function MatchIncidentsPage({ params }: PageProps) {
  const { matchId } = await params;
  await requireRole("official", "admin");
  const supabase = await createSupabaseServer();

  const { data: match } = await supabase
    .from("matches")
    .select(
      `id, kickoff_at, venue,
       home_team:teams!home_team_id (id, name),
       away_team:teams!away_team_id (id, name)`,
    )
    .eq("id", matchId)
    .maybeSingle();
  if (!match) notFound();

  const { data: incidents } = await supabase
    .from("incidents")
    .select("id, type, status, verdict, confidence, match_clock, created_at")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false });

  const homeName = (match as { home_team?: { name?: string } | null }).home_team?.name ?? "—";
  const awayName = (match as { away_team?: { name?: string } | null }).away_team?.name ?? "—";

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link href={`/official/matches/${matchId}/console`}>
              <ArrowLeft className="size-4" />
              Back to console
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold">
            {homeName}{" "}
            <span className="text-text-dim">vs</span>{" "}
            {awayName}
          </h1>
          <p className="text-sm text-text-dim">
            All incidents reviewed in this match.
          </p>
        </div>
      </header>

      {(incidents ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-text-dim">
            No incidents have been reviewed for this match yet.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wider text-text-dim">
              <tr>
                <th className="px-5 py-3 font-medium">Clock</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Verdict</th>
                <th className="px-5 py-3 font-medium">Confidence</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(incidents ?? []).map((i) => (
                <tr key={i.id} className="hover:bg-surface-2/50">
                  <td className="px-5 py-4 font-mono tabular-nums">{i.match_clock ?? "—"}</td>
                  <td className="px-5 py-4 capitalize">{i.type.replace("_", " ")}</td>
                  <td className="px-5 py-4">
                    <VerdictBadge type={i.type as "offside" | "goal_line"} verdict={i.verdict} />
                  </td>
                  <td className="px-5 py-4 text-text-dim">{formatPercent(i.confidence ?? null)}</td>
                  <td className="px-5 py-4">
                    <StatusPill status={i.status} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/official/incidents/${i.id}`}>Open</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
