// scripts/render-worker/lib/claude-vision.ts
//
// Calls Claude Haiku 4.5 with the extracted frames + transcript and returns
// a structured {description, tags} object constrained to the niche tag vocabulary.
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';

export const ClipDescriptionSchema = z.object({
  description: z.string().min(1).max(800),
  tags: z.array(z.string()).max(10),
});
export type ClipDescription = z.infer<typeof ClipDescriptionSchema>;

export async function describeClipFromFrames(args: {
  framePaths: string[];
  transcript: string | null;
  nicheSlug: string;
  nicheTagVocabulary: string[];
}): Promise<ClipDescription> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY must be set');
  const anthropic = createAnthropic({ apiKey });
  const model = anthropic('claude-haiku-4-5');

  const frameBuffers = await Promise.all(args.framePaths.map((p) => readFile(p)));
  const vocab = args.nicheTagVocabulary.length > 0
    ? `Choose tags from this vocabulary only: ${args.nicheTagVocabulary.join(', ')}.`
    : `Tags should be 1-3-word lowercase snake_case strings relevant to the ${args.nicheSlug} niche.`;

  const result = await generateObject({
    model,
    schema: ClipDescriptionSchema,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              `You are analyzing a short clip for a "${args.nicheSlug}" content channel.`,
              ``,
              `Frames are extracted at fixed intervals; treat them as a storyboard.`,
              args.transcript ? `Transcript:\n${args.transcript.slice(0, 4000)}` : `Transcript: (no captions/audio available)`,
              ``,
              `Produce JSON with:`,
              `- description: a one-paragraph factual summary of what happens in the clip (max 800 chars). No editorializing.`,
              `- tags: 3-6 short tags. ${vocab}`,
            ].join('\n'),
          },
          ...frameBuffers.map((buf) => ({
            type: 'image' as const,
            image: buf,
          })),
        ],
      },
    ],
  });
  return result.object;
}

const PhotoVetSchema = z.object({ usable: z.boolean(), reason: z.string() });

// Vision check: is this downloaded candidate a real, clean, relevant photo usable as a full-frame 16:9 background?
export async function vetPhoto(args: { imagePath: string; subject: string }): Promise<{ usable: boolean; reason: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { usable: false, reason: 'no api key' };
  try {
    const anthropic = createAnthropic({ apiKey });
    const buf = await readFile(args.imagePath);
    const result = await generateObject({
      model: anthropic('claude-haiku-4-5'),
      schema: PhotoVetSchema,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `Is this a REAL photograph (NOT a 3D render, illustration, diagram, logo, collage, screenshot, or watermarked stock thumbnail) that clearly shows "${args.subject}" as a single, centered, full-frame subject usable as a 16:9 video background? Reject if it is irrelevant to the subject, low-resolution/thumbnail, a multi-panel collage, heavily watermarked, or not actually a photo. Return JSON { "usable": boolean, "reason": string }.` },
          { type: 'image' as const, image: buf },
        ],
      }],
    });
    return PhotoVetSchema.parse(result.object);
  } catch (e) {
    return { usable: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
