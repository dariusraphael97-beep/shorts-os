// scripts/render-worker/lib/pexels.ts
//
// Worker-side: search Pexels, download the chosen vertical clip to /tmp.
// Mirrors src/lib/clients/pexels.ts but duplicated to keep the worker
// package self-contained (it can't import from src/* in the Sandbox).
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';

const VideoFile = z.object({
  id: z.number(),
  quality: z.string(),
  file_type: z.string(),
  width: z.number(),
  height: z.number(),
  link: z.string().url(),
});
const Video = z.object({
  id: z.number(),
  width: z.number(),
  height: z.number(),
  duration: z.number(),
  video_files: z.array(VideoFile),
});
const SearchResponse = z.object({
  videos: z.array(Video),
});

export interface PexelsDownloadResult {
  outputPath: string;
  width: number;
  height: number;
  durationSeconds: number;
  pexelsVideoId: number;
}

export async function searchAndDownloadVertical(args: {
  query: string;
  outputPath: string;
}): Promise<PexelsDownloadResult | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error('PEXELS_API_KEY must be set');

  const url = new URL('https://api.pexels.com/videos/search');
  url.searchParams.set('query', args.query);
  url.searchParams.set('per_page', '5');
  url.searchParams.set('orientation', 'portrait');

  const searchRes = await fetch(url.toString(), { headers: { Authorization: apiKey } });
  if (!searchRes.ok) return null;

  const parsed = SearchResponse.parse(await searchRes.json());
  if (parsed.videos.length === 0) return null;

  // Pick first video; pick its largest vertical mp4 file (fall back to largest mp4).
  const video = parsed.videos[0];
  const verticals = video.video_files
    .filter((f) => f.file_type === 'video/mp4' && f.height >= f.width)
    .sort((a, b) => b.height * b.width - a.height * a.width);
  const fallback = video.video_files
    .filter((f) => f.file_type === 'video/mp4')
    .sort((a, b) => b.height * b.width - a.height * a.width);
  const file = verticals[0] ?? fallback[0];
  if (!file) return null;

  const dlRes = await fetch(file.link);
  if (!dlRes.ok) throw new Error(`pexels download failed ${dlRes.status}`);
  const buffer = Buffer.from(await dlRes.arrayBuffer());
  await writeFile(args.outputPath, buffer);

  return {
    outputPath: args.outputPath,
    width: file.width,
    height: file.height,
    durationSeconds: video.duration,
    pexelsVideoId: video.id,
  };
}
