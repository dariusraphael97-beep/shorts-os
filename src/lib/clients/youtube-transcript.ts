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

interface CaptionTrack { baseUrl: string; languageCode?: string; kind?: string }

/** Extract the full `captionTracks` JSON array via a string-aware balanced-bracket scan. */
function extractCaptionTracksJson(html: string): string | null {
  const idx = html.indexOf('"captionTracks":');
  if (idx === -1) return null;
  const start = html.indexOf("[", idx);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

/** Extract the best caption track (prefer English) from a watch-page body. */
function pickTrack(watchHtml: string): CaptionTrack | null {
  const json = extractCaptionTracksJson(watchHtml);
  if (!json) return null;
  let tracks: CaptionTrack[];
  try { tracks = JSON.parse(json) as CaptionTrack[]; } catch { return null; }
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
          cache: "no-store",
        });
        if (!watch.ok) return null;
        const html = await watch.text();
        const track = pickTrack(html);
        if (!track?.baseUrl) return null;
        const trackRes = await fetch(track.baseUrl, { cache: "no-store" });
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
