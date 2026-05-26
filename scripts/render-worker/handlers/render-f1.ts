// scripts/render-worker/handlers/render-f1.ts
//
// Phase 2.5: full Format-1 pipeline.
//   1. Cartesia TTS → voice.wav
//   2. For each shot in director's shot_list: Pexels download (or colored-bg
//      fallback) → normalize to 1080x1920
//   3. Groq Whisper word-level alignment (skip on miss → no captions)
//   4. Music pick (best-effort, null when music_tracks empty)
//   5. ffmpeg base compose: concat normalized shots, mux voice + music@25%,
//      NO captions (base.mp4)
//   6. Remotion captions overlay → transparent ProRes 4444 (captions.mov)
//      Falls back gracefully: Whisper miss or Remotion fail → base.mp4 is final
//   7. ffmpeg composite: overlay captions.mov onto base.mp4 → out.mp4
//   8. Blob upload
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { synthesizeToWav } from '../lib/cartesia.ts';
import {
  normalizeShot,
  renderColoredBackground,
  writeConcatList,
  composeBase,
  compositeBaseAndOverlay,
} from '../lib/ffmpeg-commands.ts';
import { renderRemotionOverlay } from '../lib/remotion.ts';
import { uploadMp4ToBlob } from '../lib/blob.ts';
import { searchAndDownloadVertical } from '../lib/pexels.ts';
import { transcribeWavWithWordTimestamps } from '../lib/whisper.ts';
import { pickAndDownloadMusic } from '../lib/music.ts';
import { probeDurationSeconds } from '../lib/probe.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

type ShotListEntry = { segment_text: string; broll_search_query: string; duration_seconds: number };

const FALLBACK_BG_COLORS = ['0x101418', '0x1a1d24', '0x0f1419', '0x14181c'];

export class RenderF1Error extends Error {
  constructor(message: string, public trace: string) {
    super(message);
    this.name = 'RenderF1Error';
  }
}

export async function runRenderF1(
  job: { id: string; payload: unknown },
  supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const trace: string[] = [];
  const log = (msg: string) => {
    const line = `[render_f1] +${Date.now() - t0}ms ${msg}`;
    console.log(line);
    trace.push(line);
  };

  try {
    return await renderInternal();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAILED: ${msg}`);
    throw new RenderF1Error(msg, trace.join('\n'));
  }

  async function renderInternal(): Promise<Record<string, unknown>> {

  const payload = job.payload as { your_video_id: string };

  // ─── Load your_videos row + shot_list ───
  const { data: yv, error: yvErr } = await supabase
    .from('your_videos')
    .select('id, script, voice_id, channel_id, topic_queue_id, caption_props')
    .eq('id', payload.your_video_id)
    .single();
  if (yvErr || !yv) throw new Error(`your_videos row not found: ${yvErr?.message ?? 'no row'}`);

  const shotList = await fetchShotList(supabase, yv.id);
  log(`loaded yv + shot_list (${shotList.length} shots)`);

  // ─── Cartesia TTS ───
  const workDir = await mkdtemp(join(tmpdir(), 'render-f1-'));
  const voicePath = join(workDir, 'voice.wav');
  if (!yv.voice_id) throw new Error('your_videos.voice_id is null');
  const { durationSeconds } = await synthesizeToWav({
    script: yv.script,
    voiceId: yv.voice_id,
    outputPath: voicePath,
  });
  log(`cartesia tts done (${durationSeconds.toFixed(1)}s)`);

  // ─── Per-shot: Pexels download → normalize ───
  const normalizedPaths: string[] = [];
  for (let i = 0; i < shotList.length; i++) {
    const shot = shotList[i];
    const rawPath = join(workDir, `shot_${i}.mp4`);
    const normPath = join(workDir, `norm_${i}.mp4`);
    try {
      const dl = await searchAndDownloadVertical({
        query: shot.broll_search_query,
        outputPath: rawPath,
      });
      if (dl) {
        log(`shot ${i}: pexels ok (${dl.width}x${dl.height}, vid ${dl.pexelsVideoId})`);
        await normalizeShot({
          inputPath: rawPath,
          durationSeconds: shot.duration_seconds,
          outputPath: normPath,
        });
        log(`shot ${i}: normalize ok → ${normPath}`);
      } else {
        log(`shot ${i}: pexels miss for "${shot.broll_search_query}" → colored bg`);
        await renderColoredBackground({
          hexColor: FALLBACK_BG_COLORS[i % FALLBACK_BG_COLORS.length],
          durationSeconds: shot.duration_seconds,
          outputPath: normPath,
        });
      }
    } catch (err) {
      log(`shot ${i}: ERROR ${(err as Error).message}`);
      await renderColoredBackground({
        hexColor: FALLBACK_BG_COLORS[i % FALLBACK_BG_COLORS.length],
        durationSeconds: shot.duration_seconds,
        outputPath: normPath,
      });
    }
    normalizedPaths.push(normPath);
  }
  log(`normalized ${normalizedPaths.length} shots`);

  // ─── Whisper forced-alignment ───
  let words: { word: string; start: number; end: number }[] = [];
  try {
    const transcription = await transcribeWavWithWordTimestamps(voicePath);
    words = transcription.words;
    log(`whisper got ${words.length} words`);
  } catch (err) {
    log(`whisper failed: ${(err as Error).message} (rendering without captions)`);
  }

  // ─── Music bed (best-effort) ───
  let musicPath: string | null = null;
  try {
    const music = await pickAndDownloadMusic({
      supabase,
      outputPath: join(workDir, 'music.mp3'),
    });
    if (music) {
      musicPath = music.outputPath;
      log(`music ready (track ${music.musicTrackId})`);
    } else {
      log('music skipped: no eligible tracks');
    }
  } catch (err) {
    log(`music pick failed: ${(err as Error).message}`);
  }

  // ─── Base compose (b-roll + voice + music, NO captions) ───
  const concatListPath = join(workDir, 'concat.txt');
  await writeConcatList(normalizedPaths, concatListPath);
  const basePath = join(workDir, 'base.mp4');
  await composeBase({
    concatListPath,
    voicePath,
    musicPath,
    outputPath: basePath,
  });
  log('base compose done');

  // ─── Remotion captions overlay ───
  const captionsPath = join(workDir, 'captions.mov');
  let captionsRendered = false;
  if (words.length > 0) {
    const captionProps = (yv.caption_props as Record<string, unknown> | null) ?? {
      variant: 'word-by-word',
      accent_color: '#FFD23F',
      accent_word_policy: 'first-noun',
      highlighted_words: [],
      animation_speed: 1.0,
      font_scale: 1.0,
    };
    const durationInFrames = Math.ceil(durationSeconds * 30);
    const result = await renderRemotionOverlay({
      compositionId: 'captions-word-by-word',
      props: { ...captionProps, words, durationSeconds },
      outputPath: captionsPath,
      durationInFrames,
    });
    if (result.exitCode === 0) {
      captionsRendered = true;
      log('captions overlay rendered');
    } else {
      log(`remotion render failed exit=${result.exitCode}: ${result.stderr.slice(-500)} (continuing without overlay)`);
    }
  } else {
    log('no whisper words — skipping captions overlay');
  }

  // ─── Final composite ───
  const outPath = join(workDir, 'out.mp4');
  if (captionsRendered) {
    await compositeBaseAndOverlay({
      basePath,
      overlayPath: captionsPath,
      outputPath: outPath,
    });
    log('composite done');
  } else {
    // No overlay — copy base to out
    const { copyFile } = await import('node:fs/promises');
    await copyFile(basePath, outPath);
    log('no overlay; using base as final output');
  }

  const actualDuration = await probeDurationSeconds(outPath);

  // ─── Blob upload ───
  const blobUrl = await uploadMp4ToBlob(outPath, `renders/${payload.your_video_id}.mp4`);
  log(`uploaded to ${blobUrl}`);

  return {
    render_artifact_url: blobUrl,
    duration_seconds_actual: actualDuration,
    debug_trace: trace.join('\n'),
  };
  }
}

async function fetchShotList(supabase: SupabaseClient, yourVideoId: string): Promise<ShotListEntry[]> {
  // Inlined to avoid importing from src/* (worker package can't reach Next.js code).
  // Mirrors src/lib/supabase/repositories/decisions.ts:getDirectorShotListForVideo.
  const { data: yv } = await supabase
    .from('your_videos')
    .select('topic_queue_id')
    .eq('id', yourVideoId)
    .single();
  if (!yv?.topic_queue_id) throw new Error('your_video has no topic_queue_id; cannot find shot_list');

  const { data: jobs, error: jobsErr } = await supabase
    .from('jobs')
    .select('id')
    .eq('kind', 'produce_video')
    .eq('topic_queue_id', yv.topic_queue_id)
    .order('created_at', { ascending: false })
    .limit(1);
  if (jobsErr) throw new Error(`fetchShotList jobs query: ${jobsErr.message}`);
  const jobRow = jobs?.[0];
  if (!jobRow) throw new Error('no produce_video job found for this topic');

  const { data: dec } = await supabase
    .from('decisions')
    .select('chosen')
    .eq('job_id', jobRow.id)
    .eq('agent_id', 'director')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  const list = (dec?.chosen as { shot_list?: unknown } | undefined)?.shot_list;
  if (!Array.isArray(list) || list.length === 0) throw new Error('director shot_list empty or missing');
  return list as ShotListEntry[];
}
