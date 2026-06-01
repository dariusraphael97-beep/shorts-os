"use client";
// src/components/clips/ingest-url-input.tsx
//
// Single-input form for the operator to drop a URL into the ingest queue
// without waiting for the cron. POSTs to /api/clips/ingest-url (preserved).

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function IngestUrlInput() {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/clips/ingest-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      toast.success(`Enqueued (job ${(j as { jobId?: string }).jobId ?? "queued"})`);
      setUrl("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enqueue failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className={cn("flex items-center gap-2")}>
      <Input
        type="url"
        required
        placeholder="Ingest URL manually…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="h-8 w-72 text-sm"
        aria-label="URL to ingest"
      />
      <Button
        type="submit"
        size="sm"
        disabled={submitting || !url.trim()}
        className="h-8 gap-1.5 px-3 text-[11px]"
      >
        {submitting ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <Plus className="h-3 w-3" aria-hidden />
        )}
        Ingest
      </Button>
    </form>
  );
}
