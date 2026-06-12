"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrainCircuit, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/lib/format/relative-time";

/** Serializable mirror of AssistantMemory (repo module is server-only). */
export interface MemoryRow {
  id: string;
  assistant_id: string;
  memory_key: string;
  memory_value: unknown;
  confidence: number;
  last_updated_at: string;
  editable_by_user: boolean;
}

export function MemoryTab({ agentId, memories }: { agentId: string; memories: MemoryRow[] }) {
  const router = useRouter();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (memoryKey: string, rawValue: string, confidence?: number) => {
    setBusy(true);
    setError(null);
    try {
      let memoryValue: unknown;
      try {
        memoryValue = JSON.parse(rawValue);
      } catch {
        memoryValue = rawValue; // plain strings are fine
      }
      const res = await fetch(`/api/agents/${agentId}/memory`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memoryKey, memoryValue, confidence }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "save failed");
      setEditingKey(null);
      setAdding(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (memoryKey: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/memory`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memoryKey }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "delete failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      {memories.length === 0 && !adding && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border-subtle)] py-12 text-center">
          <BrainCircuit className="h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} />
          <p className="text-sm font-medium text-[var(--text-secondary)]">No learned preferences yet</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            Memories appear as agents learn from outcomes — or add one yourself.
          </p>
        </div>
      )}

      {memories.map((m) =>
        editingKey === m.memory_key ? (
          <MemoryEditor
            key={m.id}
            initialKey={m.memory_key}
            initialValue={JSON.stringify(m.memory_value, null, 2)}
            keyLocked
            busy={busy}
            onSave={(k, v) => save(k, v, m.confidence)}
            onCancel={() => setEditingKey(null)}
          />
        ) : (
          <div key={m.id} className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <code className="text-sm font-medium text-[var(--text-primary)]">{m.memory_key}</code>
                <span className="text-xs text-[var(--text-tertiary)]">
                  confidence {Math.round(m.confidence * 100)}%
                </span>
                <span className="text-xs text-[var(--text-tertiary)]" title={new Date(m.last_updated_at).toLocaleString()}>
                  · {relativeTime(m.last_updated_at)}
                </span>
              </div>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-[var(--text-secondary)]">
                {JSON.stringify(m.memory_value, null, 2)}
              </pre>
            </div>
            {m.editable_by_user && (
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditingKey(m.memory_key)} disabled={busy} aria-label="Edit">
                  <Pencil className="h-4 w-4" strokeWidth={1.5} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(m.memory_key)} disabled={busy} aria-label="Delete">
                  <Trash2 className="h-4 w-4 text-[var(--danger)]" strokeWidth={1.5} />
                </Button>
              </div>
            )}
          </div>
        ),
      )}

      {adding ? (
        <MemoryEditor
          initialKey=""
          initialValue=""
          keyLocked={false}
          busy={busy}
          onSave={(k, v) => save(k, v)}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-4 w-4" strokeWidth={1.5} /> Add memory
        </Button>
      )}
    </div>
  );
}

function MemoryEditor({
  initialKey,
  initialValue,
  keyLocked,
  busy,
  onSave,
  onCancel,
}: {
  initialKey: string;
  initialValue: string;
  keyLocked: boolean;
  busy: boolean;
  onSave: (key: string, value: string) => void;
  onCancel: () => void;
}) {
  const [key, setKey] = useState(initialKey);
  const [value, setValue] = useState(initialValue);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--accent)] p-3">
      <Input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="memory_key (snake_case)"
        disabled={keyLocked}
        className="font-mono text-sm"
      />
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder='Value — JSON ({"band": "proven"}) or plain text'
        rows={4}
        className="font-mono text-xs"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(key.trim(), value)} disabled={busy || !key.trim() || !value.trim()}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          <X className="mr-1 h-4 w-4" strokeWidth={1.5} /> Cancel
        </Button>
      </div>
    </div>
  );
}
