// scripts/render-worker/lib/cartesia.ts
//
// Cartesia TTS client. Uses the /tts/sse endpoint with add_timestamps so we get back the
// exact per-WORD start/end times — used downstream to place each image precisely when its
// words are spoken (tight sync). Audio comes as base64 raw PCM chunks which we assemble into
// a WAV. The `words` array contains the input tokens (whitespace-split) in order.
import { writeFile } from 'node:fs/promises';

const SAMPLE_RATE = 44100;
const CHANNELS = 1;
const BITS = 16;

export interface WordTime { word: string; start: number; end: number }

// Wrap raw little-endian PCM in a minimal WAV container.
function wavWrap(pcm: Buffer): Buffer {
  const blockAlign = (CHANNELS * BITS) / 8;
  const byteRate = SAMPLE_RATE * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function synthesizeToWav(args: {
  script: string;
  voiceId: string;
  outputPath: string;
  /** Cartesia pace control: "slowest"|"slow"|"normal"|"fast"|"fastest". Optional; omit for default. */
  speed?: string;
}): Promise<{ durationSeconds: number; words: WordTime[] }> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new Error('CARTESIA_API_KEY must be set');

  const res = await fetch('https://api.cartesia.ai/tts/sse', {
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
      ...(args.speed ? { speed: args.speed } : {}),
      add_timestamps: true,
      output_format: { container: 'raw', sample_rate: SAMPLE_RATE, encoding: 'pcm_s16le' },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Cartesia TTS failed ${res.status}: ${await res.text()}`);

  const body = await res.text();
  const pcmChunks: Buffer[] = [];
  const words: WordTime[] = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    let evt: { type?: string; data?: string; word_timestamps?: { words: string[]; start: number[]; end: number[] } };
    try { evt = JSON.parse(payload); } catch { continue; }
    if (evt.type === 'chunk' && evt.data) {
      pcmChunks.push(Buffer.from(evt.data, 'base64'));
    } else if (evt.type === 'timestamps' && evt.word_timestamps) {
      const wt = evt.word_timestamps;
      for (let i = 0; i < wt.words.length; i++) {
        words.push({ word: wt.words[i], start: wt.start[i], end: wt.end[i] });
      }
    }
  }
  const pcm = Buffer.concat(pcmChunks);
  if (pcm.length === 0) throw new Error('Cartesia TTS returned no audio');
  await writeFile(args.outputPath, wavWrap(pcm));

  const durationSeconds = pcm.length / (SAMPLE_RATE * ((CHANNELS * BITS) / 8));
  return { durationSeconds, words };
}
