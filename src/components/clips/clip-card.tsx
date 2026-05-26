"use client";
// src/components/clips/clip-card.tsx
//
// Single inbox tile. Renders preview + description + tags + source link;
// Block button opens BlockSourceModal.
import { useState } from "react";
import type { ClipLibraryRow } from "@/lib/supabase/repositories/clip-library";
import { BlockSourceModal } from "@/components/clips/block-source-modal";

function parseSubredditFromUrl(url: string): string | null {
  const m = url.match(/reddit\.com\/r\/([^/?#]+)/i);
  return m ? m[1] : null;
}

export function ClipCard({ clip }: { clip: ClipLibraryRow }) {
  const [showBlock, setShowBlock] = useState(false);
  const subreddit = clip.source_platform === "reddit" ? parseSubredditFromUrl(clip.source_url) : null;
  const author = clip.source_creator?.replace(/^u\//, "") ?? null;
  const thumbnailUrl = clip.local_path.replace(/\.mp4$/, ".thumb.jpg");

  return (
    <article className="border border-border rounded overflow-hidden flex flex-col bg-surface-1">
      <video
        src={clip.local_path}
        poster={thumbnailUrl}
        controls
        preload="none"
        className="aspect-[9/16] w-full bg-black object-cover"
      />
      <div className="p-3 flex flex-col gap-2 text-sm">
        <p className="text-text-primary line-clamp-3">{clip.description ?? "(no description)"}</p>
        <div className="flex flex-wrap gap-1">
          {clip.tags.map((t) => (
            <span key={t} className="text-xs bg-surface-2 px-2 py-0.5 rounded">
              {t}
            </span>
          ))}
        </div>
        <div className="text-text-secondary text-xs flex flex-col gap-0.5">
          <a
            href={clip.source_url}
            target="_blank"
            rel="noreferrer"
            className="hover:underline truncate"
          >
            {clip.source_url}
          </a>
          <span>
            {clip.source_platform}
            {author ? ` · u/${author}` : ""}
            {subreddit ? ` · r/${subreddit}` : ""}
            {" · "}
            {Math.round(clip.duration_seconds)}s
          </span>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => setShowBlock(true)}
            disabled={!subreddit && !author}
            className="text-xs border border-border rounded px-2 py-1 hover:bg-surface-2 disabled:opacity-50"
          >
            Block source
          </button>
        </div>
      </div>
      {showBlock && subreddit && (
        <BlockSourceModal
          clipId={clip.id}
          subreddit={subreddit}
          author={author}
          onClose={() => setShowBlock(false)}
        />
      )}
    </article>
  );
}
