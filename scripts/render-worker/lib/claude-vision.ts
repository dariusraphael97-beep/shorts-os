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

// ---------------------------------------------------------------------------
// assessFramesForReview (Plan 5 sub-phase G — Video Reviewer)
// ---------------------------------------------------------------------------
//
// A pre-publish QA vision pass over a rendered vertical short. Judges three
// dimensions on a 0–1 scale and returns a short note for each. Best-effort:
// returns null on ANY failure (missing key, model error, validation miss) so
// the review handler can fall back to neutral component scores.

const ReviewVisionSchema = z.object({
  thumbnail: z.object({
    score: z.number().min(0).max(1),
    note: z.string().min(1).max(280),
  }),
  hook: z.object({
    score: z.number().min(0).max(1),
    note: z.string().min(1).max(280),
  }),
  visual: z.object({
    score: z.number().min(0).max(1),
    note: z.string().min(1).max(280),
  }),
});
export type ReviewVisionAssessment = z.infer<typeof ReviewVisionSchema>;

export async function assessFramesForReview(args: {
  framePaths: string[];
  thumbnailPath: string;
  transcript: string | null;
}): Promise<ReviewVisionAssessment | null> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    const anthropic = createAnthropic({ apiKey });
    const model = anthropic('claude-haiku-4-5');

    const thumbBuf = await readFile(args.thumbnailPath);
    const frameBuffers = await Promise.all(args.framePaths.map((p) => readFile(p)));

    const result = await generateObject({
      model,
      schema: ReviewVisionSchema,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                `You are a pre-publish QA reviewer for a vertical (9:16) short-form video.`,
                ``,
                `The FIRST image is the proposed thumbnail. The remaining images are`,
                `frames sampled across the video in order — treat them as a storyboard.`,
                args.transcript
                  ? `Spoken transcript (for hook context):\n${args.transcript.slice(0, 2000)}`
                  : `Transcript: (none available)`,
                ``,
                `Score each dimension from 0 (terrible) to 1 (excellent) and give a`,
                `one-sentence note:`,
                `- thumbnail: stopping power — would this make a viewer stop scrolling?`,
                `  Consider clarity, contrast, focal subject, emotional/curiosity pull.`,
                `- hook: strength of the opening (the earliest frames + first words of`,
                `  the transcript). Does it create an immediate curiosity gap?`,
                `- visual: overall production/visual quality across the short —`,
                `  composition, legibility, consistency, polish for a vertical short.`,
              ].join('\n'),
            },
            { type: 'image' as const, image: thumbBuf },
            ...frameBuffers.map((buf) => ({
              type: 'image' as const,
              image: buf,
            })),
          ],
        },
      ],
    });
    return result.object;
  } catch {
    return null;
  }
}
