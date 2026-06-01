"use client";
// src/components/clips/block-source-modal.tsx
//
// Modal triggered from ClipCard. Two radios (subreddit / author) + optional
// reason text + POST to /api/clips/block (preserved). Soft-deletes the
// originating clip on success.

import { useState } from "react";
import { ShieldOff, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { modalScale, backdropFade } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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

  async function submit() {
    setSubmitting(true);
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
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      toast.success(`Blocked ${choice === "subreddit" ? `r/${subreddit}` : `u/${author ?? ""}`}`);
      // Allow toast to appear before reload
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Block failed");
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        {...backdropFade}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          key="modal"
          {...modalScale}
          className={cn(
            "relative w-full max-w-sm rounded-xl",
            "border border-[var(--border-subtle)] bg-[var(--surface-1)]",
            "p-5 shadow-xl",
          )}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Block source"
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-4">
            <ShieldOff className="h-4 w-4 text-[var(--danger)]" aria-hidden />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Block source</h3>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "ml-auto rounded-md p-1 transition-colors",
                "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
              )}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Radio options */}
          <div className="space-y-2 mb-4">
            <Label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="block-choice"
                checked={choice === "subreddit"}
                onChange={() => setChoice("subreddit")}
                className="accent-[var(--accent)]"
              />
              <span className="text-sm text-[var(--text-primary)]">
                Block{" "}
                <span className="font-mono text-[var(--accent)]">r/{subreddit}</span>
              </span>
            </Label>

            {author && (
              <Label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="block-choice"
                  checked={choice === "author"}
                  onChange={() => setChoice("author")}
                  className="accent-[var(--accent)]"
                />
                <span className="text-sm text-[var(--text-primary)]">
                  Block{" "}
                  <span className="font-mono text-[var(--text-secondary)]">u/{author}</span>
                </span>
              </Label>
            )}
          </div>

          {/* Reason textarea */}
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="mb-4 resize-none text-sm"
            rows={2}
          />

          {/* Actions */}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
              className="h-8 px-3 text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={submit}
              disabled={submitting}
              className="h-8 gap-1.5 px-3 text-xs"
            >
              {submitting ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <ShieldOff className="h-3 w-3" aria-hidden />
              )}
              {submitting ? "Blocking…" : "Block"}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
