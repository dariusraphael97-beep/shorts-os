// scripts/render-worker/lib/elevenlabs.ts
// ElevenLabs TTS client. Uses the /with-timestamps endpoint so we get character-level alignment,
// which we fold into word timestamps (for tight image sync, same as the Cartesia path). Audio
// comes back as base64 mp3 → written and transcoded to a 44.1kHz mono WAV to match the pipeline.
import { writeFile } from 'node:fs/promises';
import { runFfmpeg } from './ffmpeg-commands.ts';
import { wordsFromCharAlignment, type WordTime } from './beat-timing.ts';

const API = 'https://api.elevenlabs.io/v1/text-to-speech';
const MODEL = 'eleven_multilingual_v2';

interface ElevenResponse {
  audio_base64: string;
  alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
}

export async function synthesizeToWav(args: {
  script: string;
  voiceId: string;
  outputPath: string;
  /** Numeric pace 0.7–1.2 (ElevenLabs voice_settings.speed); omit for default. */
  speed?: number;
}): Promise<{ durationSeconds: number; words: WordTime[] }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY must be set');

  const voiceSettings: Record<string, number> = { stability: 0.5, similarity_boost: 0.75 };
  if (args.speed) voiceSettings.speed = Math.min(1.2, Math.max(0.7, args.speed));

  const res = await fetch(`${API}/${args.voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: args.script, model_id: MODEL, voice_settings: voiceSettings }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS failed ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const j = (await res.json()) as ElevenResponse;
  const mp3Path = args.outputPath.replace(/\.wav$/, '') + '.mp3';
  await writeFile(mp3Path, Buffer.from(j.audio_base64, 'base64'));
  // Transcode mp3 → 44.1kHz mono PCM WAV so it concatenates with the rest of the pipeline.
  await runFfmpeg(['-y', '-i', mp3Path, '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', args.outputPath]);

  const a = j.alignment;
  const words = wordsFromCharAlignment(a.characters, a.character_start_times_seconds, a.character_end_times_seconds);
  const ends = a.character_end_times_seconds;
  const durationSeconds = ends.length ? ends[ends.length - 1] : 0;
  return { durationSeconds, words };
}
