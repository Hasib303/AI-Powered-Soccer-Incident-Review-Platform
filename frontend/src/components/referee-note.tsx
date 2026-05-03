"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveRefereeNoteAction } from "@/lib/actions/incidents";
import { cn } from "@/lib/utils";

const MAX_LEN = 300;

export function RefereeNoteForm({
  incidentId,
  initialNote,
  readOnly = false,
}: {
  incidentId: string;
  initialNote: string | null;
  readOnly?: boolean;
}) {
  const [note, setNote] = useState(initialNote ?? "");
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  if (readOnly) {
    return (
      <div className="rounded-lg border border-border bg-surface-2/40 p-4">
        <Label>Referee note</Label>
        <p className="mt-2 whitespace-pre-wrap text-sm text-text-dim">
          {initialNote || <span className="italic">No note recorded.</span>}
        </p>
      </div>
    );
  }

  const onSubmit = () => {
    setFeedback(null);
    start(async () => {
      const result = await saveRefereeNoteAction({ incidentId, note });
      setFeedback({
        ok: result.ok,
        message: result.ok ? "Note saved." : (result.message ?? "Save failed."),
      });
    });
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <Label htmlFor={`note-${incidentId}`}>Referee note</Label>
        <span
          className={cn(
            "text-[11px] tabular-nums",
            note.length > MAX_LEN ? "text-danger" : "text-text-dim",
          )}
        >
          {note.length}/{MAX_LEN}
        </span>
      </div>
      <textarea
        id={`note-${incidentId}`}
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, MAX_LEN))}
        rows={3}
        placeholder="Optional context: weather, dispute, player feedback…"
        className="mt-2 w-full resize-none rounded-md border border-border bg-bg p-3 text-sm text-text placeholder:text-text-dim/60 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-text-dim">
          {feedback ? (
            <span className={feedback.ok ? "text-success" : "text-danger"}>
              {feedback.message}
            </span>
          ) : (
            "Notes are saved against this incident only."
          )}
        </p>
        <Button onClick={onSubmit} disabled={pending} size="sm">
          <Save className="size-4" />
          {pending ? "Saving…" : "Save note"}
        </Button>
      </div>
    </div>
  );
}
