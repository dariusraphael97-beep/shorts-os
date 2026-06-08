// scripts/render-worker/lib/image-search.ts
// Finds a real reference photo of a subject (e.g. "BMW B58 engine") so the illustrator can draw it
// accurately. Prefers Serper.dev (one key, no setup); falls back to Google Custom Search if that's
// what's configured. Best-effort: returns null on any failure so a beat falls back to prompt-only.
import { writeFile } from 'node:fs/promises';

export async function searchImageUrl(query: string): Promise<string | null> {
  if (!query.trim()) return null;
  if (process.env.SERPER_API_KEY) return searchSerper(query);
  if (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_ID) return searchGoogleCse(query);
  return null;
}

// Serper.dev — POST /images with X-API-KEY → { images: [{ imageUrl }] }.
async function searchSerper(query: string): Promise<string | null> {
  try {
    const res = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: { 'X-API-KEY': process.env.SERPER_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 5 }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { images?: Array<{ imageUrl?: string }> };
    for (const it of j.images ?? []) {
      if (it.imageUrl && /^https?:\/\//.test(it.imageUrl)) return it.imageUrl;
    }
    return null;
  } catch {
    return null;
  }
}

async function searchGoogleCse(query: string): Promise<string | null> {
  const u = new URL('https://www.googleapis.com/customsearch/v1');
  u.searchParams.set('key', process.env.GOOGLE_CSE_KEY!);
  u.searchParams.set('cx', process.env.GOOGLE_CSE_ID!);
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
