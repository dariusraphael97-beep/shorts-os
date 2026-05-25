// scripts/render-worker/lib/cartesia.ts
//
// Minimal Cartesia TTS client. Phase 1 uses a single fixed voice; Phase 2 wires
// the Voice Coach's pick.
import { writeFile } from 'node:fs/promises';

export async function synthesizeToWav(args: {
  script: string;
  voiceId: string;
  outputPath: string;
}): Promise<{ durationSeconds: number }> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new Error('CARTESIA_API_KEY must be set');

  // Cartesia REST: POST /tts/bytes with body { transcript, voice: { mode: 'id', id }, output_format: { container: 'wav', sample_rate, encoding } }
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
  });
  if (!res.ok) throw new Error(`Cartesia TTS failed ${res.status}: ${await res.text()}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(args.outputPath, buffer);

  // Crude duration estimate: WAV PCM s16le @ 44100 Hz mono = 88200 bytes/sec.
  // Header is 44 bytes. Phase 2 will replace with ffprobe.
  const durationSeconds = Math.max(1, (buffer.length - 44) / 88200);
  return { durationSeconds };
}
