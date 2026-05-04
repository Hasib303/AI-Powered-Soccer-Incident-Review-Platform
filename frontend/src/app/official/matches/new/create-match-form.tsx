"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radio, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMatchAction } from "@/lib/actions/matches";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type LeagueRow = { id: string; name: string; season: string | null };
type TeamRow = { id: string; name: string; league_id: string };

type Props = {
  leagues: LeagueRow[];
  teams: TeamRow[];
  teamAccountId: string;
};

type SourceKind = "upload" | "stream";

const ACCEPTED = "video/mp4,video/quicktime,video/x-matroska";
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB ceiling for the demo
const STREAM_PLACEHOLDER = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
const STREAM_URL_RE = /^(rtmps?|https?):\/\/.+/i;

function isoFromLocal(value: string): string {
  // <input type="datetime-local"> returns a local-zone string with no offset.
  // Convert to a real ISO string so Supabase's timestamptz column gets the
  // correct moment.
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function CreateMatchForm({ leagues, teams, teamAccountId }: Props) {
  const router = useRouter();
  const [sourceKind, setSourceKind] = useState<SourceKind>("upload");
  const [leagueId, setLeagueId] = useState(leagues[0]?.id ?? "");
  const filteredTeams = useMemo(
    () => teams.filter((t) => t.league_id === leagueId),
    [teams, leagueId],
  );
  const [homeTeamId, setHomeTeamId] = useState(filteredTeams[0]?.id ?? "");
  const [awayTeamId, setAwayTeamId] = useState(filteredTeams[1]?.id ?? "");
  const [kickoffAt, setKickoffAt] = useState(() => {
    const now = new Date();
    now.setSeconds(0, 0);
    return now.toISOString().slice(0, 16); // input[type=datetime-local] format
  });
  const [venue, setVenue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [streamUrl, setStreamUrl] = useState("");
  const [progress, setProgress] = useState<{ phase: string; pct: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (homeTeamId === awayTeamId) {
      setError("Home and away teams must be different.");
      return;
    }

    if (sourceKind === "upload") {
      if (!file) {
        setError("Choose a video file before submitting.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError("File is over 500 MB. Trim or compress it before uploading.");
        return;
      }
    } else {
      const trimmed = streamUrl.trim();
      if (!STREAM_URL_RE.test(trimmed)) {
        setError("Stream URL must start with rtmp(s):// or http(s)://");
        return;
      }
    }

    start(async () => {
      try {
        if (sourceKind === "upload" && file) {
          const supabase = createSupabaseBrowser();
          // Pre-mint the match UUID so the storage path matches the row id.
          const matchId =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
          const objectKey = `team_${teamAccountId}/match_${matchId}/source.${ext}`;

          setProgress({ phase: "Uploading…", pct: 0 });
          const { error: uploadErr } = await supabase.storage
            .from("clips")
            .upload(objectKey, file, {
              contentType: file.type || "video/mp4",
              upsert: false,
              cacheControl: "3600",
            });
          if (uploadErr) {
            setProgress(null);
            setError(`Upload failed: ${uploadErr.message}`);
            return;
          }
          setProgress({ phase: "Saving match…", pct: 100 });

          const result = await createMatchAction({
            league_id: leagueId,
            home_team_id: homeTeamId,
            away_team_id: awayTeamId,
            kickoff_at: isoFromLocal(kickoffAt),
            venue: venue || undefined,
            source_kind: "upload",
            video_source_path: objectKey,
            status: "completed",
          });

          if (!result.ok) {
            setProgress(null);
            setError(result.message);
            return;
          }
          router.push(`/official/matches/${result.matchId}/console`);
        } else {
          // Live-stream path — no file upload, just create the match and the
          // server action kicks off the FFmpeg worker.
          setProgress({ phase: "Connecting to stream…", pct: 50 });
          const result = await createMatchAction({
            league_id: leagueId,
            home_team_id: homeTeamId,
            away_team_id: awayTeamId,
            kickoff_at: isoFromLocal(kickoffAt),
            venue: venue || undefined,
            source_kind: "stream",
            video_stream_url: streamUrl.trim(),
            status: "live",
          });

          if (!result.ok) {
            setProgress(null);
            setError(result.message);
            return;
          }
          router.push(`/official/matches/${result.matchId}/console`);
        }
      } catch (e) {
        setProgress(null);
        setError(e instanceof Error ? e.message : "Unknown error.");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      {/* Source-kind toggle */}
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-bg p-1">
        <button
          type="button"
          onClick={() => setSourceKind("upload")}
          className={cn(
            "flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium transition-colors",
            sourceKind === "upload"
              ? "bg-primary/15 text-primary"
              : "text-text-dim hover:text-text",
          )}
        >
          <UploadCloud className="size-4" />
          Upload recording
        </button>
        <button
          type="button"
          onClick={() => setSourceKind("stream")}
          className={cn(
            "flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium transition-colors",
            sourceKind === "stream"
              ? "bg-primary/15 text-primary"
              : "text-text-dim hover:text-text",
          )}
        >
          <Radio className="size-4" />
          Live stream
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="League">
          <select
            value={leagueId}
            onChange={(e) => {
              setLeagueId(e.target.value);
              const next = teams.filter((t) => t.league_id === e.target.value);
              setHomeTeamId(next[0]?.id ?? "");
              setAwayTeamId(next[1]?.id ?? "");
            }}
            className={selectClass}
          >
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.season ? ` · ${l.season}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kickoff">
          <Input
            type="datetime-local"
            value={kickoffAt}
            onChange={(e) => setKickoffAt(e.target.value)}
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Home team">
          <select
            value={homeTeamId}
            onChange={(e) => setHomeTeamId(e.target.value)}
            className={selectClass}
          >
            {filteredTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Away team">
          <select
            value={awayTeamId}
            onChange={(e) => setAwayTeamId(e.target.value)}
            className={selectClass}
          >
            {filteredTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Venue (optional)">
        <Input
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          placeholder="Riverside Stadium"
          maxLength={120}
        />
      </Field>

      {sourceKind === "upload" ? (
        <Field label="Match video (MP4 ≤ 500 MB)">
          <label
            className={cn(
              "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-bg p-4 text-sm text-text-dim hover:border-primary/50 hover:text-text",
              file && "border-primary/40 bg-surface-2 text-text",
            )}
          >
            <UploadCloud className="size-6" />
            {file ? (
              <p className="font-medium">
                {file.name}
                <span className="ml-1 text-xs text-text-dim">
                  ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                </span>
              </p>
            ) : (
              <p>Click to choose a file or drag-and-drop</p>
            )}
            <input
              type="file"
              accept={ACCEPTED}
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </Field>
      ) : (
        <Field label="RTMP / HLS source URL">
          <Input
            type="url"
            value={streamUrl}
            onChange={(e) => setStreamUrl(e.target.value)}
            placeholder={STREAM_PLACEHOLDER}
            spellCheck={false}
          />
          <p className="text-xs text-text-dim">
            Paste an RTMP (e.g. <code>rtmp://camera.local/live/stream</code>) or
            HLS playlist URL (ending in <code>.m3u8</code>). The Python service
            spins up an FFmpeg worker, maintains a 30-second rolling buffer,
            and handles disconnect / reconnect with exponential backoff.{" "}
            <button
              type="button"
              onClick={() => setStreamUrl(STREAM_PLACEHOLDER)}
              className="text-primary underline-offset-4 hover:underline"
            >
              Use the public Mux test stream
            </button>{" "}
            for a quick demo.
          </p>
        </Field>
      )}

      {progress ? (
        <div className="rounded-md border border-border bg-surface-2 p-3 text-sm text-text-dim">
          <p>{progress.phase}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-text-dim">
          {sourceKind === "upload"
            ? "Clip is stored privately at team_…/match_…/source.<ext>. Only your team can read or download it."
            : "Stream URL is stored on the match row; the FFmpeg worker writes segments to the AI service's local buffer (not Supabase Storage)."}
        </p>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending
            ? sourceKind === "upload"
              ? "Creating…"
              : "Connecting…"
            : sourceKind === "upload"
            ? "Create match"
            : "Create + connect"}
        </Button>
      </div>
    </form>
  );
}

const selectClass =
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
