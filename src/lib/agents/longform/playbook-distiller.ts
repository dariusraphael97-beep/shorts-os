// src/lib/agents/longform/playbook-distiller.ts
// Phase L2 learning engine (pure). Turns posted-video outcomes into a LongformPlaybook.
//
// THE RULE (B58 post-mortem): rank by first-30s audience retention FIRST, CTR last. A high-CTR video
// with a slow open is the exact failure mode the 2026 Browse algorithm demotes ("Quality CTR"), so it
// is NOT a teachable winner — it is filtered out below the WINNER_FIRST_30S_FLOOR. Only videos that
// actually held the open teach the writer/style/voice agents what to repeat.
import type { PresetId } from "@/lib/longform/style-presets";
import {
  EMPTY_LONGFORM_PLAYBOOK,
  type LongformPlaybook,
  type RankedExemplar,
} from "@/lib/agents/longform/playbook";

/** One posted video's decisions + measured opening retention. Pre-folded by the loader from the
 *  decision ledger ⨝ analytics view. Any field may be null until that signal is tracked. */
export interface VideoOutcome {
  videoId: string;
  /** Channel niche / topic bucket (e.g. "cars"), for per-genre preset + voice winners. null ⇒ skipped. */
  genre: string | null;
  presetId: PresetId | null;
  voiceId: string | null;
  hook: string | null;
  angle: string | null;
  /** The posted title (used as a title-formula seed — emulate its shape). */
  title: string | null;
  /** Thumbnail text tokens, once thumbnails are tracked. null until then. */
  thumbnailWords: string[] | null;
  first30sRetention: number | null;
  first60sRetention: number | null;
  relativeRetentionOpening: number | null;
  ctrPct: number | null;
  views: number | null;
  avgBeatSeconds: number | null;
}

/** A teachable winner must hold at least this fraction of its audience through the first 30 seconds.
 *  Below it, clicks don't matter — the open failed and the algorithm will demote it. */
export const WINNER_FIRST_30S_FLOOR = 0.5;

/** Max items kept per "winning" list — enough variety for the writer to emulate shape without noise. */
export const EXEMPLAR_LIMIT = 5;

const num = (x: number | null | undefined): number => x ?? -Infinity;

/** Descending compare that puts nulls last. */
const desc = (a: number | null | undefined, b: number | null | undefined): number => num(b) - num(a);

/** Retention-first ordering. CTR and views are tie-breakers ONLY — never ahead of a retention signal. */
function byRetentionFirst(a: VideoOutcome, b: VideoOutcome): number {
  return (
    desc(a.first30sRetention, b.first30sRetention) ||
    desc(a.first60sRetention, b.first60sRetention) ||
    desc(a.relativeRetentionOpening, b.relativeRetentionOpening) ||
    desc(a.ctrPct, b.ctrPct) ||
    desc(a.views, b.views)
  );
}

/** Take distinct, non-empty string values in the (already retention-ranked) order, capped. */
function topDistinct(
  items: VideoOutcome[],
  pick: (o: VideoOutcome) => string | null | undefined,
  limit = EXEMPLAR_LIMIT,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of items) {
    const v = pick(o)?.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function distillPlaybook(outcomes: VideoOutcome[]): LongformPlaybook {
  // Only videos with a real first-30s reading are "measured" — they anchor the benchmark + ranking.
  const measured = outcomes.filter((o) => o.first30sRetention != null);
  if (measured.length === 0) {
    // Cold start: hand back the canonical EMPTY (deep clone so callers can't mutate the shared const).
    return structuredClone(EMPTY_LONGFORM_PLAYBOOK);
  }

  // Winners = held the open. Ranked retention-first. This is the only set the agents learn from.
  const winners = measured
    .filter((o) => (o.first30sRetention as number) >= WINNER_FIRST_30S_FLOOR)
    .sort(byRetentionFirst);

  const presetWinsByGenre: Partial<Record<string, PresetId>> = {};
  const bestVoiceIdByGenre: Partial<Record<string, string>> = {};
  for (const o of winners) {
    if (o.genre && o.presetId && !(o.genre in presetWinsByGenre)) presetWinsByGenre[o.genre] = o.presetId;
    if (o.genre && o.voiceId && !(o.genre in bestVoiceIdByGenre)) bestVoiceIdByGenre[o.genre] = o.voiceId;
  }

  const rankedExemplars: RankedExemplar[] = winners
    .slice(0, EXEMPLAR_LIMIT)
    .map((o) => ({
      text: (o.hook ?? o.angle ?? o.title ?? "").trim(),
      first30sRetention: o.first30sRetention,
      first60sRetention: o.first60sRetention,
      relativeRetentionOpening: o.relativeRetentionOpening,
      ctrPct: o.ctrPct,
      sourceVideoId: o.videoId,
    }))
    .filter((e) => e.text.length > 0);

  const winningWordCombos = topDistinct(winners, (o) =>
    o.thumbnailWords?.length ? o.thumbnailWords.join(" ") : null,
  );
  const numberTokens: string[] = [];
  for (const o of winners) {
    for (const w of o.thumbnailWords ?? []) if (/\d/.test(w)) numberTokens.push(w.trim());
  }
  const winningNumberPatterns = [...new Set(numberTokens)].slice(0, EXEMPLAR_LIMIT);

  const beatSeconds = winners.map((o) => o.avgBeatSeconds).filter((s): s is number => s != null);

  return {
    writer: {
      exemplarHooks: topDistinct(winners, (o) => o.hook),
      winningAngleNotes: topDistinct(winners, (o) => o.angle),
      winningTitleFormulas: topDistinct(winners, (o) => o.title),
      rankedExemplars,
    },
    stylePicker: { presetWinsByGenre },
    beatPlanner: {
      promptPatternTags: topDistinct(winners, (o) => o.presetId),
      bestBeatSeconds: median(beatSeconds),
    },
    voice: { bestVoiceIdByGenre },
    thumbnail: { winningWordCombos, winningNumberPatterns },
    retention: {
      medianFirst30sRetention: median(measured.map((o) => o.first30sRetention as number)),
      medianFirst60sRetention: median(
        measured.map((o) => o.first60sRetention).filter((s): s is number => s != null),
      ),
      bestFirst30sRetention: Math.max(...measured.map((o) => o.first30sRetention as number)),
      sampleSize: measured.length,
    },
  };
}
