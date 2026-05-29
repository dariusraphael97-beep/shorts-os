import type { FormatLabel, AudienceSignal } from "@/lib/supabase/repositories/shorts-classifications";
import type { TranscriptResult } from "@/lib/clients/youtube-transcript";

export interface ClassifierInput {
  videoId: string;
  title: string;
  description: string | null;
  tags: string[];
  channelTitle: string | null;
  channelSubscriberCount: number | null;
  durationSeconds: number | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string | null;
  /** Set by classifyBatch after the transcript fetch; consumed by the topic pass. */
  transcript?: string | null;
}

export interface TopicCall { videoId: string; topic_label: string; audience_signal: AudienceSignal; confidence: number }
export interface FormatCall { videoId: string; format_label: FormatLabel; confidence: number }

export interface ClassifierDeps {
  topicModel: string;
  formatModel: string;
  promptVersion: string;
  generateTopicBatch(items: ClassifierInput[]): Promise<TopicCall[]>;
  generateFormat(item: ClassifierInput, thumbnailDataUrl: string | null): Promise<FormatCall>;
  fetchTranscript(videoId: string): Promise<TranscriptResult | null>;
  fetchThumbnail(url: string | null): Promise<string | null>;
  rng?: () => number;
  formatConcurrency?: number;
  sampleRate?: number;
}

export interface ClassificationRow {
  videoId: string;
  topicLabel: string;
  formatLabel: FormatLabel;
  audienceSignal: AudienceSignal | null;
  confidence: number;
  model: string;
  promptVersion: string;
  visionUsed: boolean;
  transcriptUsed: boolean;
}

export interface SampleRow {
  videoId: string;
  promptFull: string;
  responseFull: string;
  chosenLabels: { topic_label: string; format_label: FormatLabel; audience_signal: AudienceSignal | null; confidence: number };
}

export interface ClassifyOutput { classifications: ClassificationRow[]; samples: SampleRow[]; transcriptHits: number }

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function classifyBatch(inputs: ClassifierInput[], deps: ClassifierDeps): Promise<ClassifyOutput> {
  const rng = deps.rng ?? Math.random;
  const concurrency = deps.formatConcurrency ?? 6;
  const sampleRate = deps.sampleRate ?? 0.05;

  // Transcripts (best-effort, concurrent, never throw).
  const transcripts = new Map<string, TranscriptResult | null>();
  await mapWithConcurrency(inputs, concurrency, async (i) => {
    transcripts.set(i.videoId, await deps.fetchTranscript(i.videoId).catch(() => null));
  });
  const withTranscript: ClassifierInput[] = inputs.map((i) => ({ ...i, transcript: transcripts.get(i.videoId)?.text ?? null }));

  // Pass 1 — topic, batched 10 (transcript-enriched inputs), with singleton retry for dropped entries.
  const topicByVideo = new Map<string, TopicCall>();
  for (const group of chunk(withTranscript, 10)) {
    const res = await deps.generateTopicBatch(group);
    for (const r of res) topicByVideo.set(r.videoId, r);
    const missing = group.filter((g) => !topicByVideo.has(g.videoId));
    for (const m of missing) {
      const retry = await deps.generateTopicBatch([m]);
      const hit = retry.find((r) => r.videoId === m.videoId);
      if (hit) topicByVideo.set(m.videoId, hit);
    }
  }

  // Pass 2 — format, one vision call per video, bounded concurrency.
  const formats = await mapWithConcurrency(inputs, concurrency, async (i) => {
    const thumb = await deps.fetchThumbnail(i.thumbnailUrl).catch(() => null);
    const f = await deps.generateFormat(i, thumb);
    return { videoId: i.videoId, format: f, hadThumb: thumb !== null };
  });
  const formatByVideo = new Map(formats.map((f) => [f.videoId, f]));

  const model = `topic=${deps.topicModel};format=${deps.formatModel}`;
  const classifications: ClassificationRow[] = [];
  const samples: SampleRow[] = [];
  let transcriptHits = 0;

  for (const input of inputs) {
    const topic = topicByVideo.get(input.videoId);
    const fmt = formatByVideo.get(input.videoId);
    if (!topic || !fmt) continue; // both passes required
    const transcriptUsed = (transcripts.get(input.videoId)?.text ?? "").length > 0;
    if (transcriptUsed) transcriptHits++;
    const confidence = Math.min(topic.confidence, fmt.format.confidence);
    const row: ClassificationRow = {
      videoId: input.videoId,
      topicLabel: topic.topic_label.trim(),
      formatLabel: fmt.format.format_label,
      audienceSignal: topic.audience_signal ?? null,
      confidence,
      model,
      promptVersion: deps.promptVersion,
      visionUsed: true,
      transcriptUsed,
    };
    classifications.push(row);
    if (rng() < sampleRate) {
      samples.push({
        videoId: input.videoId,
        promptFull: JSON.stringify({ topicModel: deps.topicModel, formatModel: deps.formatModel, input: withTranscript.find((w) => w.videoId === input.videoId) }),
        responseFull: JSON.stringify({ topic, format: fmt.format }),
        chosenLabels: { topic_label: row.topicLabel, format_label: row.formatLabel, audience_signal: row.audienceSignal, confidence: row.confidence },
      });
    }
  }
  return { classifications, samples, transcriptHits };
}
