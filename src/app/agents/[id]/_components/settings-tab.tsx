"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  fieldsFor,
  MODEL_OPTIONS,
  DEFAULT_MODEL_LABEL,
  type FieldDescriptor,
} from "./settings-fields";

type SettingsValue = string | number;

export function SettingsTab({ assistantId }: { assistantId: string }) {
  const fields = useMemo(() => fieldsFor(assistantId), [assistantId]);

  const [values, setValues] = useState<Record<string, SettingsValue>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/agents/${assistantId}/settings`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { ok: boolean; settings?: Record<string, unknown> };
        if (mounted.current && json.ok && json.settings) {
          const next: Record<string, SettingsValue> = {};
          for (const [k, v] of Object.entries(json.settings)) {
            if (typeof v === "string" || typeof v === "number") next[k] = v;
          }
          setValues(next);
        }
      } catch {
        // keep defaults
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [assistantId]);

  function setField(key: string, value: SettingsValue) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    // Assemble only the fields that belong to this assistant + are set.
    const payload: Record<string, SettingsValue> = {};
    for (const f of fields) {
      const v = values[f.key];
      if (v !== undefined && v !== "") payload[f.key] = v;
    }

    try {
      const res = await fetch(`/api/agents/${assistantId}/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not save settings.");
        return;
      }
      setSaved(true);
    } catch {
      setError("Network error — could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)] px-6 py-16 text-center">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: "var(--surface-2)", color: "var(--text-tertiary)" }}
          aria-hidden
        >
          <SlidersHorizontal className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--text-secondary)]">No settings</p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            This agent has no configurable settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
        {fields.map((f) => (
          <FieldRow key={f.key} field={f} value={values[f.key]} onChange={setField} />
        ))}
      </div>

      <div className="flex items-center justify-end gap-3">
        {error && (
          <p className="mr-auto text-xs text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--success)]">
            <Check className="size-3.5" /> Settings saved
          </span>
        )}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: FieldDescriptor;
  value: SettingsValue | undefined;
  onChange: (key: string, value: SettingsValue) => void;
}) {
  return (
    <div className="grid gap-2 border-b border-[var(--border-subtle)] pb-5 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <Label className="text-[13px] text-[var(--text-primary)]">{field.label}</Label>
        {field.help && (
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{field.help}</p>
        )}
      </div>
      <div className="sm:justify-self-end sm:w-full">
        <FieldControl field={field} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FieldDescriptor;
  value: SettingsValue | undefined;
  onChange: (key: string, value: SettingsValue) => void;
}) {
  if (field.kind === "model") {
    const current = typeof value === "string" ? value : "";
    // Append an unknown stored value so it still shows.
    const options = current && !MODEL_OPTIONS.includes(current as (typeof MODEL_OPTIONS)[number])
      ? [...MODEL_OPTIONS, current]
      : [...MODEL_OPTIONS];
    return (
      <Select value={current} onValueChange={(v) => onChange(field.key, v as string)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={DEFAULT_MODEL_LABEL} />
        </SelectTrigger>
        <SelectContent>
          {options.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.kind === "ratio") {
    const num = typeof value === "number" ? value : 0.5;
    return (
      <div className="flex items-center gap-3">
        <Slider
          value={[num]}
          min={0}
          max={1}
          step={0.05}
          onValueChange={(v: number | readonly number[]) => {
            const next = Array.isArray(v) ? v[0] : v;
            if (typeof next === "number") onChange(field.key, Math.round(next * 100) / 100);
          }}
          className="flex-1"
        />
        <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">
          {num.toFixed(2)}
        </span>
      </div>
    );
  }

  // int
  const num = typeof value === "number" ? value : field.min;
  return (
    <Input
      type="number"
      min={field.min}
      step={1}
      value={num}
      onChange={(e) => {
        const n = Number.parseInt(e.target.value, 10);
        onChange(field.key, Number.isFinite(n) ? n : field.min);
      }}
      className="w-full"
    />
  );
}
