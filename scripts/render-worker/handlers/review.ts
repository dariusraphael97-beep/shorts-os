// scripts/render-worker/handlers/review.ts
//
// Plan 5 sub-phase G: the Video Reviewer worker handler.
//
// A COMPUTE-ONLY `review` render-job. It loads a rendered short's inputs with
// the worker's raw Supabase client, runs a 7-component pre-publish QA pass over
// the MP4, and RETURNS a plain object. It does NOT write video_reviews or
// your_videos — persistence happens server-side in a later task.
//
// The 7 components: title, thumbnail, hook, pacing, description_seo, audio,
// visual. Each resolves to a {score 0–1, verdict}. Every AV/vision/network
// sub-step is wrapped so a single failure degrades only that component (to a
// low-confidence `needs_work`) rather than failing the whole job — EXCEPT the
// your_videos load + MP4 download, which are hard prerequisites that throw.
//
// Trace pattern mirrors render-f1.ts:RenderF1Error so the callback handler can
// persist a per-stage timing string on both success and failure.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import type { SupabaseClient } from '@supabase/supabase-js';
import { probeDurationSeconds, probeVideoStream } from '../lib/probe.ts';
import { detectSceneCount, measureLoudness } from '../lib/av-analysis.ts';
import { extractFramesAndThumbnail } from '../lib/frames.ts';
import { assessFramesForReview } from '../lib/claude-vision.ts';
import {
  rollUpOverall,
  scoreDescriptionSeo,
  scoreHookFromTranscript,
  type ReviewVerdict,
  type ReviewSuggestion,
  type ReviewStrength,
} from '../lib/review-heuristics.ts';

export class ReviewError extends Error {
  constructor(message: string, public trace: string) {
    super(message);
    this.name = 'ReviewError';
  }
}

// --- local helpers (pure) ---------------------------------------------------

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Generic three-band verdict, matching the worker heuristics' bands. */
function verdictFromScore(score: number): ReviewVerdict {
  if (score >= 0.7) return 'pass';
  if (score >= 0.35) return 'needs_work';
  return 'fail';
}

/**
 * Derive niche keywords from a niche_clusters row. The table has no dedicated
 * keyword column, so we tokenize canonical_topic (the human-readable topic
 * phrase) and fold in format_label, dropping stop-words and short tokens.
 */
function deriveNicheKeywords(row: {
  canonical_topic?: string | null;
  format_label?: string | null;
} | null): string[] {
  if (!row) return [];
  const STOP = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with',
    'how', 'why', 'what', 'is', 'are', 'best', 'top', 'your', 'you',
  ]);
  const raw = `${row.canonical_topic ?? ''} ${row.format_label ?? ''}`;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of raw.toLowerCase().split(/[^a-z0-9]+/)) {
    if (tok.length < 3) continue;
    if (STOP.has(tok)) continue;
    if (seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }
  return out;
}

export async function runReview(
  job: { id: string; payload: unknown },
  supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const trace: string[] = [];
  const log = (msg: string) => {
    const line = `[review] +${Date.now() - t0}ms ${msg}`;
    console.log(line);
    trace.push(line);
  };

  try {
    return await reviewInternal();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAILED: ${msg}`);
    throw new ReviewError(msg, trace.join('\n'));
  }

  async function reviewInternal(): Promise<Record<string, unknown>> {
    const payload = job.payload as { your_video_id: string };

    // ─── 1) Load your_videos (HARD prerequisite) ───
    const { data: yv, error: yvErr } = await supabase
      .from('your_videos')
      .select(
        'id, title, description, script, render_artifact_url, topic_queue_id, source_niche_cluster_id',
      )
      .eq('id', payload.your_video_id)
      .single();
    if (yvErr || !yv) {
      throw new Error(`your_videos row not found: ${yvErr?.message ?? 'no row'}`);
    }
    const renderUrl = yv.render_artifact_url as string | null;
    if (!renderUrl) throw new Error('your_videos.render_artifact_url is null — nothing to review');

    const title = (yv.title as string | null) ?? '';
    const script = (yv.script as string | null) ?? '';
    log(`loaded yv (title.len=${title.length}, script.len=${script.length})`);

    // ─── 2) Niche keywords (best-effort) ───
    let nicheKeywords: string[] = [];
    const nicheId = yv.source_niche_cluster_id as string | null;
    if (nicheId) {
      try {
        const { data: nc } = await supabase
          .from('niche_clusters')
          .select('canonical_topic, format_label')
          .eq('id', nicheId)
          .single();
        nicheKeywords = deriveNicheKeywords(nc);
        log(`niche keywords: [${nicheKeywords.join(', ')}]`);
      } catch (err) {
        log(`niche keyword lookup failed (continuing): ${(err as Error).message}`);
      }
    } else {
      log('no source_niche_cluster_id — empty niche keywords');
    }

    // ─── 3) Download the rendered MP4 (HARD prerequisite) ───
    const workDir = await mkdtemp(join(tmpdir(), 'review-'));
    const videoPath = join(workDir, 'render.mp4');
    {
      const res = await fetch(renderUrl);
      if (!res.ok) throw new Error(`download render mp4 failed: HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(videoPath, buf);
      log(`downloaded render mp4 (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
    }

    // ─── 4) Probe duration (best-effort; needed for several heuristics) ───
    let durationSeconds: number | null = null;
    try {
      durationSeconds = await probeDurationSeconds(videoPath);
      log(`duration ${durationSeconds.toFixed(1)}s`);
    } catch (err) {
      log(`duration probe failed: ${(err as Error).message}`);
    }

    const suggestions: ReviewSuggestion[] = [];
    const strengths: ReviewStrength[] = [];

    // ─── 5) Vision pass (best-effort) — frames + thumbnail → 3 sub-scores ───
    let vision: { thumbnail: { score: number; note: string }; hook: { score: number; note: string }; visual: { score: number; note: string } } | null = null;
    try {
      const framesDir = join(workDir, 'frames');
      const { framePaths, thumbnailPath } = await extractFramesAndThumbnail({
        videoPath,
        durationSeconds: durationSeconds ?? 30,
        outDir: framesDir,
      });
      log(`extracted ${framePaths.length} frames + thumb`);
      vision = await assessFramesForReview({
        framePaths,
        thumbnailPath,
        transcript: script.length > 0 ? script : null,
      });
      log(vision ? 'vision assessment ok' : 'vision assessment returned null');
    } catch (err) {
      log(`vision pass failed (continuing): ${(err as Error).message}`);
    }

    // ─── 6) Visual: resolution/fps baseline blended with vision ───
    let visualScore: number;
    {
      const stream = await probeVideoStream(videoPath);
      let specScore: number;
      if (stream) {
        const onSpecRes = stream.width === 1080 && stream.height === 1920;
        const isVertical = stream.height > stream.width;
        const fpsOk = stream.fps >= 24 && stream.fps <= 60;
        // 1080x1920 @ ~30fps scores high; vertical-but-off-res is middling;
        // landscape/off-fps is penalised.
        specScore = onSpecRes ? 1.0 : isVertical ? 0.6 : 0.25;
        if (!fpsOk) specScore = Math.min(specScore, 0.45);
        log(`video stream ${stream.width}x${stream.height}@${stream.fps.toFixed(1)} specScore=${specScore}`);
      } else {
        specScore = 0.5;
        suggestions.push({
          component: 'visual',
          severity: 'needs_work',
          suggestion_text: 'Could not probe video resolution/frame rate (low-confidence visual score)',
        });
        log('video stream probe null → neutral specScore=0.5');
      }
      if (vision) {
        visualScore = clamp01(0.5 * specScore + 0.5 * vision.visual.score);
        if (vision.visual.score < 0.5) {
          suggestions.push({ component: 'visual', severity: verdictFromScore(visualScore), suggestion_text: vision.visual.note });
        }
      } else {
        visualScore = clamp01(specScore);
      }
    }
    const visualVerdict = verdictFromScore(visualScore);

    // ─── 7) Pacing: scene cuts per duration in a healthy band ───
    let pacingScore: number;
    {
      const sceneCount = await detectSceneCount(videoPath);
      if (sceneCount === null || durationSeconds === null || durationSeconds <= 0) {
        pacingScore = 0.5;
        suggestions.push({
          component: 'pacing',
          severity: 'needs_work',
          suggestion_text: 'Could not measure scene-cut pacing (low-confidence score)',
        });
        log('pacing: scene/duration unavailable → neutral 0.5');
      } else {
        const cutsPerSec = sceneCount / durationSeconds;
        // Healthy short-form band ≈ 1 cut every 2–5s (0.2–0.5 cuts/sec).
        // Too few cuts → static; too many → frantic.
        if (cutsPerSec >= 0.2 && cutsPerSec <= 0.5) {
          pacingScore = 1.0;
        } else if (cutsPerSec >= 0.1 && cutsPerSec <= 0.8) {
          pacingScore = 0.6;
        } else {
          pacingScore = 0.3;
        }
        log(`pacing: ${sceneCount} cuts / ${durationSeconds.toFixed(1)}s = ${cutsPerSec.toFixed(2)}/s → ${pacingScore}`);
        if (pacingScore < 0.7) {
          suggestions.push({
            component: 'pacing',
            severity: verdictFromScore(pacingScore),
            suggestion_text:
              cutsPerSec < 0.2
                ? 'Add more visual cuts/movement — pacing feels static for a short.'
                : 'Slow the cuts slightly — pacing feels frantic for a short.',
          });
        }
      }
    }
    const pacingVerdict = verdictFromScore(pacingScore);

    // ─── 8) Audio: integrated loudness near ~-14 LUFS is good ───
    let audioScore: number;
    {
      const loud = await measureLoudness(videoPath);
      if (loud === null) {
        audioScore = 0.5;
        suggestions.push({
          component: 'audio',
          severity: 'needs_work',
          suggestion_text: 'Could not measure loudness (low-confidence audio score)',
        });
        log('audio: loudness unavailable → neutral 0.5');
      } else {
        const lufs = loud.integratedLufs;
        const delta = Math.abs(lufs - -14);
        // Within 2 LUFS of -14 is great; degrade with distance; silence (<-50) fails.
        if (lufs <= -50) {
          audioScore = 0.1;
        } else if (delta <= 2) {
          audioScore = 1.0;
        } else if (delta <= 5) {
          audioScore = 0.7;
        } else if (delta <= 9) {
          audioScore = 0.45;
        } else {
          audioScore = 0.25;
        }
        log(`audio: ${lufs} LUFS (Δ${delta.toFixed(1)} from -14) → ${audioScore}`);
        if (audioScore < 0.7) {
          suggestions.push({
            component: 'audio',
            severity: verdictFromScore(audioScore),
            suggestion_text:
              lufs <= -50
                ? 'Audio appears silent or extremely quiet — check the voice/music mix.'
                : `Normalise loudness toward -14 LUFS (currently ${lufs} LUFS).`,
          });
        }
      }
    }
    const audioVerdict = verdictFromScore(audioScore);

    // ─── 9) Thumbnail: from the vision sub-score (neutral on miss) ───
    let thumbnailScore: number;
    if (vision) {
      thumbnailScore = clamp01(vision.thumbnail.score);
      if (thumbnailScore < 0.7) {
        suggestions.push({ component: 'thumbnail', severity: verdictFromScore(thumbnailScore), suggestion_text: vision.thumbnail.note });
      }
    } else {
      thumbnailScore = 0.5;
      suggestions.push({
        component: 'thumbnail',
        severity: 'needs_work',
        suggestion_text: 'Vision QA unavailable — could not assess thumbnail stopping power (low-confidence).',
      });
    }
    const thumbnailVerdict = verdictFromScore(thumbnailScore);

    // ─── 10) Title: pure heuristic (length band + curiosity cue + keyword overlap) ───
    let titleScore: number;
    {
      const t = title.trim();
      const len = t.length;
      // length band ~20–70 chars is healthy for a short title
      let lengthScore: number;
      if (len === 0) lengthScore = 0;
      else if (len < 15) lengthScore = 0.3;
      else if (len <= 70) lengthScore = 1.0;
      else if (len <= 90) lengthScore = 0.6;
      else lengthScore = 0.35;
      // curiosity cue: a number or a question/curiosity marker
      const hasNumber = /\d/.test(t);
      const hasCuriosity = /\?|how|why|secret|never|stop|best|this/i.test(t);
      const cueScore = hasNumber || hasCuriosity ? 1.0 : 0.4;
      // keyword overlap with niche keywords
      const lowerT = t.toLowerCase();
      const overlap =
        nicheKeywords.length === 0
          ? 1.0
          : nicheKeywords.filter((kw) => lowerT.includes(kw)).length / nicheKeywords.length;
      titleScore = clamp01(0.45 * lengthScore + 0.3 * cueScore + 0.25 * overlap);
      log(`title: len=${len} num=${hasNumber} curiosity=${hasCuriosity} overlap=${overlap.toFixed(2)} → ${titleScore.toFixed(2)}`);
      const tv = verdictFromScore(titleScore);
      if (tv !== 'pass') {
        const tips: string[] = [];
        if (len === 0) tips.push('add a title');
        else if (len < 15) tips.push('lengthen the title (aim 20–70 chars)');
        else if (len > 70) tips.push('shorten the title (aim 20–70 chars)');
        if (!hasNumber && !hasCuriosity) tips.push('add a number or curiosity hook');
        if (nicheKeywords.length > 0 && overlap < 1) tips.push('work in a niche keyword');
        suggestions.push({
          component: 'title',
          severity: tv,
          suggestion_text: `Improve the title: ${tips.join('; ') || 'tighten for stopping power'}.`,
        });
      }
    }
    const titleVerdict = verdictFromScore(titleScore);

    // ─── 11) Description SEO (pure) — the real YouTube description (what upload.ts
    // actually ships); falls back to a title + script proxy when it's not set yet. ───
    const realDescription = (yv.description as string | null)?.trim();
    const descriptionForSeo = realDescription || `${title} ${script.slice(0, 200)}`.trim();
    const descRes = scoreDescriptionSeo({ description: descriptionForSeo, nicheKeywords });
    const descriptionSeoScore = descRes.score;
    const descriptionSeoVerdict = descRes.verdict;
    suggestions.push(...descRes.suggestions);
    log(`description_seo: ${descriptionSeoScore.toFixed(2)} (${descriptionSeoVerdict})`);

    // ─── 12) Hook (pure) — first ~12 words of script, nudged by vision ───
    const firstWords = script.trim().split(/\s+/).slice(0, 12).join(' ');
    const hookRes = scoreHookFromTranscript({ firstThreeSecondsText: firstWords });
    let hookScore = hookRes.score;
    if (vision) {
      hookScore = clamp01(0.6 * hookRes.score + 0.4 * vision.hook.score);
    }
    const hookVerdict = verdictFromScore(hookScore);
    // keep the pure hook suggestion if the (possibly nudged) verdict isn't a pass
    if (hookVerdict !== 'pass') {
      suggestions.push(...hookRes.suggestions);
      if (vision && vision.hook.score < 0.5) {
        suggestions.push({ component: 'hook', severity: hookVerdict, suggestion_text: vision.hook.note });
      }
    }
    log(`hook: pure=${hookRes.score.toFixed(2)} blended=${hookScore.toFixed(2)} (${hookVerdict})`);

    // ─── 13) Strengths: any component scoring high gets a positive note ───
    const pushStrength = (component: string, score: number, text: string) => {
      if (score >= 0.7) strengths.push({ component, what_works_text: text });
    };
    pushStrength('title', titleScore, 'Title is well-sized with a clear hook.');
    pushStrength('thumbnail', thumbnailScore, vision ? vision.thumbnail.note : 'Thumbnail reads well.');
    pushStrength('hook', hookScore, 'Opening creates an immediate curiosity gap.');
    pushStrength('pacing', pacingScore, 'Cut rhythm sits in a healthy short-form band.');
    pushStrength('description_seo', descriptionSeoScore, 'Description covers niche keywords at a good length.');
    pushStrength('audio', audioScore, 'Loudness is close to the -14 LUFS target.');
    pushStrength('visual', visualScore, vision ? vision.visual.note : 'On-spec 1080x1920 vertical at a clean frame rate.');

    // ─── 14) Overall roll-up ───
    const overallVerdict = rollUpOverall([
      titleVerdict,
      thumbnailVerdict,
      hookVerdict,
      pacingVerdict,
      descriptionSeoVerdict,
      audioVerdict,
      visualVerdict,
    ]);
    log(`overall verdict: ${overallVerdict}`);

    const review = {
      yourVideoId: payload.your_video_id,
      titleScore,
      titleVerdict,
      thumbnailScore,
      thumbnailVerdict,
      hookScore,
      hookVerdict,
      pacingScore,
      pacingVerdict,
      descriptionSeoScore,
      descriptionSeoVerdict,
      audioScore,
      audioVerdict,
      visualScore,
      visualVerdict,
      overallVerdict,
      suggestions,
      strengths,
      model: 'review-heuristic-v1' as const,
      promptVersion: 'g1' as const,
    };

    return { review, debug_trace: trace.join('\n') };
  }
}
