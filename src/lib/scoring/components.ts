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

/**
 * Median of view_count / subscriber_count across rows that have both. A HIGH ratio means a
 * video pulled far more views than the channel has subscribers — i.e. the views come from the
 * algorithm / search, not a locked-in loyal audience. This is the core "dominatable niche"
 * signal from the playbook, and (because a brand-new channel has few subscribers) it also
 * proxies "recently started channel". Null when no row has subscriber data.
 */
export function viewsToSubsRatio(cluster: BuiltCluster): number | null {
  const ratios: number[] = [];
  for (const r of cluster.rows) {
    if (r.channel_subscriber_count && r.channel_subscriber_count > 0 && r.view_count > 0) {
      ratios.push(r.view_count / r.channel_subscriber_count);
    }
  }
  if (ratios.length === 0) return null;
  ratios.sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  return ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
}

// Squash an unbounded views/subs ratio into 0..1 (ratio 10 → 0.5, 50 → ~0.83, 200 → ~0.95).
function squashRatio(r: number, k = 10): number {
  return r / (r + k);
}
// Squash avg views into 0..1 on a log scale (~100K → 0.71, ~1M → 0.86, ≥10M → 1.0).
function squashViews(v: number): number {
  return Math.min(1, Math.max(0, Math.log10(Math.max(1, v)) / 7));
}

/** Median channel age in days across rows that have a channel_published_at; null if none. */
export function medianChannelAgeDays(cluster: BuiltCluster, now: Date): number | null {
  const ages: number[] = [];
  for (const r of cluster.rows) {
    if (r.channel_published_at) ages.push((now.getTime() - new Date(r.channel_published_at).getTime()) / 86_400_000);
  }
  if (ages.length === 0) return null;
  ages.sort((a, b) => a - b);
  const mid = Math.floor(ages.length / 2);
  return ages.length % 2 ? ages[mid] : (ages[mid - 1] + ages[mid]) / 2;
}

// recency: 1.0 for a brand-new channel decaying to a 0.2 floor by ~1yr; 1.0 (no penalty) when age unknown.
function recencyMultiplier(ageDays: number | null): number {
  if (ageDays === null) return 1;
  return Math.max(0.2, 1 - ageDays / 365);
}

const DISCOVERY_WEIGHT = { pre_public: 1.0, public: 0.5 } as const;

export interface ScoreExplain {
  nicheAgeDays: number | null;
  monetizationSignal: number | null;
  viewsToSubsRatio: number | null;
  channelAgeDays: number | null;
  channelCount: number;
}

export function computeComponents(cluster: BuiltCluster, now: Date): { components: ScoreComponents; explain: ScoreExplain } {
  const monetization = monetizationSignal(cluster);
  // Cold-start: comment/time-series sub-components are null and renormalize.
  const channelGrowth: number | null = null;
  const subToView: number | null = null;
  const commentDepth: number | null = null; // permanently null in D (no comment ingestion)
  const repeatWinner: number | null = null;
  const outlierDensity: number | null = null; // time-series; aggregated in a later pass

  // First-mover ("dominatable") score from single-snapshot data: a niche where videos pull far
  // more views than the channels have subscribers (algorithm-driven, new-channel) AND the videos
  // get big view counts (proven demand). A recency multiplier boosts brand-new channels over old
  // ones with the same views/subs profile. Null when no subscriber data is available to judge.
  const ageDays = medianChannelAgeDays(cluster, now);
  const vts = viewsToSubsRatio(cluster);
  const firstMover: number | null =
    vts === null ? null : Math.sqrt(squashRatio(vts) * squashViews(cluster.avgViews)) * recencyMultiplier(ageDays);

  const proven = provenScore([channelGrowth, subToView, commentDepth, repeatWinner, monetization]);

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
    explain: {
      nicheAgeDays: nicheAgeDays(cluster.firstSeenAt, now),
      monetizationSignal: monetization,
      viewsToSubsRatio: vts,
      channelAgeDays: ageDays,
      channelCount: cluster.channelCount,
    },
  };
}
