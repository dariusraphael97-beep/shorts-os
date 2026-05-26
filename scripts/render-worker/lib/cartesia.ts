// scripts/render-worker/lib/cartesia.ts
//
// Minimal Cartesia TTS client. Phase 1 used a single fixed voice; Phase 2 wires
// the Voice Coach's pick (after Voice Coach defaults to channel.default_voice_id
// in 95% of cases). Duration comes from ffprobe rather than guessing from
// WAV bytes, so any future encoding switch (stereo, different sample rate)
// stays correct.
import { writeFile } from 'node:fs/promises';
import { probeDurationSeconds } from './probe.ts';

export async function synthesizeToWav(args: {
  script: string;
  voiceId: string;
  outputPath: string;
}): Promise<{ durationSeconds: number }> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new Error('CARTESIA_API_KEY must be set');

  const res = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Cartesia-Version': '2025-04-16',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: 'sonic-2',
      transcript: args.script,
      voice: { mode: 'id', id: args.voiceId },
      output_format: { container: 'wav', sample_rate: 44100, encoding: 'pcm_s16le' },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Cartesia TTS failed ${res.status}: ${await res.text()}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(args.outputPath, buffer);

  const durationSeconds = await probeDurationSeconds(args.outputPath);
  return { durationSeconds };
}
