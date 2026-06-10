"use client";
import { useId, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Clapperboard, Sparkles, Film, Newspaper, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const DURATIONS: SegmentOption<number>[] = [
  { value: 480, label: "8 min" },
  { value: 600, label: "10 min" },
  { value: 900, label: "15 min" },
  { value: 1200, label: "20 min" },
];

// "auto" lets the Style-picker LLM choose; the rest force a preset (validated against PRESET_IDS server-side).
type StyleValue = "auto" | "cinematic-realistic" | "editorial-graphic" | "stick-figure-animated";
const STYLES: SegmentOption<StyleValue>[] = [
  { value: "auto", label: "Auto", icon: <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />, hint: "Let the Style-picker choose the best look for the topic" },
  { value: "cinematic-realistic", label: "Cinematic", icon: <Film className="h-3.5 w-3.5" strokeWidth={1.75} />, hint: "Photoreal teal/amber documentary" },
  { value: "editorial-graphic", label: "Editorial", icon: <Newspaper className="h-3.5 w-3.5" strokeWidth={1.75} />, hint: "Bold flat editorial illustration" },
  { value: "stick-figure-animated", label: "Stick figure", icon: <PencilLine className="h-3.5 w-3.5" strokeWidth={1.75} />, hint: "Crude hand-drawn doodles — the Zenn look" },
];

export function LongformComposer({ channelId }: { channelId: string }) {
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState(600);
  const [style, setStyle] = useState<StyleValue>("auto");
  const [busy, setBusy] = useState(false);

  function generate() {
    const t = topic.trim();
    if (!t || busy) return;
    setBusy(true);
    window.dispatchEvent(
      new CustomEvent("lab:longform-dispatch-start", {
        detail: { topic: t, targetDurationSeconds: duration, channelId, presetId: style === "auto" ? undefined : style },
      }),
    );
    // run pane drives the rest; re-enable shortly so the operator can queue another.
    setTimeout(() => setBusy(false), 1500);
  }

  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-[var(--elev-2)]">
      <div className="flex items-center gap-2 text-text-primary">
        <Clapperboard className="h-5 w-5 text-[var(--accent-electric)]" strokeWidth={1.5} />
        <h2 className="text-lg font-semibold">New longform video</h2>
      </div>
      <p className="mt-1 text-sm text-text-secondary">Type a topic or title. The Writer, Style-picker, Beat-planner, and Voice take it from here.</p>

      <Textarea
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder={'e.g. "The IRS is hiding this from you"'}
        rows={2}
        className="mt-4 text-base resize-none"
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate(); }}
      />

      <div className="mt-5 space-y-4">
        <Field label="Style">
          <Segmented value={style} onChange={setStyle} options={STYLES} ariaLabel="Visual style" />
        </Field>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Field label="Length">
            <Segmented value={duration} onChange={setDuration} options={DURATIONS} ariaLabel="Video length" />
          </Field>
          <Button onClick={generate} disabled={!topic.trim() || busy}>
            {busy ? "Dispatching…" : "Generate"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      {children}
    </div>
  );
}

interface SegmentOption<T> {
  value: T;
  label: string;
  icon?: ReactNode;
  hint?: string;
}

function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
  ariaLabel: string;
}) {
  const groupId = useId();
  const reduce = useReducedMotion();
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={`relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
              active ? "text-text-primary" : "text-[var(--text-muted)] hover:text-text-primary"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-active-${groupId}`}
                className="absolute inset-0 rounded-md bg-[var(--bg-surface)] shadow-[var(--elev-1)]"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
