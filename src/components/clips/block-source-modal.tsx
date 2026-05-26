"use client";
// src/components/clips/block-source-modal.tsx
//
// Modal triggered from ClipCard. Two radios (subreddit / author) + optional
// reason text + POST to /api/clips/block. Soft-deletes the originating clip
// on success.
import { useState } from "react";

interface Props {
  clipId: string;
  subreddit: string;
  author: string | null;
  onClose: () => void;
}

export function BlockSourceModal({ clipId, subreddit, author, onClose }: Props) {
  const [choice, setChoice] = useState<"subreddit" | "author">("subreddit");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/clips/block", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourcePlatform: "reddit",
          identifierType: choice,
          identifier: choice === "subreddit" ? subreddit : author,
          reason: reason || undefined,
          softDeleteClipId: clipId,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "block failed");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 border border-border rounded p-4 max-w-sm w-full space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-medium">Block source</h3>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={choice === "subreddit"}
              onChange={() => setChoice("subreddit")}
            />
            Block r/{subreddit}
          </label>
          {author && (
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={choice === "author"}
                onChange={() => setChoice("author")}
              />
              Block u/{author}
            </label>
          )}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="w-full bg-surface-2 border border-border rounded p-2 text-sm"
          rows={2}
        />
        {err && <p className="text-red-400 text-xs">{err}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-xs border border-border rounded px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="text-xs bg-text-primary text-surface-0 rounded px-3 py-1.5 disabled:opacity-50"
          >
            {submitting ? "Blocking…" : "Block"}
          </button>
        </div>
      </div>
    </div>
  );
}
