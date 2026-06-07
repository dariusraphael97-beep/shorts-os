// scripts/render-worker/lib/image-search.ts
// Google Programmable Search (Custom Search JSON API) image lookup — finds a real reference photo
// of a subject (e.g. "BMW B58 engine") so the illustrator can draw it accurately. Best-effort:
// returns null on any failure so a beat falls back to prompt-only generation.
import { writeFile } from 'node:fs/promises';

export async function searchImageUrl(query: string): Promise<string | null> {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx || !query.trim()) return null;
  const u = new URL('https://www.googleapis.com/customsearch/v1');
  u.searchParams.set('key', key);
  u.searchParams.set('cx', cx);
  u.searchParams.set('searchType', 'image');
  u.searchParams.set('imgSize', 'large');
  u.searchParams.set('safe', 'active');
  u.searchParams.set('num', '5');
  u.searchParams.set('q', query);
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { items?: Array<{ link?: string; mime?: string }> };
    for (const it of j.items ?? []) {
      // prefer real raster photos
      if (it.link && /^https?:\/\//.test(it.link) && (!it.mime || /image\/(jpe?g|png|webp)/.test(it.mime))) {
        return it.link;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function downloadToFile(url: string, outputPath: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return false; // too small to be a real photo
    await writeFile(outputPath, buf);
    return true;
  } catch {
    return false;
  }
}
