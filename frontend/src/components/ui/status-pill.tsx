import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { IncidentStatus } from "@/lib/database.types";

const LABEL: Record<IncidentStatus, string> = {
  capturing: "Capturing",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
  human_review_required: "Human Review",
};

const TONE: Record<IncidentStatus, "neutral" | "primary" | "warning" | "danger" | "success"> = {
  capturing: "warning",
  processing: "warning",
  ready: "success",
  failed: "danger",
  human_review_required: "warning",
};

export function StatusPill({ status }: { status: IncidentStatus }) {
  const isWorking = status === "capturing" || status === "processing";
  return (
    <Badge tone={TONE[status]}>
      {isWorking ? <Loader2 className="size-3 animate-spin" /> : null}
      {LABEL[status]}
    </Badge>
  );
}

export function VerdictBadge({
  type,
  verdict,
}: {
  type: "offside" | "goal_line";
  verdict: string | null;
}) {
  if (!verdict) return <Badge tone="neutral">—</Badge>;
  const v = verdict.toLowerCase();
  if (v === "offside") return <Badge tone="danger">Offside</Badge>;
  if (v === "onside") return <Badge tone="success">Onside</Badge>;
  if (v === "goal") return <Badge tone="success">Goal</Badge>;
  if (v === "no_goal") return <Badge tone="danger">No goal</Badge>;
  if (v === "human_review_required") return <Badge tone="warning">Human review</Badge>;
  return <Badge tone="neutral">{verdict}</Badge>;
}
