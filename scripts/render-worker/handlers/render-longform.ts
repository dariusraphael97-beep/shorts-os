// scripts/render-worker/handlers/render-longform.ts
// Chapter-batched longform render: chunked TTS per chapter, one image per beat (Higgsfield
// or gradient fallback), Ken-Burns landscape clips, per-chapter compose, concat, subtle music
// bed, chapter markers. Idempotent per chapter so a failed chapter is resumable.
import type { SupabaseClient } from '@supabase/supabase-js';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { synthesizeChapterToWav } from '../lib/cartesia-longform.ts';
import { generateImage } from '../lib/higgsfield.ts';
import { renderGradientStill, renderKenBurnsClip, renderStaticClip, muxChapterAudio, concatChapterClips, muxMusicBed } from '../lib/ffmpeg-longform.ts';
import { runFfmpeg } from '../lib/ffmpeg-commands.ts';
import { buildChapterMarkers } from '../lib/chapters.ts';
import { probeDurationSeconds } from '../lib/probe.ts';
import { uploadMp4ToBlob } from '../lib/blob.ts';
import { pickAndDownloadMusic } from '../lib/music.ts';

export class RenderLongformError extends Error {
  constructor(message: string, public trace: string) {
    super(message);
    this.name = 'RenderLongformError';
  }
}

const KEN_BURNS_DIRECTIONS = ['in', 'right', 'in', 'left'] as const;

// Higgsfield/GPT-Image-2 image gen is the bottleneck (~30s/img sequential). Generate a few at a
// time; kept low because the Higgsfield plan rate-limits concurrency (override via env if needed).
const IMAGE_CONCURRENCY = Math.max(1, Number(process.env.HIGGSFIELD_CONCURRENCY) || 3);

// Bounded-concurrency map that preserves input order in the results.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Per-preset gradient fallback colors (teal→amber for cinematic; neutral→accent for editorial;
// near-white "blank whiteboard" for the stick-figure doodle look).
const GRADIENT_COLORS: Record<string, { hexA: string; hexB: string }> = {
  'cinematic-realistic': { hexA: '0b2027', hexB: '8a5a2b' },
  'editorial-graphic': { hexA: '121316', hexB: '2b6cb0' },
  'stick-figure-animated': { hexA: 'f7f7f2', hexB: 'e4e4dc' },
};

interface PlanBeat { index: number; estDurationSeconds: number; imagePrompt: string; negativePrompt: string }
interface PlanChapter { index: number; title: string; narration: string; beats: PlanBeat[] }
interface LongformPlan {
  presetId: string;
  styleBible: { kenBurnsZoom: number };
  voice: { voiceId: string; speed: number };
  chapters: PlanChapter[];
}

// Map the plan's numeric narration speed to Cartesia's pace enum.
function cartesiaSpeed(n: number): string {
  if (n <= 0.93) return 'slow';
  if (n >= 1.07) return 'fast';
  return 'normal';
}

export interface RenderLongformOptions {
  /** Render only the first N chapters — for cost-bounded local proof renders. */
  maxChapters?: number;
  /** Cap beats (images) per chapter — for cost-bounded proofs. Beats still scale to fill the chapter VO. */
  maxBeatsPerChapter?: number;
  /** Skip the Blob upload and return a local file:// path — for local proof renders with no Blob token. */
  skipUpload?: boolean;
}

export async function runRenderLongform(
  job: { id: string; payload: unknown },
  supabase: SupabaseClient,
  opts: RenderLongformOptions = {},
): Promise<Record<string, unknown>> {
  const trace: string[] = [];
  const log = (m: string) => { trace.push(`[${new Date().toISOString()}] ${m}`); };
  try {
    const payload = job.payload as { your_video_id: string };
    log(`render-longform start video=${payload.your_video_id}`);

    const { data: video, error } = await supabase
      .from('your_videos')
      .select('id, longform_plan, style_preset_id')
      .eq('id', payload.your_video_id)
      .single();
    if (error || !video) throw new Error(`load draft: ${error?.message ?? 'not found'}`);
    const plan = video.longform_plan as unknown as LongformPlan;
    const presetId = video.style_preset_id ?? plan.presetId;
    const gradient = GRADIENT_COLORS[presetId] ?? GRADIENT_COLORS['cinematic-realistic'];
    const zoom = plan.styleBible?.kenBurnsZoom ?? 0.05;

    const workDir = join('/tmp', `lf_${payload.your_video_id}`);
    await mkdir(workDir, { recursive: true });

    const chapterClipPaths: string[] = [];
    const chapterDurations: number[] = [];
    const chapterTitles: string[] = [];

    const chapters = opts.maxChapters != null ? plan.chapters.slice(0, opts.maxChapters) : plan.chapters;
    if (opts.maxChapters != null) log(`proof mode: rendering ${chapters.length}/${plan.chapters.length} chapters`);

    for (const chapter of chapters) {
      const chapterClip = join(workDir, `chapter_${chapter.index}.mp4`);
      chapterTitles.push(chapter.title);
      // Resumability: skip a chapter already rendered on a prior attempt.
      if (existsSync(chapterClip)) {
        log(`chapter ${chapter.index} already rendered — reusing`);
        chapterClipPaths.push(chapterClip);
        chapterDurations.push(await probeDurationSeconds(chapterClip));
        continue;
      }

      // 1. Chapter voiceover (chunked). Apply the picked pace (Cartesia pace enum from plan speed).
      const vo = await synthesizeChapterToWav({
        narration: chapter.narration,
        voiceId: plan.voice.voiceId,
        workDir,
        chapterIndex: chapter.index,
        speed: cartesiaSpeed(plan.voice.speed),
      });
      log(`chapter ${chapter.index} VO ${vo.durationSeconds.toFixed(1)}s`);

      // 2. Rescale beat durations to fill the real VO length (alignment without Whisper in L1).
      const beats = opts.maxBeatsPerChapter != null ? chapter.beats.slice(0, opts.maxBeatsPerChapter) : chapter.beats;
      const estTotal = beats.reduce((s, b) => s + b.estDurationSeconds, 0) || 1;
      const scale = vo.durationSeconds / estTotal;

      // 3a. Generate all beat images CONCURRENTLY (bounded) — image gen is the ~30s/img bottleneck.
      //     Each task degrades to a style gradient on failure so one bad beat never fails the render.
      const imgPaths = await mapWithConcurrency(beats, IMAGE_CONCURRENCY, async (beat) => {
        const imgPath = join(workDir, `ch${chapter.index}_beat${beat.index}.png`);
        const gen = await generateImage({
          prompt: beat.imagePrompt,
          negativePrompt: beat.negativePrompt,
          outputPath: imgPath,
          aspect: '16:9',
          presetId,
        });
        if (!gen.ok) await renderGradientStill({ ...gradient, outputPath: imgPath });
        return imgPath;
      });

      // 3b. Render each still into its clip, in beat order (local ffmpeg — fast).
      const beatClipPaths: string[] = [];
      for (let i = 0; i < beats.length; i++) {
        const beat = beats[i];
        const beatDur = Math.max(0.5, beat.estDurationSeconds * scale);
        const clip = join(workDir, `ch${chapter.index}_beat${beat.index}.mp4`);
        if (zoom > 0) {
          await renderKenBurnsClip({
            imagePath: imgPaths[i],
            durationSeconds: beatDur,
            direction: KEN_BURNS_DIRECTIONS[beat.index % KEN_BURNS_DIRECTIONS.length],
            zoom,
            outputPath: clip,
          });
        } else {
          // zoom == 0 (e.g. stick-figure): static hold, zero zoompan jitter.
          await renderStaticClip({ imagePath: imgPaths[i], durationSeconds: beatDur, outputPath: clip });
        }
        beatClipPaths.push(clip);
      }
      log(`chapter ${chapter.index} rendered ${beatClipPaths.length} beats`);

      // 4. Concat beat clips → silent chapter video, then mux the chapter VO.
      const silent = join(workDir, `chapter_${chapter.index}_silent.mp4`);
      const listPath = join(workDir, `chapter_${chapter.index}_list.txt`);
      await writeFile(listPath, beatClipPaths.map((p) => `file '${p}'`).join('\n') + '\n', 'utf8');
      await runFfmpeg([
        '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-an',
        silent,
      ]);
      await muxChapterAudio({ videoPath: silent, voicePath: vo.wavPath, outputPath: chapterClip });

      chapterClipPaths.push(chapterClip);
      chapterDurations.push(await probeDurationSeconds(chapterClip));
    }

    // 5. Concat chapters → one continuous video with baked VO.
    const concatPath = join(workDir, 'concat.mp4');
    await concatChapterClips({
      clipPaths: chapterClipPaths,
      listPath: join(workDir, 'chapters_list.txt'),
      outputPath: concatPath,
    });
    const totalDuration = await probeDurationSeconds(concatPath);

    // 6. Subtle music bed (best-effort — render still succeeds without music).
    // The stick-figure doodle style runs voice-only (Zenn uses no music bed; it read as a "hum").
    const finalPath = join(workDir, 'final.mp4');
    const wantsMusic = presetId !== 'stick-figure-animated';
    const music = wantsMusic
      ? await pickAndDownloadMusic({ supabase, outputPath: join(workDir, 'music.mp3') }).catch(() => null)
      : null;
    if (music) {
      await muxMusicBed({ videoPath: concatPath, musicPath: music.outputPath, durationSeconds: totalDuration, outputPath: finalPath });
    } else {
      await runFfmpeg(['-y', '-i', concatPath, '-c', 'copy', finalPath]);
      log(wantsMusic ? 'no music track available — voice only' : 'stick-figure preset: voice-only (no music bed)');
    }

    // 7. Upload + return.
    const chapterMarkers = buildChapterMarkers(chapterDurations, chapterTitles);
    const blobUrl = opts.skipUpload
      ? `file://${finalPath}`
      : await uploadMp4ToBlob(finalPath, `renders/longform/${payload.your_video_id}.mp4`);
    const durationActual = await probeDurationSeconds(finalPath);
    log(`done ${durationActual.toFixed(1)}s → ${blobUrl}`);

    return {
      render_artifact_url: blobUrl,
      duration_seconds_actual: durationActual,
      chapter_markers: chapterMarkers,
      debug_trace: trace.join('\n'),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    trace.push(`ERROR: ${msg}`);
    throw new RenderLongformError(msg, trace.join('\n'));
  }
}
