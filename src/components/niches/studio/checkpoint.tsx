"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { StudioStatus } from "@/components/niches/studio/studio-cockpit";

function planField(plan: Record<string, unknown> | null, path: string[]): string {
  let cur: unknown = plan;
  for (const k of path) cur = (cur as Record<string, unknown> | null)?.[k];
  return typeof cur === "string" || typeof cur === "number" ? String(cur) : "—";
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="origin-center motion-safe:animate-spin"
        style={{ animationDuration: "0.7s" }}
      />
    </svg>
  );
}

interface MetaProps {
  label: string;
  value: string;
  suffix?: string;
}

function Meta({ label, value, suffix }: MetaProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">{label}</span>
      <span className="truncate font-mono text-xs text-[var(--text-primary)]" title={value}>
        {value}
        {suffix ? <span className="text-[var(--text-tertiary)]"> {suffix}</span> : null}
      </span>
    </div>
  );
}

export function Checkpoint({
  draftId,
  status,
  onApproved,
}: {
  draftId: string;
  status: StudioStatus;
  onApproved: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const plan = status.draft.plan;
  const chapters = (plan?.chapters as Array<{ title?: string; beats?: unknown[] }> | undefined) ?? [];
  const beatCount = chapters.reduce((n, c) => n + (Array.isArray(c.beats) ? c.beats.length : 0), 0);
  const chapterTitles = chapters.map((c) => (typeof c.title === "string" ? c.title : "Untitled"));

  const approve = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/niches/studio/${draftId}/approve`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        toast.success("Rendering started");
        onApproved();
      } else {
        toast.error(body.error ?? `Approve failed (${res.status})`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 border-b pb-4">
        <span className="flex size-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Ready to render
        </p>
        <span className="ml-auto text-[11px] text-[var(--text-tertiary)]">Review before any credits burn</span>
      </CardHeader>

      <CardContent className="space-y-6 pt-1">
        {/* Hook — the headline */}
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">Hook</p>
          <p className="text-balance text-lg font-medium leading-snug text-[var(--text-primary)]">
            {planField(plan, ["hook"])}
          </p>
        </div>

        {/* Script chapters — scannable */}
        {chapterTitles.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
              Script · {chapterTitles.length} {chapterTitles.length === 1 ? "chapter" : "chapters"}
            </p>
            <ol className="space-y-1">
              {chapterTitles.map((t, i) => (
                <li key={i} className="flex items-baseline gap-2.5 text-sm text-[var(--text-secondary)]">
                  <span className="w-4 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                    {i + 1}
                  </span>
                  <span className="leading-snug">{t}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Production metadata — refined mono grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/40 p-4 sm:grid-cols-4">
          <Meta label="Style" value={planField(plan, ["presetId"])} />
          <Meta label="Model" value={planField(plan, ["styleBible", "model"])} />
          <Meta label="Beats" value={String(beatCount)} suffix="images" />
          <Meta label="Voice" value={planField(plan, ["voice", "provider"])} />
        </div>

        {/* Cost reassurance callout */}
        {status.estimate && (
          <div className="flex items-center gap-3 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-muted)] px-4 py-3">
            <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5v5l3 1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm text-[var(--text-secondary)]">
              Estimated cost:{" "}
              <span className="font-mono font-medium text-[var(--text-primary)]">
                ~{status.estimate.credits} credits
              </span>{" "}
              ·{" "}
              <span className="font-mono font-medium text-[var(--text-primary)]">
                ~{status.estimate.minutes} min
              </span>{" "}
              to render.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button onClick={approve} disabled={submitting} size="lg">
            {submitting && <Spinner />}
            {submitting ? "Starting…" : "Approve & render"}
          </Button>
          {status.draft.sourceNicheClusterId && (
            <Button
              variant="outline"
              size="lg"
              disabled={submitting}
              onClick={() => router.push(`/niches/studio?cluster=${status.draft.sourceNicheClusterId}`)}
            >
              Regenerate plan
            </Button>
          )}
          <Button variant="ghost" size="lg" disabled={submitting} onClick={() => router.push("/niches")}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
