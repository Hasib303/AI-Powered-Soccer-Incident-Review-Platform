import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateMatchForm } from "./create-match-form";
import { requireRole } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";

type LeagueRow = { id: string; name: string; season: string | null };
type TeamRow = { id: string; name: string; league_id: string };

export default async function NewMatchPage() {
  const session = await requireRole("official", "admin");
  const supabase = await createSupabaseServer();

  const [{ data: leagues }, { data: teams }] = await Promise.all([
    supabase.from("leagues").select("id, name, season").order("name"),
    supabase.from("teams").select("id, name, league_id").order("name"),
  ]);

  const leagueRows = (leagues ?? []) as LeagueRow[];
  const teamRows = (teams ?? []) as TeamRow[];

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link href="/official/assignments">
            <ArrowLeft className="size-4" />
            Back to assignments
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Create match from upload</h1>
        <p className="max-w-xl text-sm text-text-dim">
          Upload an MP4 of the full or partial match — the file is stored
          privately in your team's Supabase Storage bucket and the AI service
          analyzes it on demand. Live RTMP/HLS streams are configured from the
          match console after creation.
        </p>
      </header>

      {leagueRows.length === 0 || teamRows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No leagues or teams yet</CardTitle>
            <CardDescription>
              Run <code>backend/migrations/seed.sql</code> with your Supabase
              auth user IDs first, or add a league + at least two teams via
              the SQL editor before creating matches.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <CreateMatchForm
              leagues={leagueRows}
              teams={teamRows}
              teamAccountId={session.profile.team_account_id}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
