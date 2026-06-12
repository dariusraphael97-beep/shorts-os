// Mirror of src/lib/longform/chapters.ts — worker cannot import src/*. Keep in sync.
// src/lib/longform/chapters.ts
// Pure chapter-marker timestamps (for the YouTube description) + ffmpeg concat-list
// builder. Mirrored verbatim into the worker.

export interface ChapterMarker {
  index: number;
  title: string;
  startSeconds: number;
  timestamp: string;
}

export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function buildChapterMarkers(chapterDurations: number[], titles: string[]): ChapterMarker[] {
  const markers: ChapterMarker[] = [];
  let acc = 0;
  for (let i = 0; i < chapterDurations.length; i++) {
    markers.push({
      index: i,
      title: titles[i] ?? `Chapter ${i + 1}`,
      startSeconds: Math.round(acc),
      timestamp: formatTimestamp(acc),
    });
    acc += chapterDurations[i];
  }
  return markers;
}

export function buildConcatList(paths: string[]): string {
  return paths.map((p) => `file '${p}'`).join("\n") + "\n";
}
