import type { BuiltCluster } from "@/lib/clustering/cluster";
import type { ScoreComponents } from "@/lib/scoring/score";
import { PRODUCTION_FIT_WEIGHT } from "@/lib/classifier/taxonomy";

const MONETIZATION_RE = /\b(sponsored|patreon|merch|membership|join this channel|promo code|use code|discount code|affiliate)\b/i;

export function saturationInverse(channelCount: number): number {
  return 1 / Math.log(channelCount + 2);
}

export function nicheAgeDays(firstSeenAt: string | null, now: Date): number | null {
  if (!firstSeenAt) return null;
  return Math.max(0, (now.getTime() - new Date(firstSeenAt).getTime()) / 86_400_000);
}

/** Fraction of distinct cluster channels with a monetization mention in any description. */
export function monetizationSignal(cluster: BuiltCluster): number | null {
  const byChannel = new Map<string, boolean>();
  for (const r of cluster.rows) {
    if (!r.channel_id) continue;
    const prev = byChannel.get(r.channel_id) ?? false;
    byChannel.set(r.channel_id, prev || MONETIZATION_RE.test(r.description ?? ""));
  }
  if (byChannel.size === 0) return null;
  return [...byChannel.values()].filter(Boolean).length / byChannel.size;
}

/** Weighted mean over non-null sub-components; null if none available. */
function provenScore(parts: Array<number | null>): number | null {
  const present = parts.filter((p): p is number => p !== null && Number.isFinite(p));
  if (present.length === 0) return null;
  return present.reduce((s, p) => s + p, 0) / present.length;
}

const DISCOVERY_WEIGHT = { pre_public: 1.0, public: 0.5 } as const;

export interface ScoreExplain {
  nicheAgeDays: number | null;
  monetizationSignal: number | null;
  channelCount: number;
}

export function computeComponents(cluster: BuiltCluster, now: Date): { components: ScoreComponents; explain: ScoreExplain } {
  const monetization = monetizationSignal(cluster);
  // Cold-start: snapshot/comment-dependent sub-components are null and renormalize.
  const channelGrowth: number | null = null;
  const subToView: number | null = null;
  const commentDepth: number | null = null; // permanently null in D (no comment ingestion)
  const repeatWinner: number | null = null;
  const outlierDensity: number | null = null;
  const avgVelocity: number | null = null;

  const proven = provenScore([channelGrowth, subToView, commentDepth, repeatWinner, monetization]);
  const firstMover: number | null =
    outlierDensity !== null && avgVelocity !== null
      ? (1 / Math.max(nicheAgeDays(cluster.firstSeenAt, now) ?? 1, 1)) * outlierDensity * Math.log(1 + avgVelocity)
      : null;

  const components: ScoreComponents = {
    firstMoverScore: firstMover,
    provenScore: proven,
    saturationInverse: saturationInverse(cluster.channelCount),
    productionFitWeight: PRODUCTION_FIT_WEIGHT[cluster.productionFit],
    discoveryStateWeight: DISCOVERY_WEIGHT[cluster.discoveryState],
    outlierDensity,
  };
  return {
    components,
    explain: { nicheAgeDays: nicheAgeDays(cluster.firstSeenAt, now), monetizationSignal: monetization, channelCount: cluster.channelCount },
  };
}
