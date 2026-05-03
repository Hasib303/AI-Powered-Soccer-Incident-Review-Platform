"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, Camera, Crosshair, Goal, Hand, Loader2, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipPlayer, type ClipPlayerHandle } from "@/components/clip-player";
import { StreamStatusBanner } from "@/components/stream-status-banner";
import { StatusPill, VerdictBadge } from "@/components/ui/status-pill";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import {
  analyzeIncidentAction,
  createIncidentAction,
  lockFrameAction,
} from "@/lib/actions/incidents";
import { cn, formatClock } from "@/lib/utils";
import type {
  Incident,
  IncidentType,
  StreamStatus,
  VideoSourceKind,
} from "@/lib/database.types";

type Props = {
  matchId: string;
  videoSrc: string | null;
  videoSourceKind: VideoSourceKind;
  videoStreamUrl: string | null;
  initialStreamState: StreamStatus;
  initialIncidents: Incident[];
};

export function ConsoleClient({
  matchId,
  videoSrc,
  videoSourceKind,
  videoStreamUrl,
  initialStreamState,
  initialIncidents,
}: Props) {
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents);
  const [activeIncident, setActiveIncident] = useState<Incident | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<ClipPlayerHandle | null>(null);
  const [playerMs, setPlayerMs] = useState(0);

  // Subscribe to incident transitions for this match.
  useEffect(() => {
    const supabase = createSupabaseBrowser();
    const channel = supabase
      .channel(`incidents:${matchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "incidents", filter: `match_id=eq.${matchId}` },
        (payload) => {
          setIncidents((prev) => {
            const next = [...prev];
            if (payload.eventType === "INSERT") {
              next.unshift(payload.new as Incident);
            } else if (payload.eventType === "UPDATE") {
              const updated = payload.new as Incident;
              const idx = next.findIndex((i) => i.id === updated.id);
              if (idx >= 0) next[idx] = updated;
              setActiveIncident((curr) =>
                curr && curr.id === updated.id ? updated : curr,
              );
            } else if (payload.eventType === "DELETE") {
              const old = payload.old as Incident;
              return next.filter((i) => i.id !== old.id);
            }
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  const onTriggerReview = (type: IncidentType) => {
    setError(null);
    start(async () => {
      const r = await createIncidentAction({ matchId, type });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      const fresh: Incident = {
        id: r.incidentId,
        match_id: matchId,
        team_account_id: "",
        type,
        status: "capturing",
        verdict: null,
        confidence: null,
        match_clock: null,
        source_timecode_ms: null,
        locked_frame_ms: null,
        clip_path: null,
        snapshot_path: null,
        ai_payload: null,
        referee_note: null,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_clip_at: null,
      };
      setActiveIncident(fresh);
    });
  };

  const onReviewFrame = () => {
    if (!activeIncident) return;
    const lockedFrameMs = playerRef.current?.getCurrentMs() ?? playerMs;
    setError(null);
    start(async () => {
      const lock = await lockFrameAction({
        incidentId: activeIncident.id,
        lockedFrameMs: Math.round(lockedFrameMs),
      });
      if (!lock.ok) {
        setError(lock.message);
        return;
      }
      const result = await analyzeIncidentAction({
        incidentId: activeIncident.id,
        lockedFrameMs: Math.round(lockedFrameMs),
      });
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <div className="grid flex-1 grid-cols-[1fr_360px] gap-0 overflow-hidden">
      {/* Left: video + scrubber */}
      <section className="flex flex-col overflow-hidden">
        <StreamStatusBanner
          matchId={matchId}
          videoSourceKind={videoSourceKind}
          initialState={initialStreamState}
        />
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
        <ClipPlayer
          ref={playerRef}
          src={videoSrc}
          lockedFrameMs={activeIncident?.locked_frame_ms ?? null}
          onTimeUpdate={setPlayerMs}
        />
        {activeIncident ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Crosshair className="size-4 text-primary" />
                  Active review · {activeIncident.type === "offside" ? "Offside" : "Goal line"}
                </CardTitle>
                <StatusPill status={activeIncident.status} />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-text-dim">
              {activeIncident.type === "offside" ? (
                <p>
                  Scrub to the exact moment the ball is played, then press{" "}
                  <strong className="text-text">Review this frame</strong>. The
                  pass frame is locked at {formatClock(playerMs)}.
                </p>
              ) : (
                <p>
                  The system will track the ball across a 4-second window
                  centered on the locked frame at {formatClock(playerMs)}.
                </p>
              )}

              {activeIncident.status === "ready" || activeIncident.status === "human_review_required" ? (
                <div className="flex items-center gap-3 rounded-md border border-border bg-surface-2/40 p-3">
                  <VerdictBadge type={activeIncident.type} verdict={activeIncident.verdict} />
                  <p className="text-xs text-text-dim">
                    Confidence {Math.round((activeIncident.confidence ?? 0) * 100)}%
                  </p>
                  <Button asChild size="sm" variant="outline" className="ml-auto">
                    <Link href={`/official/incidents/${activeIncident.id}`}>
                      Open detail
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button onClick={onReviewFrame} disabled={pending}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Review this frame
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveIncident(null)}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {error ? (
                <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {error}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        </div>
      </section>

      {/* Right: action panel + match log */}
      <aside className="flex flex-col gap-4 overflow-y-auto border-l border-border bg-surface p-5">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim">
            Incident review
          </p>
          <div className="grid gap-2">
            <Button
              size="lg"
              onClick={() => onTriggerReview("offside")}
              disabled={pending || !!activeIncident}
              className="h-16 justify-start"
            >
              <Crosshair className="size-5" />
              <div className="text-left">
                <p className="font-semibold">Offside Check</p>
                <p className="text-[11px] font-normal opacity-80">
                  Capture 15s clip, analyze line at the locked frame
                </p>
              </div>
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => onTriggerReview("goal_line")}
              disabled={pending || !!activeIncident}
              className="h-16 justify-start"
            >
              <Goal className="size-5" />
              <div className="text-left">
                <p className="font-semibold">Goal Check</p>
                <p className="text-[11px] font-normal text-text-dim">
                  Track ball across goal-line window
                </p>
              </div>
            </Button>
            <DisabledFutureButton icon={Hand} label="Foul" />
            <DisabledFutureButton icon={Hand} label="Handball" />
            <DisabledFutureButton icon={ShieldAlert} label="Red Card" />
          </div>
          <p className="mt-2 text-[11px] text-text-dim">
            Foul/handball/red-card flows are out of MVP scope per the BRD §2.2.
          </p>
        </div>

        <div className="flex-1">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">
              Match log
            </p>
            <Badge tone="neutral">{incidents.length}</Badge>
          </div>
          {incidents.length === 0 ? (
            <p className="text-xs text-text-dim">No incidents yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {incidents.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/official/incidents/${i.id}`}
                    className={cn(
                      "block rounded-md border border-border bg-bg p-3 transition-colors hover:border-primary/40 hover:bg-surface-2",
                      activeIncident?.id === i.id && "border-primary/60",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold capitalize">
                        {i.type.replace("_", " ")}
                      </p>
                      <span className="font-mono text-[11px] text-text-dim">
                        {i.match_clock ?? "—"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <VerdictBadge type={i.type} verdict={i.verdict} />
                      <StatusPill status={i.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function DisabledFutureButton({
  icon: Icon,
  label,
}: {
  icon: typeof Camera;
  label: string;
}) {
  return (
    <div
      className="flex h-12 cursor-not-allowed items-center gap-2 rounded-md border border-dashed border-border bg-bg px-4 text-sm text-text-dim/60"
      title="Future scope — not part of the MVP."
    >
      <Icon className="size-4" />
      <span>{label}</span>
      <span className="ml-auto text-[10px] uppercase tracking-wider">Future</span>
    </div>
  );
}
