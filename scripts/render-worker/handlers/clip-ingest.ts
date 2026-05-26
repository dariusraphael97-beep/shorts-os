// scripts/render-worker/handlers/clip-ingest.ts
//
// Phase 3: full clip_ingest handler.
//   1. yt-dlp download + auto-subs
//   2. ffprobe metadata (duration + width + height)
//   3. ffmpeg frame extraction + thumbnail
//   4. Whisper fallback transcript (only if no auto-subs)
//   5. Claude Haiku vision → {description, tags}
//   6. Blob upload (clip + thumb)
//   7. Return output for callback to insert clip_library row
//
// Trace pattern mirrors render-f1.ts:RenderF1Error so the callback handler can
// persist a per-stage timing string to render_jobs.last_error on both success
// and failure (Phase 2 lesson #3 — Sandbox stdout is unreachable).
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, stat, readFile } from 'node:fs/promises';
import { put } from '@vercel/blob';
import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadVideoAndAutoSubs } from '../lib/yt-dlp.ts';
import { probeDurationSeconds } from '../lib/probe.ts';
import { extractFramesAndThumbnail } from '../lib/frames.ts';
import { transcribeWavWithWordTimestamps } from '../lib/whisper.ts';
import { describeClipFromFrames } from '../lib/claude-vision.ts';

export class ClipIngestError extends Error {
  constructor(message: string, public trace: string) {
    super(message);
    this.name = 'ClipIngestError';
  }
}

interface ProbeResult {
  durationSeconds: number;
  width: number | null;
  height: number | null;
}

async function probeFull(videoPath: string): Promise<ProbeResult> {
  const durationSeconds = await probeDurationSeconds(videoPath);
  const { width, height } = await probeWidthHeight(videoPath);
  return { durationSeconds, width, height };
}

async function probeWidthHeight(videoPath: string): Promise<{ width: number | null; height: number | null }> {
  const ffprobeMod = await import('@ffprobe-installer/ffprobe');
  const { spawn } = await import('node:child_process');
  return await new Promise((resolve) => {
    const cp = spawn(ffprobeMod.default.path, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=s=x:p=0',
      videoPath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    cp.stdout.on('data', (b) => { out += b.toString(); });
    cp.on('close', () => {
      const m = out.trim().match(/^(\d+)x(\d+)$/);
      resolve(m ? { width: Number(m[1]), height: Number(m[2]) } : { width: null, height: null });
    });
  });
}

async function blobUpload(localPath: string, blobPath: string, contentType: string): Promise<string> {
  const buf = await readFile(localPath);
  const blob = await put(blobPath, buf, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
}

export async function runClipIngest(
  job: { id: string; payload: unknown },
  _supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const trace: string[] = [];
  const log = (msg: string) => {
    const line = `[clip_ingest] +${Date.now() - t0}ms ${msg}`;
    console.log(line);
    trace.push(line);
  };

  try {
    return await ingestInternal();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAILED: ${msg}`);
    throw new ClipIngestError(msg, trace.join('\n'));
  }

  async function ingestInternal(): Promise<Record<string, unknown>> {
    const payload = job.payload as {
      source_url: string;
      source_creator: string | null;
      niche_id: string;
      channel_id: string;
      added_by?: 'reddit_ingest' | 'manual';
      post_metadata?: unknown;
    };

    const workDir = await mkdtemp(join(tmpdir(), 'clip-ingest-'));
    const videoPath = join(workDir, 'clip.mp4');

    // 1) yt-dlp download + auto-subs
    log(`downloading ${payload.source_url}`);
    const { autoSubtitlesText } = await downloadVideoAndAutoSubs({
      sourceUrl: payload.source_url,
      outputPath: videoPath,
    });
    const videoStat = await stat(videoPath);
    log(`downloaded ${(videoStat.size / 1024 / 1024).toFixed(1)}MB; auto-subs=${autoSubtitlesText ? autoSubtitlesText.length + 'c' : 'none'}`);

    // 2) Probe
    const probe = await probeFull(videoPath);
    log(`probed: ${probe.durationSeconds}s ${probe.width}x${probe.height}`);
    if (probe.durationSeconds > 600) throw new Error(`duration ${probe.durationSeconds}s exceeds 600s cap`);
    if (probe.width && probe.height && probe.width / probe.height > 16 / 9 + 0.01) {
      throw new Error(`aspect ${probe.width}x${probe.height} wider than 16:9 — vertical/square only`);
    }

    // 3) Frames + thumbnail
    const framesDir = join(workDir, 'frames');
    const { framePaths, thumbnailPath } = await extractFramesAndThumbnail({
      videoPath, durationSeconds: probe.durationSeconds, outDir: framesDir,
    });
    log(`extracted ${framePaths.length} frames + 1 thumb`);

    // 4) Transcript: prefer auto-subs, else Whisper
    let transcript: string | null = autoSubtitlesText;
    if (!transcript) {
      try {
        const wavPath = join(workDir, 'audio.wav');
        await extractWav(videoPath, wavPath);
        const { words } = await transcribeWavWithWordTimestamps(wavPath);
        transcript = words.map((w) => w.word).join(' ');
        log(`whisper fallback transcribed ${words.length} words`);
      } catch (err) {
        log(`whisper failed; continuing without transcript: ${(err as Error).message}`);
        transcript = null;
      }
    }

    // 5) Claude vision → description + tags
    //    Phase 3 single-niche scope: nicheSlug hardcoded to 'cars',
    //    empty vocabulary lets Haiku pick concise snake_case tags.
    //    Phase 4 plumbs niche_id → niches.slug lookup through to here.
    const desc = await describeClipFromFrames({
      framePaths,
      transcript,
      nicheSlug: 'cars',
      nicheTagVocabulary: [],
    });
    log(`described: tags=[${desc.tags.join(',')}] desc.len=${desc.description.length}`);

    // 6) Blob upload (clip + thumb)
    const clipBlobUrl = await blobUpload(videoPath, `clip-library/${job.id}.mp4`, 'video/mp4');
    const thumbBlobUrl = await blobUpload(thumbnailPath, `clip-library/${job.id}.thumb.jpg`, 'image/jpeg');
    log(`uploaded clip=${clipBlobUrl} thumb=${thumbBlobUrl}`);

    return {
      source_url: payload.source_url,
      source_platform: 'reddit',
      source_creator: payload.source_creator,
      local_path: clipBlobUrl,
      thumbnail_url: thumbBlobUrl,
      duration_seconds: probe.durationSeconds,
      width: probe.width,
      height: probe.height,
      description: desc.description,
      tags: desc.tags,
      niche_id: payload.niche_id,
      added_by: payload.added_by ?? 'reddit_ingest',
      debug_trace: trace.join('\n'),
    };
  }
}

async function extractWav(srcMp4: string, outWav: string): Promise<void> {
  const ffmpegStatic = (await import('ffmpeg-static')).default;
  if (!ffmpegStatic) throw new Error('ffmpeg-static path missing');
  const { spawn } = await import('node:child_process');
  await new Promise<void>((resolve, reject) => {
    const cp = spawn(ffmpegStatic, [
      '-y', '-i', srcMp4,
      '-ac', '1', '-ar', '16000', '-vn', '-f', 'wav',
      outWav,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    cp.stderr.on('data', (b) => { stderr += b.toString(); });
    cp.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg wav extract exit ${code}: ${stderr.slice(-300)}`)));
  });
}
