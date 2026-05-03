import { CheckCircle2, AlertTriangle, XCircle, Eye } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatPercent } from "@/lib/utils";
import type { IncidentAnalysis } from "@/lib/database.types";

const VERDICT_TONE: Record<
  string,
  { tone: "success" | "danger" | "warning"; label: string; icon: typeof CheckCircle2 }
> = {
  offside: { tone: "danger", label: "Offside", icon: XCircle },
  onside: { tone: "success", label: "Onside", icon: CheckCircle2 },
  goal: { tone: "success", label: "Goal", icon: CheckCircle2 },
  no_goal: { tone: "danger", label: "No goal", icon: XCircle },
  human_review_required: {
    tone: "warning",
    label: "Human review required",
    icon: AlertTriangle,
  },
};

export function VerdictCard({ analysis }: { analysis: IncidentAnalysis }) {
  const meta = VERDICT_TONE[analysis.verdict] ?? {
    tone: "warning" as const,
    label: analysis.verdict,
    icon: Eye,
  };
  const Icon = meta.icon;
  const confidencePct = Math.round((analysis.confidence ?? 0) * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Icon
              className={cn(
                "size-5",
                meta.tone === "success" && "text-success",
                meta.tone === "danger" && "text-danger",
                meta.tone === "warning" && "text-warning",
              )}
            />
            {meta.label}
          </CardTitle>
          <Badge tone={meta.tone}>{formatPercent(analysis.confidence)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-text-dim">
            <span>Confidence</span>
            <span>{confidencePct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                meta.tone === "success" && "bg-success",
                meta.tone === "danger" && "bg-danger",
                meta.tone === "warning" && "bg-warning",
              )}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-text-dim">
            AI rationale
          </p>
          <ul className="space-y-1.5 text-sm text-text-dim">
            {analysis.rationale.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
