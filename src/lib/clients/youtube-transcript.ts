import "server-only";

export interface TranscriptResult {
  text: string;
  language: string;
  auto_generated: boolean;
}

export interface TranscriptClient {
  fetchTranscript(videoId: string): Promise<TranscriptResult | null>;
}

const ENTITY: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, (m) => ENTITY[m] ?? m);
}

/** Flatten timedtext XML (<text start dur>cue</text>) into a single decoded string. */
export function parseTimedTextXml(xml: string): string {
  const cues = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
    decodeEntities(m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).trim(),
  );
  return cues.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

interface CaptionTrack { baseUrl: string; languageCode: string; kind?: string }

/** Extract the best caption track (prefer English) from a watch-page body. */
function pickTrack(watchHtml: string): CaptionTrack | null {
  const m = watchHtml.match(/"captionTracks":(\[.*?\])/s);
  if (!m) return null;
  let tracks: CaptionTrack[];
  try {
    tracks = JSON.parse(m[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/")) as CaptionTrack[];
  } catch { return null; }
  if (tracks.length === 0) return null;
  const en = tracks.find((t) => t.languageCode?.startsWith("en"));
  return en ?? tracks[0];
}

export function createTranscriptClient(): TranscriptClient {
  return {
    async fetchTranscript(videoId: string): Promise<TranscriptResult | null> {
      try {
        const watch = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
          headers: { "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0 (compatible; shorts-os/1.0)" },
        });
        if (!watch.ok) return null;
        const html = await watch.text();
        const track = pickTrack(html);
        if (!track?.baseUrl) return null;
        const trackRes = await fetch(track.baseUrl);
        if (!trackRes.ok) return null;
        const text = parseTimedTextXml(await trackRes.text());
        if (!text) return null;
        return {
          text,
          language: track.languageCode ?? "und",
          auto_generated: track.kind === "asr",
        };
      } catch {
        return null;
      }
    },
  };
}
