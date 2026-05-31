import "server-only";
import { generateObject } from "ai";
import type { AdapterResult } from "@/lib/ingestion/run";
import type { ShortsObservation } from "@/lib/supabase/repositories/shorts-observations";
import type { AudienceSignal, FormatLabel } from "@/lib/supabase/repositories/shorts-classifications";
import type { ClassificationRow, ClassifierDeps, ClassifierInput, SampleRow, TopicCall } from "@/lib/classifier/classify";
import { classifyBatch } from "@/lib/classifier/classify";
import { TopicBatchSchema, FormatResultSchema } from "@/lib/classifier/schemas";
import { getGatewayModel, CLASSIFIER_TOPIC_MODEL, CLASSIFIER_FORMAT_MODEL } from "@/lib/ai/models";
import { createTranscriptClient } from "@/lib/clients/youtube-transcript";

export const CLASSIFIER_PROMPT_VERSION = "d1";

function toInput(o: ShortsObservation): ClassifierInput {
  return {
    videoId: o.video_id, title: o.title, description: o.description,
    tags: Array.isArray(o.tags) ? (o.tags as unknown[]).map(String) : [],
    channelTitle: null, // shorts_observations doesn't carry channel title; intentionally null
    channelSubscriberCount: o.channel_subscriber_count,
    durationSeconds: o.duration_seconds, viewCount: o.view_count, likeCount: o.like_count,
    commentCount: o.comment_count, thumbnailUrl: o.thumbnail_url,
  };
}

/** Gateway-backed classifier deps (the real LLM boundary). */
export function buildGatewayDeps(): ClassifierDeps {
  const transcript = createTranscriptClient();
  return {
    topicModel: CLASSIFIER_TOPIC_MODEL,
    formatModel: CLASSIFIER_FORMAT_MODEL,
    promptVersion: CLASSIFIER_PROMPT_VERSION,
    async generateTopicBatch(items): Promise<TopicCall[]> {
      const { object } = await generateObject({
        model: getGatewayModel(CLASSIFIER_TOPIC_MODEL),
        schema: TopicBatchSchema,
        prompt:
          "Classify each YouTube Short by TOPIC (a 2-4 word noun phrase) and audience. " +
          "Return exactly one result per video, echoing its video_id. Videos:\n" +
          JSON.stringify(items.map((i) => ({ video_id: i.videoId, title: i.title, description: (i.description ?? "").slice(0, 300), tags: i.tags, transcript: (i.transcript ?? "").slice(0, 1200) || null }))),
      });
      return object.results.map((r) => ({
        videoId: r.video_id, topic_label: r.topic_label,
        audience_signal: r.audience_signal as AudienceSignal, confidence: r.confidence,
      }));
    },
    async generateFormat(item, thumbnailDataUrl) {
      const { object } = await generateObject({
        model: getGatewayModel(CLASSIFIER_FORMAT_MODEL),
        schema: FormatResultSchema,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `Classify this Short's FORMAT. Title: ${item.title}. Duration: ${item.durationSeconds ?? "?"}s.` },
            ...(thumbnailDataUrl ? [{ type: "image" as const, image: thumbnailDataUrl }] : []),
          ],
        }],
      });
      return { videoId: item.videoId, format_label: object.format_label as FormatLabel, confidence: object.confidence };
    },
    fetchTranscript: (id) => transcript.fetchTranscript(id),
    async fetchThumbnail(url) {
      if (!url) return null;
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get("content-type") ?? "image/jpeg";
        return `data:${ct};base64,${buf.toString("base64")}`;
      } catch { return null; }
    },
  };
}

export interface RunClassificationArgs {
  fetchQueue: (limit: number) => Promise<ShortsObservation[]>;
  upsertClassification: (row: ClassificationRow) => Promise<void>;
  insertSample: (row: SampleRow) => Promise<void>;
  deps: ClassifierDeps;
  limit: number;
}

export async function runClassification(args: RunClassificationArgs): Promise<AdapterResult> {
  const queue = await args.fetchQueue(args.limit);
  if (queue.length === 0) return { ingested: 0, skipped: 0, quotaUnits: 0, context: { classified: 0, sampled: 0, transcriptHits: 0 } };
  const out = await classifyBatch(queue.map(toInput), args.deps);
  for (const c of out.classifications) await args.upsertClassification(c);
  for (const s of out.samples) await args.insertSample(s);
  return {
    ingested: out.classifications.length,
    skipped: queue.length - out.classifications.length,
    quotaUnits: 0,
    context: { classified: out.classifications.length, sampled: out.samples.length, transcriptHits: out.transcriptHits },
  };
}
