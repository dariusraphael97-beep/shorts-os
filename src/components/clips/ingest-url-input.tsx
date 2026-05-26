"use client";
// src/components/clips/ingest-url-input.tsx
//
// Single-input form for the operator to drop a URL into the ingest queue
// without waiting for the cron. POSTs to /api/clips/ingest-url.
import { useState } from "react";

export function IngestUrlInput() {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/clips/ingest-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setMsg(`Enqueued (job ${j.jobId})`);
      setUrl("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "enqueue failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        type="url"
        required
        placeholder="Ingest URL manually"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="bg-surface-2 border border-border rounded px-3 py-1.5 text-sm w-80"
      />
      <button
        type="submit"
        disabled={submitting || !url}
        className="text-xs border border-border rounded px-3 py-1.5 hover:bg-surface-2 disabled:opacity-50"
      >
        {submitting ? "…" : "Ingest"}
      </button>
      {msg && <span className="text-xs text-text-secondary">{msg}</span>}
    </form>
  );
}
