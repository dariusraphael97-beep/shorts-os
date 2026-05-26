import "server-only";
import { z } from "zod";

const WordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});
const ResponseSchema = z.object({
  text: z.string(),
  words: z.array(WordSchema).optional(),
});

export interface TimedWord { word: string; start: number; end: number; }

export async function transcribeWithWordTimestamps(
  audio: Blob,
  filename: string,
): Promise<{ words: TimedWord[] }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY must be set");

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Groq Whisper failed ${res.status}: ${await res.text()}`);
  const parsed = ResponseSchema.parse(await res.json());
  return { words: parsed.words ?? [] };
}
