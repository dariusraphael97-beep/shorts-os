// scripts/render-worker/handlers/render-f1.ts
//
// Phase 2: full Format-1 pipeline.
//   1. Cartesia TTS → voice.wav
//   2. For each shot in director's shot_list: Pexels download (or colored-bg
//      fallback) → normalize to 1080x1920
//   3. Groq Whisper word-level alignment → captions.srt (skip on miss)
//   4. Music pick (best-effort, null when music_tracks empty)
//   5. ffmpeg final compose: concat normalized shots, mux voice + music@25%,
//      burn captions
//   6. Blob upload
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { synthesizeToWav } from '../lib/cartesia.ts';
import {
  normalizeShot,
  renderColoredBackground,
  writeConcatList,
  finalCompose,
} from '../lib/ffmpeg-commands.ts';
import { uploadMp4ToBlob } from '../lib/blob.ts';
import { searchAndDownloadVertical } from '../lib/pexels.ts';
import { transcribeWavWithWordTimestamps } from '../lib/whisper.ts';
import { wordsToSrt } from '../lib/captions.ts';
import { pickAndDownloadMusic } from '../lib/music.ts';
import { probeDurationSeconds } from '../lib/probe.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

type ShotListEntry = { segment_text: string; broll_search_query: string; duration_seconds: number };

const FALLBACK_BG_COLORS = ['0x101418', '0x1a1d24', '0x0f1419', '0x14181c'];

export async function runRenderF1(
  job: { id: string; payload: unknown },
  supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const log = (msg: string) => console.log(`[render_f1] +${Date.now() - t0}ms ${msg}`);

  const payload = job.payload as { your_video_id: string };

  // ─── Load your_videos row + shot_list ───
  const { data: yv, error: yvErr } = await supabase
    .from('your_videos')
    .select('id, script, voice_id, channel_id, topic_queue_id')
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
        await normalizeShot({
          inputPath: rawPath,
          durationSeconds: shot.duration_seconds,
          outputPath: normPath,
        });
      } else {
        await renderColoredBackground({
          hexColor: FALLBACK_BG_COLORS[i % FALLBACK_BG_COLORS.length],
          durationSeconds: shot.duration_seconds,
          outputPath: normPath,
        });
      }
    } catch (err) {
      console.warn(`shot ${i} pexels/normalize failed; using fallback bg: ${(err as Error).message}`);
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
  let captionsPath: string | null = join(workDir, 'captions.srt');
  try {
    const { words } = await transcribeWavWithWordTimestamps(voicePath);
    const srt = wordsToSrt(words);
    if (srt.trim().length > 0) {
      await writeFile(captionsPath, srt);
      log(`captions wrote (${words.length} words)`);
    } else {
      captionsPath = null;
      log('captions skipped: empty word list');
    }
  } catch (err) {
    console.warn(`whisper failed; rendering without captions: ${(err as Error).message}`);
    captionsPath = null;
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
    console.warn(`music pick failed; rendering without bed: ${(err as Error).message}`);
  }

  // ─── Final compose ───
  const concatListPath = join(workDir, 'concat.txt');
  await writeConcatList(normalizedPaths, concatListPath);
  const outPath = join(workDir, 'out.mp4');
  await finalCompose({
    concatListPath,
    voicePath,
    musicPath,
    subtitlesPath: captionsPath,
    outputPath: outPath,
  });
  log('final compose done');

  const actualDuration = await probeDurationSeconds(outPath);

  // ─── Blob upload ───
  const blobUrl = await uploadMp4ToBlob(outPath, `renders/${payload.your_video_id}.mp4`);
  log(`uploaded to ${blobUrl}`);

  return {
    render_artifact_url: blobUrl,
    duration_seconds_actual: actualDuration,
  };
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

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id')
    .eq('job_type', 'produce_video')
    .filter('payload->>topicId', 'eq', yv.topic_queue_id)
    .order('created_at', { ascending: false })
    .limit(1);
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
