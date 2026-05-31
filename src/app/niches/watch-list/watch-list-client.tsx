"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, Plus, Search, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { WatchedChannel } from "@/lib/supabase/repositories/watched-channels";
import { cn } from "@/lib/utils";
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function compactNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${n}`;
}

function signedCompact(n: number | null): string {
  if (n === null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${compactNumber(n)}`;
}

function channelName(c: WatchedChannel): string {
  return c.channel_title ?? c.channel_handle ?? c.channel_id;
}

function GrowthGlyph({ value }: { value: number | null }) {
  if (value === null || value === 0)
    return <Minus className="h-3 w-3 text-[var(--text-tertiary)]" strokeWidth={2} aria-hidden />;
  if (value > 0)
    return <TrendingUp className="h-3 w-3 text-emerald-500" strokeWidth={2} aria-hidden />;
  return <TrendingDown className="h-3 w-3 text-rose-500" strokeWidth={2} aria-hidden />;
}

type SortKey = "growth" | "cadence";

// ─── Add-channel modal ───────────────────────────────────────────────────────

function AddChannelDialog({
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
      const res = await fetch("/api/watch-list/channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urlOrHandle }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        toast.success("Channel added to watch-list");
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
          <DialogTitle>Add a channel</DialogTitle>
          <DialogDescription>
            Paste a YouTube channel URL or @handle to start tracking its growth.
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
            {pending ? "Adding…" : "Add channel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail stat ─────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg tabular-nums text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

// ─── Detail pane ─────────────────────────────────────────────────────────────

function ChannelDetail({ channel }: { channel: WatchedChannel }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        {channel.channel_thumbnail_url ? (
          <img
            src={channel.channel_thumbnail_url}
            alt=""
            aria-hidden
            className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-[var(--border-subtle)]"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-tertiary)]">
            <Eye className="h-6 w-6" strokeWidth={1.5} />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-[var(--text-primary)]">
            {channelName(channel)}
          </h2>
          {channel.channel_handle && (
            <p className="truncate font-mono text-xs text-[var(--text-tertiary)]">
              {channel.channel_handle}
            </p>
          )}
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            {compactNumber(channel.current_subscriber_count)} subscribers
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Growth 30d"
          value={
            <span className="inline-flex items-center gap-1">
              <GrowthGlyph value={channel.subscriber_growth_30d} />
              {signedCompact(channel.subscriber_growth_30d)}
            </span>
          }
        />
        <Stat
          label="Growth 90d"
          value={
            <span className="inline-flex items-center gap-1">
              <GrowthGlyph value={channel.subscriber_growth_90d} />
              {signedCompact(channel.subscriber_growth_90d)}
            </span>
          }
        />
        <Stat
          label="Cadence /wk"
          value={channel.upload_cadence_per_week !== null ? channel.upload_cadence_per_week.toFixed(1) : "—"}
        />
        <Stat
          label="Outlier rate 60d"
          value={
            channel.outlier_rate_60d !== null
              ? `${(channel.outlier_rate_60d * 100).toFixed(0)}%`
              : "—"
          }
        />
        <Stat label="Subs at add" value={compactNumber(channel.subscriber_count_at_add)} />
        <Stat
          label="Source"
          value={<span className="text-sm">{channel.discovery_source.replace(/_/g, " ")}</span>}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Recent videos</h3>
        <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)]/40 px-6 py-10 text-center">
          <p className="text-sm text-[var(--text-secondary)]">No recent videos tracked yet.</p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Per-video history will appear here once the next watch-list sync runs.
          </p>
        </div>
      </div>

      <p className="font-mono text-[11px] text-[var(--text-tertiary)]">
        Added {new Date(channel.added_at).toLocaleDateString()}
        {channel.last_snapshotted_at
          ? ` · last synced ${new Date(channel.last_snapshotted_at).toLocaleDateString()}`
          : " · never synced"}
      </p>
    </div>
  );
}

// ─── Client root ─────────────────────────────────────────────────────────────

export function WatchListClient({ channels }: { channels: WatchedChannel[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("growth");
  const [selectedId, setSelectedId] = useState<string | null>(channels[0]?.channel_id ?? null);
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = channels.filter((c) => {
      if (!q) return true;
      return (
        (c.channel_handle ?? "").toLowerCase().includes(q) ||
        (c.channel_title ?? "").toLowerCase().includes(q)
      );
    });
    return [...matched].sort((a, b) => {
      if (sort === "growth") return (b.subscriber_growth_30d ?? -Infinity) - (a.subscriber_growth_30d ?? -Infinity);
      return (b.upload_cadence_per_week ?? -Infinity) - (a.upload_cadence_per_week ?? -Infinity);
    });
  }, [channels, query, sort]);

  const selected = channels.find((c) => c.channel_id === selectedId) ?? filtered[0] ?? null;

  if (channels.length === 0) {
    return (
      <>
        <EmptyState
          icon={Eye}
          title="No channels on your watch-list"
          description="Track creators you want to learn from — we'll surface subscriber growth, upload cadence, and breakout signal."
          action={{ label: "Add your first channel", onClick: () => setAddOpen(true) }}
        />
        <AddChannelDialog open={addOpen} onOpenChange={setAddOpen} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Left: filterable list */}
      <div className="w-full shrink-0 lg:w-[320px]">
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter channels…"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <Button size="icon" variant="outline" aria-label="Add channel" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="mb-2 flex items-center gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
            Sort
          </span>
          {(["growth", "cadence"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={cn(
                "rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                sort === k
                  ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
              )}
            >
              {k}
            </button>
          ))}
        </div>

        <div className="flex max-h-[68vh] flex-col gap-1 overflow-y-auto pr-1">
          {filtered.map((c) => {
            const active = c.channel_id === selected?.channel_id;
            return (
              <button
                key={c.channel_id}
                onClick={() => setSelectedId(c.channel_id)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  active
                    ? "border-[var(--accent)]/40 bg-[var(--accent-muted)]"
                    : "border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--surface-1)]",
                )}
              >
                {c.channel_thumbnail_url ? (
                  <img
                    src={c.channel_thumbnail_url}
                    alt=""
                    aria-hidden
                    className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-[var(--border-subtle)]"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-tertiary)]">
                    <Eye className="h-4 w-4" strokeWidth={1.5} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {channelName(c)}
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
                    <span>{compactNumber(c.current_subscriber_count)}</span>
                    <span className="inline-flex items-center gap-0.5">
                      <GrowthGlyph value={c.subscriber_growth_30d} />
                      {signedCompact(c.subscriber_growth_30d)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-[var(--text-tertiary)]">
              No channels match “{query}”.
            </p>
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div className="min-w-0 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/40 p-6">
        {selected ? (
          <ChannelDetail channel={selected} />
        ) : (
          <p className="text-sm text-[var(--text-tertiary)]">Select a channel to see its detail.</p>
        )}
      </div>

      <AddChannelDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
