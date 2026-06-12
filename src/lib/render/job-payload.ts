import { z } from 'zod';

export const ClipIngestPayload = z.object({
  source_url: z.string().url(),
  niche_id: z.string().uuid(),
  source_creator: z.string().nullable().optional(),
});
export type ClipIngestPayload = z.infer<typeof ClipIngestPayload>;

export const RenderF1Payload = z.object({
  your_video_id: z.string().uuid(),
});
export type RenderF1Payload = z.infer<typeof RenderF1Payload>;

export const RenderF2Payload = z.object({
  compilation_draft_id: z.string().uuid(),
});
export type RenderF2Payload = z.infer<typeof RenderF2Payload>;

export const UploadPayload = z.object({
  your_video_id: z.string().uuid(),
});
export type UploadPayload = z.infer<typeof UploadPayload>;

export const RenderLongformPayload = z.object({
  your_video_id: z.string().uuid(),
});
export type RenderLongformPayload = z.infer<typeof RenderLongformPayload>;

export function parseJobPayload(jobType: string, payload: unknown) {
  switch (jobType) {
    case 'clip_ingest': return ClipIngestPayload.parse(payload);
    case 'render_f1':   return RenderF1Payload.parse(payload);
    case 'render_f2':   return RenderF2Payload.parse(payload);
    case 'upload':      return UploadPayload.parse(payload);
    default: throw new Error(`Unknown job_type: ${jobType}`);
  }
}
