"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioStatus } from "@/components/niches/studio/studio-cockpit";

export function DonePanel({ status }: { status: StudioStatus }) {
  const router = useRouter();
  const url = status.draft.renderArtifactUrl;
  const duration = status.draft.durationSeconds;

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        {/* Done badge + duration caption */}
        <div className="flex items-center gap-2">
          <span
            className="flex size-5 items-center justify-center rounded-full bg-[var(--success)]/15"
            aria-hidden
          >
            <svg viewBox="0 0 24 24" className="size-3 text-[var(--success)]" fill="none" stroke="currentColor" strokeWidth={3}>
              <path d="M5 12.5l4 4L19 6.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Done
            {typeof duration === "number" && (
              <span className="ml-1.5 font-mono font-normal text-[var(--text-tertiary)]">· {duration}s</span>
            )}
          </p>
        </div>

        {/* The finished video — the hero */}
        {url ? (
          <video
            src={url}
            controls
            playsInline
            className="aspect-video w-full rounded-lg bg-black shadow-[var(--elev-2)]"
          />
        ) : (
          <p className="rounded-lg border border-[var(--danger)]/25 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
            Render finished but no video URL was recorded.
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {url && (
            <Button render={<a href={url} download />}>Download</Button>
          )}
          <Button variant="outline" onClick={() => router.push("/lab")}>
            Open in Lab
          </Button>
          <Button variant="ghost" onClick={() => router.push("/niches")}>
            Generate another
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
