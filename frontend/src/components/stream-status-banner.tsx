"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCcw, Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { StreamStatus, VideoSourceKind } from "@/lib/database.types";

type Props = {
  matchId: string;
  videoSourceKind: VideoSourceKind;
  initialState: StreamStatus;
};

const TONE: Record<
  StreamStatus,
  { label: string; bg: string; border: string; fg: string; icon: typeof AlertTriangle }
> = {
  idle: {
    label: "Stream not configured",
    bg: "bg-surface-2",
    border: "border-border",
    fg: "text-text-dim",
    icon: Settings2,
  },
  connecting: {
    label: "Connecting to source…",
    bg: "bg-warning/10",
    border: "border-warning/40",
    fg: "text-warning",
    icon: RefreshCcw,
  },
  connected: {
    label: "Live stream connected",
    bg: "bg-success/10",
    border: "border-success/40",
    fg: "text-success",
    icon: AlertTriangle,
  },
  buffering: {
    label: "Buffering — waiting for first segment",
    bg: "bg-warning/10",
    border: "border-warning/40",
    fg: "text-warning",
    icon: RefreshCcw,
  },
  reconnecting: {
    label: "Camera dropped — reconnecting with backoff",
    bg: "bg-warning/10",
    border: "border-warning/40",
    fg: "text-warning",
    icon: RefreshCcw,
  },
  disconnected: {
    label: "Source disconnected",
    bg: "bg-danger/10",
    border: "border-danger/40",
    fg: "text-danger",
    icon: AlertTriangle,
  },
  failed: {
    label: "Stream worker failed",
    bg: "bg-danger/10",
    border: "border-danger/40",
    fg: "text-danger",
    icon: AlertTriangle,
  },
};

export function StreamStatusBanner({ matchId, videoSourceKind, initialState }: Props) {
  const [state, setState] = useState<StreamStatus>(initialState);

  useEffect(() => {
    if (videoSourceKind !== "rtmp" && videoSourceKind !== "hls") return;
    const supabase = createSupabaseBrowser();
    const channel = supabase
      .channel(`match-stream:${matchId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        (payload) => {
          const next = (payload.new as { stream_state?: StreamStatus }).stream_state;
          if (next) setState(next);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, videoSourceKind]);

  // Don't render the banner for sample / upload kinds — there's no stream.
  if (videoSourceKind !== "rtmp" && videoSourceKind !== "hls") return null;
  // Connected stream is the happy path — no banner clutter.
  if (state === "connected") return null;

  const tone = TONE[state] ?? TONE.idle;
  const Icon = tone.icon;
  const isReconnecting = state === "connecting" || state === "reconnecting" || state === "buffering";

  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-3 border-b px-6 py-2.5 text-sm",
        tone.bg,
        tone.border,
        tone.fg,
      )}
    >
      <Icon className={cn("size-4", isReconnecting && "animate-spin")} />
      <p className="font-medium">{tone.label}</p>
      <Badge tone="neutral" className="ml-auto">
        {state}
      </Badge>
      <Button asChild size="sm" variant="ghost">
        <Link href={`/official/matches/${matchId}/stream`}>Configure</Link>
      </Button>
    </div>
  );
}
