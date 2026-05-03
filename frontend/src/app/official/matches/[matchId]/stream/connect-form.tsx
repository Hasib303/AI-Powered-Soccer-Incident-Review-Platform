"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, PlayCircle, StopCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  getStreamStatusAction,
  startStreamAction,
  stopStreamAction,
  type StreamStatus,
} from "@/lib/actions/streams";
import type { StreamStatus as DBStreamStatus } from "@/lib/database.types";

const TONE: Record<
  StreamStatus["state"] | "idle",
  "neutral" | "primary" | "warning" | "success" | "danger"
> = {
  idle: "neutral",
  connecting: "warning",
  connected: "success",
  buffering: "warning",
  reconnecting: "warning",
  disconnected: "danger",
  failed: "danger",
  stopped: "neutral",
};

const POLL_MS = 2_500;

export function StreamConnectForm({
  matchId,
  initialUrl,
  initialState,
}: {
  matchId: string;
  initialUrl: string;
  initialState: DBStreamStatus;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<StreamStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const tick = async () => {
      const s = await getStreamStatusAction({ matchId });
      if (s) setStatus(s);
    };
    void tick();
    pollRef.current = setInterval(tick, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [matchId]);

  const onConnect = () => {
    setError(null);
    start(async () => {
      const result = await startStreamAction({ matchId, sourceUrl: url.trim() });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setStatus(result.status);
    });
  };

  const onDisconnect = () => {
    setError(null);
    start(async () => {
      const result = await stopStreamAction({ matchId });
      if (!result.ok) {
        setError(result.message ?? "Failed to stop.");
        return;
      }
      setStatus(null);
    });
  };

  const stateLabel = (status?.state ?? initialState ?? "idle") as
    | StreamStatus["state"]
    | "idle";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="source-url">RTMP / HLS URL</Label>
        <div className="flex gap-2">
          <Input
            id="source-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
            disabled={pending}
          />
          {stateLabel === "stopped" || stateLabel === "idle" || stateLabel === "failed" ? (
            <Button onClick={onConnect} disabled={pending || !url.trim()}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
              Connect
            </Button>
          ) : (
            <Button variant="danger" onClick={onDisconnect} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <StopCircle className="size-4" />}
              Disconnect
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-md border border-border bg-surface-2/40 p-3 text-sm">
        <Badge tone={TONE[stateLabel]}>{stateLabel}</Badge>
        <span className="text-text-dim">
          {status
            ? `${status.segment_count} segments buffered (${status.buffered_seconds}s)`
            : "No active worker"}
        </span>
        {status?.kind ? (
          <span className="ml-auto font-mono text-xs text-text-dim">
            {status.kind.toUpperCase()}
          </span>
        ) : null}
      </div>

      {status?.last_error ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
          Last error: <span className="font-mono">{status.last_error.slice(0, 240)}</span>
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
