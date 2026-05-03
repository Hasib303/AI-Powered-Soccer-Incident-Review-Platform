"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn, formatClock } from "@/lib/utils";

export type ClipPlayerHandle = {
  getCurrentMs: () => number;
  setCurrentMs: (ms: number) => void;
};

type ClipPlayerProps = {
  src: string | null;
  posterSrc?: string | null;
  className?: string;
  /** When true, the timeline shows a yellow "locked frame" marker. */
  lockedFrameMs?: number | null;
  onTimeUpdate?: (ms: number) => void;
};

export const ClipPlayer = forwardRef<ClipPlayerHandle, ClipPlayerProps>(
  function ClipPlayer({ src, posterSrc, className, lockedFrameMs, onTimeUpdate }, ref) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [duration, setDuration] = useState(0);
    const [currentMs, setCurrentMs] = useState(0);
    const [playing, setPlaying] = useState(false);

    useImperativeHandle(ref, () => ({
      getCurrentMs: () => currentMs,
      setCurrentMs: (ms: number) => {
        if (videoRef.current) videoRef.current.currentTime = ms / 1000;
      },
    }), [currentMs]);

    const onLoadedMeta = useCallback(() => {
      const v = videoRef.current;
      if (v) setDuration(v.duration * 1000);
    }, []);

    // HLS playback: Safari supports m3u8 natively; Chrome / Firefox need hls.js.
    useEffect(() => {
      const v = videoRef.current;
      if (!v || !src) return;
      const isHls = /\.m3u8(\?|$)/i.test(src);
      if (!isHls) {
        v.src = src;
        return;
      }
      // Native support (Safari)?
      if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = src;
        return;
      }
      let hls: import("hls.js").default | null = null;
      let cancelled = false;
      void import("hls.js").then((mod) => {
        if (cancelled || !videoRef.current) return;
        const Hls = mod.default;
        if (!Hls.isSupported()) {
          videoRef.current.src = src;
          return;
        }
        hls = new Hls({ lowLatencyMode: true, liveDurationInfinity: true });
        hls.loadSource(src);
        hls.attachMedia(videoRef.current);
      });
      return () => {
        cancelled = true;
        hls?.destroy();
      };
    }, [src]);

    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      const tick = () => {
        const ms = v.currentTime * 1000;
        setCurrentMs(ms);
        onTimeUpdate?.(ms);
      };
      v.addEventListener("timeupdate", tick);
      v.addEventListener("play", () => setPlaying(true));
      v.addEventListener("pause", () => setPlaying(false));
      return () => v.removeEventListener("timeupdate", tick);
    }, [onTimeUpdate]);

    const togglePlay = () => {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) v.play();
      else v.pause();
    };

    const seekTo = (ms: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.max(0, Math.min(duration / 1000, ms / 1000));
    };

    const stepFrame = (deltaMs: number) => seekTo(currentMs + deltaMs);

    const lockedRatio = duration && lockedFrameMs ? lockedFrameMs / duration : null;
    const ratio = duration ? currentMs / duration : 0;

    return (
      <div className={cn("flex flex-col gap-3", className)}>
        <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-bg-pitch-grid">
          {src ? (
            <video
              ref={videoRef}
              poster={posterSrc ?? undefined}
              onLoadedMetadata={onLoadedMeta}
              className="h-full w-full bg-black"
              playsInline
              preload="metadata"
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-pitch-grid text-text-dim">
              <p className="text-sm">No video loaded for this match.</p>
            </div>
          )}
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-bg/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-dim backdrop-blur-sm">
            <span className="size-2 rounded-full bg-danger rec-pulse" />
            CAM 1 · TACTICAL
          </div>
        </div>

        {/* Timeline */}
        <div>
          <div className="relative h-2 rounded-full bg-surface-2">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-primary"
              style={{ width: `${ratio * 100}%` }}
            />
            {lockedRatio != null ? (
              <div
                className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-warning"
                style={{ left: `${lockedRatio * 100}%` }}
                title={`Locked at ${formatClock(lockedFrameMs ?? 0)}`}
              />
            ) : null}
            <input
              type="range"
              min={0}
              max={Math.max(1, duration)}
              step={50}
              value={currentMs}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="absolute inset-0 w-full cursor-pointer opacity-0"
              aria-label="Scrub timeline"
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => stepFrame(-10000)} title="-10s">
            <RotateCcw className="size-4" />
          </Button>
          <Button variant="primary" size="icon" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button variant="outline" size="icon" onClick={() => stepFrame(40)} title="+1 frame">
            <Square className="size-4" />
          </Button>
          <div className="ml-3 font-mono text-sm tabular-nums text-text-dim">
            {formatClock(currentMs)} / {formatClock(duration)}
          </div>
        </div>
      </div>
    );
  },
);
