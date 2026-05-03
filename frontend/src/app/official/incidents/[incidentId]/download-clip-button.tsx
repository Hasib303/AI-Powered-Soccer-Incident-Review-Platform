"use client";

import { useTransition } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getClipDownloadUrlAction } from "@/lib/actions/incidents";

export function DownloadClipButton({ incidentId }: { incidentId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await getClipDownloadUrlAction({ incidentId });
          if (!result.ok) {
            alert(result.message);
            return;
          }
          // Use a hidden link so the browser respects the download filename
          // even on cross-origin signed URLs that don't set Content-Disposition.
          const a = document.createElement("a");
          a.href = result.url;
          a.download = result.filename;
          a.rel = "noopener";
          document.body.appendChild(a);
          a.click();
          a.remove();
        })
      }
    >
      <Download className="size-4" />
      {pending ? "Preparing…" : "Download clip"}
    </Button>
  );
}
