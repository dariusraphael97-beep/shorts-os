// scripts/render-worker/lib/elevenlabs-sfx.ts
// ElevenLabs text-to-sound-effects (sound design). Generates a short SFX clip (mp3) from a text
// prompt like "a hawk screech" — mixed into the chapter audio at the matching scene's timestamp.
import { writeFile } from 'node:fs/promises';

const API = 'https://api.elevenlabs.io/v1/sound-generation';

export async function generateSoundEffect(args: {
  text: string;
  durationSeconds: number;
  outputPath: string;
}): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY must be set');
  const duration = Math.min(22, Math.max(0.5, args.durationSeconds));
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: args.text, duration_seconds: duration, prompt_influence: 0.4 }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs SFX failed ${res.status}: ${(await res.text()).slice(0, 160)}`);
  await writeFile(args.outputPath, Buffer.from(await res.arrayBuffer()));
}
