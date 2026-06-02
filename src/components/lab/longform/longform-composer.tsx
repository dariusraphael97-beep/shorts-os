"use client";
import { useState } from "react";
import { Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const DURATIONS = [
  { label: "8 min", value: 480 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 },
  { label: "20 min", value: 1200 },
];

export function LongformComposer({ channelId }: { channelId: string }) {
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState(600);
  const [busy, setBusy] = useState(false);

  function generate() {
    const t = topic.trim();
    if (!t || busy) return;
    setBusy(true);
    window.dispatchEvent(new CustomEvent("lab:longform-dispatch-start", { detail: { topic: t, targetDurationSeconds: duration, channelId } }));
    // run pane drives the rest; re-enable shortly so the operator can queue another.
    setTimeout(() => setBusy(false), 1500);
  }

  return (
    <section className="rounded-xl border border-subtle bg-surface p-6 shadow-[var(--elev-2)]">
      <div className="flex items-center gap-2 text-text-primary">
        <Clapperboard className="h-5 w-5 text-accent-electric" strokeWidth={1.5} />
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-subtle bg-elevated p-1">
          {DURATIONS.map((d) => (
            <button
              key={d.value}
              onClick={() => setDuration(d.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${duration === d.value ? "bg-surface text-text-primary shadow-[var(--elev-1)]" : "text-text-muted hover:text-text-primary"}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <Button onClick={generate} disabled={!topic.trim() || busy}>
          {busy ? "Dispatching…" : "Generate"}
        </Button>
      </div>
    </section>
  );
}
