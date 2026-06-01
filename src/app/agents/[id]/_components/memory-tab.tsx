"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "../../_components/agent-presentation";

interface MemoryRow {
  id: string;
  assistant_id: string;
  memory_key: string;
  memory_value: unknown;
  confidence: number;
  last_updated_at: string;
  editable_by_user: boolean;
}

export function MemoryTab({ assistantId }: { assistantId: string }) {
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${assistantId}/memory`, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { ok: boolean; memory?: MemoryRow[] };
      if (mounted.current && json.ok && json.memory) setRows(json.memory);
    } catch {
      // keep last good state
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [assistantId]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyMemory />;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <MemoryCard key={row.id} assistantId={assistantId} row={row} onChanged={load} />
      ))}
    </div>
  );
}

function MemoryCard({
  assistantId,
  row,
  onChanged,
}: {
  assistantId: string;
  row: MemoryRow;
  onChanged: () => Promise<void>;
}) {
  const [value, setValue] = useState(() => prettyJson(row.memory_value));
  const [confidence, setConfidence] = useState(row.confidence);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savedAt, setSavedAt] = useState(false);

  async function handleSave() {
    setError(null);
    setSavedAt(false);

    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      setError("Invalid JSON — fix the syntax before saving.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${assistantId}/memory`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memoryKey: row.memory_key,
          memoryValue: parsed,
          confidence,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not save this memory.");
        return;
      }
      setSavedAt(true);
      await onChanged();
    } catch {
      setError("Network error — could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/agents/${assistantId}/memory?rowId=${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      await onChanged();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <code className="text-[13px] font-medium text-[var(--text-primary)]">
            {row.memory_key}
          </code>
          <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
            Updated {relativeTime(row.last_updated_at)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleDelete}
          disabled={deleting || saving}
          aria-label={`Delete memory ${row.memory_key}`}
          className="text-[var(--text-tertiary)] hover:text-[var(--danger)]"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="mt-3 space-y-1.5">
        <Label className="text-xs text-[var(--text-tertiary)]">Value (JSON)</Label>
        <Textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
            setSavedAt(false);
          }}
          spellCheck={false}
          className="min-h-24 font-mono text-[12px] leading-relaxed"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`conf-${row.id}`} className="text-xs text-[var(--text-tertiary)]">
            Confidence (0–1)
          </Label>
          <Input
            id={`conf-${row.id}`}
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={confidence}
            onChange={(e) => {
              const n = Number.parseFloat(e.target.value);
              setConfidence(Number.isFinite(n) ? n : 0);
              setSavedAt(false);
            }}
            className="w-28"
          />
        </div>

        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--success)]">
              <Check className="size-3.5" /> Saved
            </span>
          )}
          <Button onClick={handleSave} disabled={saving || deleting} size="sm">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function EmptyMemory() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)] px-6 py-16 text-center">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg"
        style={{ backgroundColor: "var(--surface-2)", color: "var(--text-tertiary)" }}
        aria-hidden
      >
        <Brain className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--text-secondary)]">No learned memory yet</p>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          This agent hasn&apos;t recorded anything it&apos;s learned.
        </p>
      </div>
    </div>
  );
}
