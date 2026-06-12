"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CHAT_MODELS } from "@/lib/assistants/registry";

const MODEL_LABELS: Record<string, string> = {
  "claude-haiku-4-5": "Haiku 4.5 — fast & cheap",
  "claude-sonnet-4-6": "Sonnet 4.6 — balanced (default)",
  "claude-opus-4-7": "Opus 4.7 — deepest reasoning",
};

export function SettingsTab({
  agentId,
  isEnabled,
  chatModel,
  schedules,
}: {
  agentId: string;
  isEnabled: boolean;
  chatModel: string;
  schedules: { label: string; cron: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = async (body: { isEnabled?: boolean; chatModel?: string }) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "update failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex max-w-xl flex-col gap-6">
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <section className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] p-4">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Enabled</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            Disabled agents render dimmed and non-clickable on Mission Control.
          </p>
        </div>
        <Switch checked={isEnabled} onCheckedChange={(v: boolean) => patch({ isEnabled: v })} disabled={busy} />
      </section>

      <section className="rounded-lg border border-[var(--border-subtle)] p-4">
        <p className="text-sm font-medium text-[var(--text-primary)]">Chat model</p>
        <p className="mb-3 text-xs text-[var(--text-tertiary)]">Used by this agent's Chat tab.</p>
        <Select value={chatModel} onValueChange={(v: string | null) => { if (v) patch({ chatModel: v }); }} disabled={busy}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHAT_MODELS.map((m) => (
              <SelectItem key={m} value={m}>
                {MODEL_LABELS[m] ?? m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="rounded-lg border border-[var(--border-subtle)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.5} />
          <p className="text-sm font-medium text-[var(--text-primary)]">Schedules</p>
        </div>
        {schedules.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">Event-driven — no cron schedule.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {schedules.map((s) => (
              <li key={s.label} className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-secondary)]">{s.label}</span>
                <code className="font-mono text-xs text-[var(--text-tertiary)]">{s.cron} UTC</code>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          Read-only — schedules live in vercel.ts.
        </p>
      </section>
    </div>
  );
}
