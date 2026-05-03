"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteClipAction } from "@/lib/actions/incidents";

export function DeleteClipButton({
  incidentId,
  disabled = false,
}: {
  incidentId: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="danger"
      size="sm"
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          if (!confirm("Delete the stored clip? Incident metadata stays.")) return;
          await deleteClipAction({ incidentId });
        })
      }
    >
      <Trash2 className="size-4" />
      {disabled ? "Clip already deleted" : pending ? "Deleting…" : "Delete clip"}
    </Button>
  );
}
