// scripts/render-worker/handlers/render-f1.ts
//
// Phase 1: minimal F1 render. Cartesia TTS the script over a black 1080x1920
// background, no captions, no Pexels, no music. Goal is benchmarking the
// FSM + Sandbox cold start + ffmpeg + Blob upload — not a publishable video.
// Phase 2 replaces this with the full pipeline.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { synthesizeToWav } from '../lib/cartesia.ts';
import { renderBlackBackgroundWithAudio } from '../lib/ffmpeg-commands.ts';
import { uploadMp4ToBlob } from '../lib/blob.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function runRenderF1(job: { id: string; payload: unknown }, supabase: SupabaseClient): Promise<Record<string, unknown>> {
  const payload = job.payload as { your_video_id: string };
  const { data: yv, error } = await supabase
    .from('your_videos').select('script, voice_id, channel_id').eq('id', payload.your_video_id).single();
  if (error || !yv) throw new Error(`your_videos row not found: ${error?.message}`);
  const voiceId = yv.voice_id ?? 'sonic-narrator-male-deadpan';

  const workDir = await mkdtemp(join(tmpdir(), 'render-f1-'));
  const audioPath = join(workDir, 'voice.wav');
  const videoPath = join(workDir, 'out.mp4');

  const { durationSeconds } = await synthesizeToWav({
    script: yv.script, voiceId, outputPath: audioPath,
  });
  await renderBlackBackgroundWithAudio({
    audioPath, durationSeconds: Math.ceil(durationSeconds), outputPath: videoPath,
  });
  const blobUrl = await uploadMp4ToBlob(videoPath, `renders/${payload.your_video_id}.mp4`);

  return { render_artifact_url: blobUrl, duration_seconds_actual: durationSeconds };
}
