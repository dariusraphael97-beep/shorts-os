"use client";
// src/components/clips/candidate-card.tsx
//
// Per-draft card: title, accent highlight, 5 clip thumbnails in order, music
// preview, Approve / Reject / Edit buttons. All API calls + payloads preserved.

import { useState, type ReactNode } from "react";
import { CheckCircle, XCircle, Pencil, Loader2, Music2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { fadeRise } from "@/lib/motion";
import { HoverLift } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CompilationDraftRow } from "@/lib/supabase/repositories/compilation-drafts";
import { EditDrawer } from "@/components/clips/edit-drawer";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClipLite {
  id: string;
  local_path: string;
  description: string | null;
  duration_seconds: number;
}

interface MusicLite {
  id: string;
  title: string;
  local_path: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function highlightAccent(title: string, accent: string): ReactNode {
  const idx = title.toLowerCase().indexOf(accent.toLowerCase());
  if (idx < 0) return title;
  return (
    <>
      {title.slice(0, idx)}
      <span className="underline decoration-[var(--accent)] decoration-2 underline-offset-2">
        {title.slice(idx, idx + accent.length)}
      </span>
      {title.slice(idx + accent.length)}
    </>
  );
}

// ─── CandidateCard ────────────────────────────────────────────────────────────

interface CandidateCardProps {
  draft: CompilationDraftRow;
  clipMap: Record<string, ClipLite>;
  musicMap: Record<string, MusicLite>;
  index?: number;
}

export function CandidateCard({
  draft,
  clipMap,
  musicMap,
  index = 0,
}: CandidateCardProps) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const music = draft.music_track_id ? musicMap[draft.music_track_id] : null;
  const sortedRefs = [...draft.clip_refs].sort((a, b) => a.order - b.order);
  const totalDuration = sortedRefs.reduce(
    (a, r) => a + (r.end_sec - r.start_sec),
    0,
  );

  // ── Mutation (preserving original endpoints/payloads) ─────────────────────

  async function post(path: string) {
    setBusy(true);
    try {
      const res = await fetch(path, { method: "POST" });
      if (!res.ok) {
        const text = await res.text().catch(() => String(res.status));
        toast.error(`Action failed: ${text}`);
        return;
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const motionProps = prefersReducedMotion
    ? {}
    : {
        variants: fadeRise,
        initial: "initial" as const,
        animate: "animate" as const,
        transition: {
          delay: Math.min(index * 0.05, 0.3),
          duration: 0.32,
          ease: [0, 0, 0.2, 1] as [number, number, number, number],
        },
      };

  return (
    <>
      <motion.div {...motionProps}>
        <HoverLift>
          <article
            className={cn(
              "rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]",
              "overflow-hidden flex flex-col gap-0",
            )}
          >
            {/* Card header */}
            <div className="px-4 pt-4 pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] leading-snug">
                {highlightAccent(draft.title_template, draft.accent_word)}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {/* Layout pill */}
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5",
                    "font-mono text-[10px] uppercase tracking-wider",
                    "border-[var(--accent)]/30 bg-[var(--accent-muted)] text-[var(--accent)]",
                  )}
                >
                  {draft.layout_variant}
                </span>
                {/* Reveal pattern pill */}
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5",
                    "font-mono text-[10px] uppercase tracking-wider",
                    "border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-tertiary)]",
                  )}
                >
                  {draft.reveal_pattern}
                </span>
                {/* Total duration */}
                <span className="font-mono text-[11px] text-[var(--text-tertiary)] tabular-nums ml-auto">
                  {totalDuration.toFixed(1)}s total
                </span>
              </div>
            </div>

            {/* Clip thumbnails strip */}
            <div className="px-4 py-3">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">
                Clips ({sortedRefs.length})
              </p>
              <ol className="grid grid-cols-5 gap-2">
                {sortedRefs.map((r) => {
                  const c = clipMap[r.clip_id];
                  return (
                    <li key={r.clip_id} className="flex flex-col gap-1">
                      <div
                        className="relative rounded-lg overflow-hidden bg-black border border-[var(--border-subtle)]"
                        style={{ aspectRatio: "9 / 16" }}
                      >
                        {c ? (
                          <video
                            src={c.local_path}
                            className="absolute inset-0 h-full w-full object-cover"
                            muted
                            preload="metadata"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)] text-xs">
                            ?
                          </div>
                        )}
                        {/* Order badge */}
                        <span
                          aria-hidden
                          className={cn(
                            "absolute top-1 left-1 h-4 w-4 rounded-full",
                            "flex items-center justify-center",
                            "bg-black/70 backdrop-blur-sm",
                            "font-mono text-[9px] text-white tabular-nums",
                          )}
                        >
                          {r.order}
                        </span>
                      </div>
                      <p
                        className="text-[10px] text-[var(--text-secondary)] truncate"
                        title={r.label}
                      >
                        {r.label}
                      </p>
                      <p className="font-mono text-[10px] text-[var(--text-tertiary)] tabular-nums">
                        {(r.end_sec - r.start_sec).toFixed(1)}s
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Music row */}
            {music && (
              <div className="px-4 pb-3 border-t border-[var(--border-subtle)] pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <Music2 className="h-3 w-3 text-[var(--text-tertiary)]" aria-hidden />
                  <span className="text-xs text-[var(--text-secondary)]">{music.title}</span>
                </div>
                <audio src={music.local_path} controls className="w-full h-8" />
              </div>
            )}

            {/* Action row */}
            <div
              className={cn(
                "flex items-center gap-2 px-4 py-3",
                "border-t border-[var(--border-subtle)] bg-[var(--surface-2)]/40",
              )}
            >
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  post(`/api/clips/candidates/${draft.id}/approve`)
                }
                className="h-7 gap-1.5 px-3 text-[11px]"
                aria-label="Approve this compilation"
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle className="h-3 w-3" aria-hidden />
                )}
                Approve
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setEditing(true)}
                className="h-7 gap-1.5 px-3 text-[11px]"
                aria-label="Edit this compilation"
              >
                <Pencil className="h-3 w-3" aria-hidden />
                Edit
              </Button>

              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => post(`/api/clips/candidates/${draft.id}/reject`)}
                className={cn(
                  "ml-auto h-7 gap-1.5 px-3 text-[11px]",
                  "text-[var(--text-tertiary)] hover:text-[var(--danger)]",
                )}
                aria-label="Reject this compilation"
              >
                <XCircle className="h-3 w-3" aria-hidden />
                Reject
              </Button>
            </div>
          </article>
        </HoverLift>
      </motion.div>

      {editing && (
        <EditDrawer
          draft={draft}
          clipMap={clipMap}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
