/** Normalize a free-text paste of channel URLs/handles into a clean, de-duped list.
 * The watch-list/competitor routes resolve each entry via the YouTube API, so this
 * only splits, trims, and dedupes — it does not validate URL shape. */
export function parseChannelUrls(raw: string): string[] {
  const parts = raw.split(/[\n,]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!seen.has(p)) { seen.add(p); out.push(p); }
  }
  return out;
}
