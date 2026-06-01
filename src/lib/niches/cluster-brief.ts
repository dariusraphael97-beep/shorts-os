export interface BriefInput {
  id: string; canonical_topic: string; format_label: string;
  audience_signal: string | null; example_video_ids: string[]; production_fit: string;
}
export interface TopicBrief {
  title: string; summary: string;
  rawPayload: Record<string, unknown>;
}

export function clusterToBrief(c: BriefInput): TopicBrief {
  if (c.production_fit !== "native") throw new Error(`clusterToBrief: only 'native' production_fit auto-generates (got '${c.production_fit}')`);
  return {
    title: `${c.canonical_topic} (${c.format_label})`,
    summary: `Auto-seeded from niche cluster ${c.id}: ${c.canonical_topic}, ${c.format_label}, audience ${c.audience_signal ?? "general"}.`,
    rawPayload: { clusterId: c.id, format: c.format_label, audience: c.audience_signal ?? null, referenceVideoIds: c.example_video_ids },
  };
}
