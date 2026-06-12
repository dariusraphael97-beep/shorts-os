"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface ChapterMarker { index: number; title: string; startSeconds: number; timestamp: string }
interface DraftPlan { angle?: string; hook?: string; presetId?: string; chapters?: { beats?: unknown[] }[] }
interface Draft {
  id: string; title: string; status: string;
  render_artifact_url: string | null; duration_seconds: number | null;
  longform_plan: DraftPlan | null; chapter_markers: ChapterMarker[] | null;
}

export function LongformReview({ draft }: { draft: Draft }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const plan = draft.longform_plan ?? {};
  const markers = draft.chapter_markers ?? [];
  const beatCount = (plan.chapters ?? []).reduce((s, c) => s + (c.beats?.length ?? 0), 0);

  function seek(sec: number) { if (videoRef.current) { videoRef.current.currentTime = sec; videoRef.current.play().catch(() => {}); } }
  function copyChapters() {
    const text = markers.map((m) => `${m.timestamp} ${m.title}`).join("\n");
    navigator.clipboard.writeText(text).then(() => toast.success("Chapter timestamps copied")).catch(() => toast.error("Copy failed"));
  }

  return (
    <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
      <header className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-text-primary">{draft.title}</h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Badge variant="secondary">{plan.presetId ?? "—"}</Badge>
            <span>{beatCount} beats</span>
            {draft.duration_seconds ? <span>· {Math.round(draft.duration_seconds / 60)} min</span> : null}
            <span>· {draft.status}</span>
          </div>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="text-xs text-[var(--accent-electric)] hover:underline">{open ? "Hide" : "Review"}</button>
      </header>

      {open && (
        <div className="grid gap-4 border-t border-[var(--border-subtle)] p-4 md:grid-cols-[2fr_1fr]">
          <div>
            {draft.render_artifact_url ? (
              <video ref={videoRef} src={draft.render_artifact_url} controls playsInline className="w-full rounded-lg border border-[var(--border-subtle)] bg-black" style={{ aspectRatio: "16 / 9" }} />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] text-sm text-[var(--text-muted)]">
                {draft.status === "rendering" ? "Rendering…" : "Not rendered yet"}
              </div>
            )}
            {plan.hook && <p className="mt-3 text-sm text-text-secondary"><span className="text-[var(--text-muted)]">Hook: </span>{plan.hook}</p>}
          </div>
          <aside className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Chapters</h4>
              {markers.length > 0 && <button onClick={copyChapters} className="text-[11px] text-[var(--accent-electric)] hover:underline">Copy</button>}
            </div>
            {markers.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No markers yet.</p>
            ) : (
              <ul className="space-y-1">
                {markers.map((m) => (
                  <li key={m.index}>
                    <button onClick={() => seek(m.startSeconds)} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-text-secondary hover:bg-[var(--bg-elevated)]">
                      <span className="font-mono text-[var(--text-muted)]">{m.timestamp}</span>
                      <span className="truncate">{m.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </article>
  );
}
