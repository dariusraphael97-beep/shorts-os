"use client";
// src/components/clips/clip-card.tsx
//
// Single inbox tile. Premium composition: 9:16 video thumbnail, title/desc,
// source/platform pills, Block source action. All API calls and props preserved.

import { useState } from "react";
import { ShieldOff, Clock, ExternalLink } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { fadeRise } from "@/lib/motion";
import { HoverLift } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClipLibraryRow } from "@/lib/supabase/repositories/clip-library";
import { BlockSourceModal } from "@/components/clips/block-source-modal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSubredditFromUrl(url: string): string | null {
  const m = url.match(/reddit\.com\/r\/([^/?#]+)/i);
  return m ? m[1] : null;
}

const PLATFORM_PILL: Record<
  string,
  { label: string; className: string }
> = {
  reddit: {
    label: "Reddit",
    className:
      "border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]",
  },
  youtube: {
    label: "YouTube",
    className:
      "border-[var(--danger)]/30 bg-[var(--danger)]/10 text-[var(--danger)]",
  },
  tiktok: {
    label: "TikTok",
    className:
      "border-[var(--accent)]/30 bg-[var(--accent-muted)] text-[var(--accent)]",
  },
  twitch: {
    label: "Twitch",
    className:
      "border-purple-500/30 bg-purple-500/10 text-purple-400",
  },
  upload: {
    label: "Upload",
    className:
      "border-[var(--text-tertiary)]/25 bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)]",
  },
};

function platformPill(platform: string) {
  return PLATFORM_PILL[platform] ?? {
    label: platform,
    className:
      "border-[var(--text-tertiary)]/25 bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)]",
  };
}

// ─── ClipCard ─────────────────────────────────────────────────────────────────

interface ClipCardProps {
  clip: ClipLibraryRow;
  /** stagger index for fadeRise */
  index?: number;
}

export function ClipCard({ clip, index = 0 }: ClipCardProps) {
  const [showBlock, setShowBlock] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const subreddit =
    clip.source_platform === "reddit"
      ? parseSubredditFromUrl(clip.source_url)
      : null;
  const author = clip.source_creator?.replace(/^u\//, "") ?? null;
  const thumbSrc = clip.local_path.replace(/\.mp4$/, ".thumb.jpg");
  const pill = platformPill(clip.source_platform);
  const durationLabel = `${Math.round(clip.duration_seconds)}s`;

  // Source attribution string
  const attribution = [
    subreddit ? `r/${subreddit}` : null,
    author ? `u/${author}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const motionProps = prefersReducedMotion
    ? {}
    : {
        variants: fadeRise,
        initial: "initial" as const,
        animate: "animate" as const,
        transition: {
          delay: Math.min(index * 0.04, 0.28),
          duration: 0.32,
          ease: [0, 0, 0.2, 1] as [number, number, number, number],
        },
      };

  return (
    <>
      <motion.div {...motionProps}>
        <HoverLift>
          <article
            className={cn(
              "rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]",
              "overflow-hidden flex flex-col",
            )}
          >
            {/* 9:16 video preview */}
            <div className="relative bg-black" style={{ aspectRatio: "9 / 16" }}>
              <video
                src={clip.local_path}
                poster={thumbSrc}
                controls
                preload="none"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>

            {/* Card body */}
            <div className="flex flex-col gap-3 p-4">
              {/* Description */}
              <p className="text-sm text-[var(--text-primary)] line-clamp-3 leading-relaxed">
                {clip.description ?? "(no description)"}
              </p>

              {/* Tags */}
              {clip.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {clip.tags.map((t) => (
                    <span
                      key={t}
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5",
                        "font-mono text-[10px] tracking-wide",
                        "border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-secondary)]",
                      )}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Meta row: platform pill + duration + attribution */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Platform pill */}
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5",
                    "font-mono text-[10px] uppercase tracking-wider",
                    pill.className,
                  )}
                >
                  {pill.label}
                </span>

                {/* Duration */}
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--text-tertiary)] tabular-nums">
                  <Clock className="h-3 w-3" aria-hidden />
                  {durationLabel}
                </span>

                {/* Attribution */}
                {attribution && (
                  <span className="font-mono text-[11px] text-[var(--text-tertiary)] truncate min-w-0">
                    {attribution}
                  </span>
                )}
              </div>

              {/* Source link */}
              <a
                href={clip.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]",
                  "hover:text-[var(--text-secondary)] transition-colors truncate",
                )}
              >
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{clip.source_url}</span>
              </a>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1 border-t border-[var(--border-subtle)]">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowBlock(true)}
                  disabled={!subreddit && !author}
                  className={cn(
                    "h-7 gap-1.5 px-2.5 text-[11px]",
                    "text-[var(--text-tertiary)] hover:text-[var(--danger)]",
                    "disabled:opacity-40",
                  )}
                  aria-label="Block this clip's source"
                >
                  <ShieldOff className="h-3 w-3" aria-hidden />
                  Block source
                </Button>
              </div>
            </div>
          </article>
        </HoverLift>
      </motion.div>

      {showBlock && subreddit && (
        <BlockSourceModal
          clipId={clip.id}
          subreddit={subreddit}
          author={author}
          onClose={() => setShowBlock(false)}
        />
      )}
    </>
  );
}
