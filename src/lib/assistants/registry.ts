// src/lib/assistants/registry.ts
//
// Client-safe constants mapping each product assistant (Plan #5 §4.8, adapted
// post-pivot) to its ledger sources, cron schedules, and icon. The DB
// `assistants` table holds display copy; this file holds derivation wiring.
// MUST stay importable from client components: no runtime server-only imports.
import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  ChartLine,
  Clapperboard,
  Compass,
  Eye,
  Scissors,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { IngestionJob } from '@/lib/supabase/repositories/ingestion-runs';

export type AssistantId =
  | 'niche_scout'
  | 'watch_list_curator'
  | 'generator'
  | 'video_reviewer'
  | 'analyst'
  | 'editor_copilot';

export const ASSISTANT_ORDER: AssistantId[] = [
  'niche_scout',
  'watch_list_curator',
  'generator',
  'video_reviewer',
  'analyst',
  'editor_copilot',
];

export interface AssistantDef {
  id: AssistantId;
  /** Fallback display copy when the DB `assistants` row is missing (un-migrated env). */
  fallbackName: string;
  fallbackRole: string;
  fallbackIcon: string;
  /** ingestion_runs jobs owned by this assistant (each job belongs to exactly one). */
  ingestionJobs: IngestionJob[];
  /** niche_scout also surfaces digest_runs. */
  includesDigestRuns: boolean;
  /** generator surfaces jobs + render_jobs. */
  includesPipelineJobs: boolean;
  /** video_reviewer surfaces video_reviews. */
  includesReviews: boolean;
  /** Human-readable schedule list (mirrors vercel.ts crons), for the Settings tab. */
  schedules: { label: string; cron: string }[];
  /**
   * Overdue threshold: if the newest success/partial completion is older than
   * this, annotate "overdue". 2× the densest schedule interval, +1h slack.
   * null = not cron-driven (event-driven assistants are never overdue).
   */
  maxExpectedGapHours: number | null;
  comingInPhase?: number;
}

export const ASSISTANT_DEFS: Record<AssistantId, AssistantDef> = {
  niche_scout: {
    id: 'niche_scout',
    fallbackName: 'Niche Scout',
    fallbackRole: 'Finds and ranks dominatable niches across sources.',
    fallbackIcon: 'compass',
    ingestionJobs: [
      'youtube_category_sweep',
      'youtube_shorts_search',
      'reddit_topic_discovery',
      'google_trends',
      'tiktok_creative_center',
      'classify_observations',
      'cluster_niches',
    ],
    includesDigestRuns: true,
    includesPipelineJobs: false,
    includesReviews: false,
    schedules: [
      { label: 'Category sweep', cron: '0 */6 * * *' },
      { label: 'Shorts search', cron: '0 8 * * *' },
      { label: 'Reddit discovery', cron: '0 9 * * *' },
      { label: 'Google Trends', cron: '30 9 * * *' },
      { label: 'Classify observations', cron: '15 */6 * * *' },
      { label: 'Cluster niches', cron: '0 23 * * 0' },
      { label: 'Weekly digest', cron: '0 12 * * 1' },
    ],
    maxExpectedGapHours: 13, // densest cadence is 6h → 2×6 + 1
  },
  watch_list_curator: {
    id: 'watch_list_curator',
    fallbackName: 'Watch-list Curator',
    fallbackRole: 'Tracks watched channels and flags outlier videos.',
    fallbackIcon: 'eye',
    ingestionJobs: ['watch_list_sync'],
    includesDigestRuns: false,
    includesPipelineJobs: false,
    includesReviews: false,
    schedules: [{ label: 'Watch-list sync', cron: '30 */6 * * *' }],
    maxExpectedGapHours: 13,
  },
  generator: {
    id: 'generator',
    fallbackName: 'Generator',
    fallbackRole: 'Drafts longform videos from niche briefs on the Higgsfield engine.',
    fallbackIcon: 'clapperboard',
    ingestionJobs: [],
    includesDigestRuns: false,
    includesPipelineJobs: true,
    includesReviews: false,
    schedules: [
      { label: 'Render dispatcher', cron: '* * * * *' },
      { label: 'Render watchdog', cron: '*/5 * * * *' },
    ],
    maxExpectedGapHours: null, // event-driven: runs when Darius dispatches
  },
  video_reviewer: {
    id: 'video_reviewer',
    fallbackName: 'Video Reviewer',
    fallbackRole: 'Reviews drafts against the quality gate before posting.',
    fallbackIcon: 'shield-check',
    ingestionJobs: [],
    includesDigestRuns: false,
    includesPipelineJobs: false,
    includesReviews: true,
    schedules: [],
    maxExpectedGapHours: null,
  },
  analyst: {
    id: 'analyst',
    fallbackName: 'Analyst',
    fallbackRole: 'Tracks post-publication performance: views, CTR, retention curves.',
    fallbackIcon: 'line-chart',
    ingestionJobs: ['performance_sync'],
    includesDigestRuns: false,
    includesPipelineJobs: false,
    includesReviews: false,
    schedules: [{ label: 'Performance sync', cron: '0 12 * * *' }],
    maxExpectedGapHours: 26, // daily → 2×24, but 26 keeps the amber off normal jitter
  },
  editor_copilot: {
    id: 'editor_copilot',
    fallbackName: 'Editor Co-pilot',
    fallbackRole: 'Premiere Pro / CapCut editing co-pilot.',
    fallbackIcon: 'scissors',
    ingestionJobs: [],
    includesDigestRuns: false,
    includesPipelineJobs: false,
    includesReviews: false,
    schedules: [],
    maxExpectedGapHours: null,
    comingInPhase: 3,
  },
};

export function isAssistantId(value: string): value is AssistantId {
  return (ASSISTANT_ORDER as string[]).includes(value);
}

/** icon_name (DB) → Lucide component. Keep in sync with seed migration names. */
const ASSISTANT_ICONS: Record<string, LucideIcon> = {
  compass: Compass,
  eye: Eye,
  sparkles: Sparkles,
  clapperboard: Clapperboard,
  'shield-check': ShieldCheck,
  'line-chart': ChartLine,
  scissors: Scissors,
};

export function assistantIcon(name: string): LucideIcon {
  return ASSISTANT_ICONS[name] ?? Bot;
}
