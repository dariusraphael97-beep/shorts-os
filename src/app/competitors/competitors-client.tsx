"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Swords, Plus, Radar } from "lucide-react";
import type { CompetitorChannel } from "@/lib/supabase/repositories/competitor-channels";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/compositions/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function competitorName(c: CompetitorChannel): string {
  return c.channel_title ?? c.channel_handle ?? c.channel_id;
}

function AddCompetitorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    const urlOrHandle = value.trim();
    if (!urlOrHandle) return;
    setPending(true);
    try {
      const res = await fetch("/api/watch-list/competitors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urlOrHandle }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        toast.success("Competitor added");
        setValue("");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(body.error ?? `Failed (${res.status})`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[var(--surface-overlay)] border-[var(--border-subtle)]">
        <DialogHeader>
          <DialogTitle>Add a competitor</DialogTitle>
          <DialogDescription>
            Paste a YouTube channel URL or @handle to watch it for format and cadence shifts.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="https://youtube.com/@channel or @handle"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={pending || value.trim().length === 0}>
            {pending ? "Adding…" : "Add competitor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompetitorRow({ competitor }: { competitor: CompetitorChannel }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-[var(--text-primary)]">
            {competitorName(competitor)}
          </h3>
          {competitor.channel_handle && (
            <p className="truncate font-mono text-xs text-[var(--text-tertiary)]">
              {competitor.channel_handle}
            </p>
          )}
        </div>
        <a
          href={`https://www.youtube.com/channel/${competitor.channel_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 font-mono text-[11px] text-[var(--text-tertiary)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
        >
          open ↗
        </a>
      </div>

      {/* Recent uploads strip — no per-video data wired yet */}
      <div className="mt-4 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)]/30 px-4 py-6 text-center">
        <p className="text-xs text-[var(--text-secondary)]">No recent uploads tracked yet.</p>
      </div>

      {/* Pattern-change hint placeholder */}
      <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-[var(--text-tertiary)]">
        <Radar className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={1.75} aria-hidden />
        Watching for format &amp; cadence changes
      </div>
    </div>
  );
}

export function CompetitorsClient({ competitors }: { competitors: CompetitorChannel[] }) {
  const [addOpen, setAddOpen] = useState(false);

  if (competitors.length === 0) {
    return (
      <>
        <EmptyState
          icon={Swords}
          title="No competitors yet"
          description="Add the channels you're up against. We'll watch for shifts in their format, cadence, and breakout patterns."
          action={{ label: "Add a competitor", onClick: () => setAddOpen(true) }}
        />
        <AddCompetitorDialog open={addOpen} onOpenChange={setAddOpen} />
      </>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-end">
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Add competitor
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {competitors.map((c) => (
          <CompetitorRow key={c.channel_id} competitor={c} />
        ))}
      </div>

      <AddCompetitorDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
