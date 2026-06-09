// scripts/render-worker/lib/find-photo.ts
// Best-effort: find a real, vision-vetted photo for a "photo" beat. Returns a local file path
// to the first candidate that passes vetting, or null (caller falls back to generation).
import { join } from 'node:path';
import { searchImageCandidates, downloadToFile } from './image-search.ts';
import { vetPhoto } from './claude-vision.ts';

export async function findUsablePhoto(args: {
  query: string;
  subject: string;
  workDir: string;
  beatKey: string;
  maxCandidates?: number;
}): Promise<string | null> {
  if (!args.query.trim()) return null;
  const max = args.maxCandidates ?? 4;
  const urls = await searchImageCandidates(args.query, max + 2);
  let i = 0;
  for (const url of urls.slice(0, max)) {
    const path = join(args.workDir, `${args.beatKey}_cand${i}.jpg`);
    i++;
    if (!(await downloadToFile(url, path))) continue;
    const vet = await vetPhoto({ imagePath: path, subject: args.subject });
    if (vet.usable) return path;
  }
  return null;
}
