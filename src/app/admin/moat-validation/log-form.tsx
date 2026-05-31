"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FORMAT_LABELS } from "@/lib/classifier/taxonomy";
import type { FormatLabel } from "@/lib/supabase/repositories/shorts-classifications";
import { toast } from "sonner";

function fmtFormat(label: string): string {
  return label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const EXTERNAL_FIELDS = [
  { id: "firstSurfacedByVidiqAt", label: "VidIQ" },
  { id: "firstSurfacedBy1of10At", label: "1of10" },
  { id: "firstSurfacedByExplodingTopicsAt", label: "Exploding Topics" },
] as const;

export function LogForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<FormatLabel>("talking_head_facts");
  const [shortsOsAt, setShortsOsAt] = useState("");
  const [externals, setExternals] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/admin/vidiq-appearances", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          canonicalTopic: topic,
          formatLabel: format,
          firstSurfacedByShortsOsAt: shortsOsAt,
          firstSurfacedByVidiqAt: externals.firstSurfacedByVidiqAt || null,
          firstSurfacedBy1of10At: externals.firstSurfacedBy1of10At || null,
          firstSurfacedByExplodingTopicsAt: externals.firstSurfacedByExplodingTopicsAt || null,
          notes: notes || null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? `Request failed (${res.status})`);
        return;
      }
      toast.success(`Logged "${topic}"`);
      setTopic("");
      setFormat("talking_head_facts");
      setShortsOsAt("");
      setExternals({});
      setNotes("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mv-topic">
            Topic <span className="text-[var(--danger,#ef4444)]">*</span>
          </Label>
          <Input
            id="mv-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. ai coding agents"
            required
            disabled={pending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mv-format">Format</Label>
          <Select value={format} onValueChange={(v) => setFormat(v as FormatLabel)}>
            <SelectTrigger id="mv-format" className="w-full" disabled={pending}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMAT_LABELS.map((label) => (
                <SelectItem key={label} value={label}>
                  {fmtFormat(label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mv-shorts-os">
          We surfaced it on <span className="text-[var(--danger,#ef4444)]">*</span>
        </Label>
        <Input
          id="mv-shorts-os"
          type="date"
          value={shortsOsAt}
          onChange={(e) => setShortsOsAt(e.target.value)}
          required
          disabled={pending}
          className="sm:w-56"
        />
        <p className="text-xs text-[var(--text-tertiary)]">
          The date Shorts OS first surfaced this niche.
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-[var(--text-secondary)]">
          External tools surfaced it on{" "}
          <span className="font-normal text-[var(--text-tertiary)]">(optional — leave blank if not seen yet)</span>
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          {EXTERNAL_FIELDS.map((f) => (
            <div key={f.id} className="space-y-1.5">
              <Label htmlFor={`mv-${f.id}`} className="text-[var(--text-tertiary)]">
                {f.label}
              </Label>
              <Input
                id={`mv-${f.id}`}
                type="date"
                value={externals[f.id] ?? ""}
                onChange={(e) =>
                  setExternals((prev) => ({ ...prev, [f.id]: e.target.value }))
                }
                disabled={pending}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="mv-notes" className="text-[var(--text-tertiary)]">
          Notes <span className="font-normal">(optional)</span>
        </Label>
        <Textarea
          id="mv-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Where you saw it surface elsewhere, signal strength, etc."
          disabled={pending}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--danger,#ef4444)]">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || !topic || !shortsOsAt}>
          {pending ? "Logging…" : "Log appearance"}
        </Button>
        <span className="text-xs text-[var(--text-tertiary)]">
          Lead time is computed against the earliest external date.
        </span>
      </div>
    </form>
  );
}
