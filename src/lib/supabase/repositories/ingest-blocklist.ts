import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BlocklistPlatform = "reddit" | "youtube" | "tiktok";
export type BlocklistIdentifierType = "subreddit" | "author";

export interface BlocklistRow {
  identifier_type: BlocklistIdentifierType;
  identifier: string;
}

export interface BlocklistGrouped {
  subreddits: Set<string>;
  authors: Set<string>;
}

export async function loadBlocklistForPlatform(
  supabase: SupabaseClient,
  platform: BlocklistPlatform,
): Promise<BlocklistGrouped> {
  const { data, error } = await supabase
    .from("ingest_blocklist")
    .select("identifier_type, identifier")
    .eq("source_platform", platform);
  if (error) throw new Error(`loadBlocklistForPlatform: ${error.message}`);
  const subreddits = new Set<string>();
  const authors = new Set<string>();
  for (const row of (data ?? []) as BlocklistRow[]) {
    const id = row.identifier.toLowerCase();
    if (row.identifier_type === "subreddit") subreddits.add(id);
    else if (row.identifier_type === "author") authors.add(id);
  }
  return { subreddits, authors };
}

export function isBlocked(
  b: BlocklistGrouped,
  post: { subreddit: string; author: string },
): boolean {
  return b.subreddits.has(post.subreddit.toLowerCase())
    || b.authors.has(post.author.toLowerCase());
}
