import "server-only";
import { z } from "zod";

const VideoFile = z.object({
  id: z.number(),
  // Pexels occasionally returns quality: null on some files. Tolerate it —
  // file selection picks by width*height anyway.
  quality: z.string().nullable(),
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
  page: z.number(),
  per_page: z.number(),
  total_results: z.number(),
  videos: z.array(Video),
});

export interface PexelsClip {
  videoId: number;
  width: number;
  height: number;
  durationSeconds: number;
  downloadUrl: string;
}

export async function searchVideos(args: {
  query: string;
  perPage?: number;
}): Promise<PexelsClip[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error("PEXELS_API_KEY must be set");

  const url = new URL("https://api.pexels.com/videos/search");
  url.searchParams.set("query", args.query);
  url.searchParams.set("per_page", String(args.perPage ?? 5));
  url.searchParams.set("orientation", "portrait");

  const res = await fetch(url.toString(), {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) return [];

  const parsed = SearchResponse.parse(await res.json());

  return parsed.videos.map((v) => {
    const vertical = v.video_files
      .filter((f) => f.file_type === "video/mp4" && f.height >= f.width)
      .sort((a, b) => b.height * b.width - a.height * a.width);
    const fallback = v.video_files
      .filter((f) => f.file_type === "video/mp4")
      .sort((a, b) => b.height * b.width - a.height * a.width);
    const file = vertical[0] ?? fallback[0];
    return {
      videoId: v.id,
      width: file.width,
      height: file.height,
      durationSeconds: v.duration,
      downloadUrl: file.link,
    };
  });
}
