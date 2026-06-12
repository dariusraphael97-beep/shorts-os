// src/lib/assistants/live-status.ts
//
// Pure derivation: ledger rows in, live agent statuses + activity feed out.
// No supabase / server-only runtime imports — fully unit-testable.
// Spec: docs/superpowers/specs/2026-06-11-mission-control-agents-dashboard-design.md §3.
import type { IngestionJob, IngestionRunRow } from '@/lib/supabase/repositories/ingestion-runs';
import type { Job } from '@/lib/supabase/repositories/jobs';
import type { RenderJobRow } from '@/lib/supabase/repositories/render-jobs';
import type { DigestRun } from '@/lib/supabase/repositories/digest-runs';
import type { RecentReview } from '@/lib/supabase/repositories/video-reviews';
import type { AssistantState } from '@/lib/supabase/repositories/assistants';
import { ASSISTANT_DEFS, ASSISTANT_ORDER, type AssistantId } from '@/lib/assistants/registry';

export type ActivityEventStatus =
  | 'success'
  | 'partial'
  | 'failed'
  | 'running'
  | 'queued'
  | 'skipped'
  | 'info';

export interface ActivityEvent {
  id: string;
  assistantId: AssistantId;
  type: string; // e.g. 'youtube_category_sweep' | 'digest_send' | 'pipeline_job' | 'render_job' | 'video_review'
  summary: string;
  status: ActivityEventStatus;
  at: string; // ISO
}

export interface LedgerInputs {
  ingestionRuns: IngestionRunRow[];
  jobs: Job[];
  renderJobs: RenderJobRow[];
  digestRuns: DigestRun[];
  reviews: RecentReview[];
  /** Longform your_videos rows sitting in `rendered`, awaiting review/post. */
  awaitingReviewDrafts: { id: string; title: string }[];
  now: Date;
}

export interface LiveAssistantStatus {
  assistantId: AssistantId;
  state: AssistantState;
  currentActivity: string | null;
  lastEventAt: string | null;
  overdue: boolean;
  recentActivity: ActivityEvent[]; // newest-first, max 3
}

export interface LiveDashboard {
  statuses: Record<AssistantId, LiveAssistantStatus>;
  feed: ActivityEvent[]; // all assistants merged, newest-first
}

const JOB_LABELS: Record<IngestionJob, string> = {
  youtube_category_sweep: 'Category sweep',
  youtube_shorts_search: 'Shorts search',
  watch_list_sync: 'Watch-list sync',
  reddit_topic_discovery: 'Reddit discovery',
  google_trends: 'Google Trends',
  tiktok_creative_center: 'TikTok Creative Center',
  classify_observations: 'Classify observations',
  cluster_niches: 'Cluster niches',
  performance_sync: 'Performance sync',
};

const JOB_OWNER: Record<IngestionJob, AssistantId> = (() => {
  const map = {} as Record<IngestionJob, AssistantId>;
  for (const def of Object.values(ASSISTANT_DEFS)) {
    for (const j of def.ingestionJobs) map[j] = def.id;
  }
  return map;
})();

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function pipelineLabel(kind: Job['kind']): string {
  if (kind === 'produce_longform_video') return 'Longform pipeline';
  if (kind === 'produce_video') return 'Shorts pipeline';
  return kind.replace(/_/g, ' ');
}

function ingestionEvent(run: IngestionRunRow): ActivityEvent {
  const label = JOB_LABELS[run.job] ?? run.job;
  // Unknown job values (schema drift beyond the IngestionJob union) silently fall back to
  // niche_scout here; ledger.ts is the right place to validate/warn at the fetch boundary.
  const assistantId = JOB_OWNER[run.job] ?? 'niche_scout';
  if (!run.finished_at) {
    return {
      id: `ing-${run.id}`, assistantId, type: run.job,
      summary: `${label} running…`, status: 'running', at: run.started_at,
    };
  }
  let summary: string;
  if (run.status === 'failed') summary = `${label} failed${run.error ? `: ${truncate(run.error)}` : ''}`;
  else if (run.status === 'skipped') summary = `${label} skipped`;
  else summary = `${label}: ${run.items_ingested} ingested, ${run.items_skipped} skipped`;
  return { id: `ing-${run.id}`, assistantId, type: run.job, summary, status: run.status, at: run.finished_at };
}

function digestEvent(d: DigestRun): ActivityEvent {
  const statusMap: Record<DigestRun['status'], ActivityEventStatus> = {
    sent: 'success', preview: 'info', skipped: 'skipped', failed: 'failed',
  };
  const summary =
    d.status === 'sent'
      ? `Weekly digest sent (${d.cluster_ids.length} niches)`
      : d.status === 'failed'
        ? `Weekly digest failed${d.error ? `: ${truncate(d.error)}` : ''}`
        : `Weekly digest ${d.status}`;
  return { id: `dig-${d.id}`, assistantId: 'niche_scout', type: 'digest_send', summary, status: statusMap[d.status], at: d.sent_at };
}

function pipelineEvent(j: Job): ActivityEvent {
  const label = pipelineLabel(j.kind);
  const statusMap: Record<Job['status'], ActivityEventStatus> = {
    queued: 'queued', running: 'running', succeeded: 'success', failed: 'failed', cancelled: 'info',
  };
  let summary: string;
  if (j.status === 'running') summary = `${label} running — ${j.current_step ?? '…'} (${j.progress_pct ?? 0}%)`;
  else if (j.status === 'failed') summary = `${label} failed${j.error ? `: ${truncate(j.error)}` : ''}`;
  else summary = `${label} ${j.status}`;
  return {
    id: `job-${j.id}`, assistantId: 'generator', type: 'pipeline_job', summary,
    status: statusMap[j.status], at: j.finished_at ?? j.started_at ?? j.created_at,
  };
}

function renderEvent(r: RenderJobRow): ActivityEvent {
  const statusMap: Record<RenderJobRow['status'], ActivityEventStatus> = {
    pending: 'queued', claimed: 'running', running: 'running', succeeded: 'success', failed: 'failed',
  };
  const label = r.job_type.replace(/_/g, ' ');
  let summary: string;
  if (r.status === 'failed') summary = `Render (${label}) failed${r.last_error ? `: ${truncate(r.last_error)}` : ''}`;
  else if (r.status === 'succeeded') summary = `Render (${label}) succeeded`;
  else if (r.status === 'pending') summary = `Render (${label}) queued`;
  else summary = `Render (${label}) running…`;
  return {
    id: `ren-${r.id}`, assistantId: 'generator', type: 'render_job', summary,
    status: statusMap[r.status], at: r.finished_at ?? r.started_at ?? r.created_at,
  };
}

function reviewEvent(rev: RecentReview): ActivityEvent {
  const title = rev.video_title ?? rev.your_video_id;
  return {
    id: `rev-${rev.id}`, assistantId: 'video_reviewer', type: 'video_review',
    summary: `Reviewed "${title}" — verdict: ${rev.overall_verdict}`,
    status: rev.overall_verdict === 'ship' ? 'success' : 'info',
    at: rev.reviewed_at,
  };
}

/** Map every ledger row to an ActivityEvent, sorted newest-first. */
export function eventsFromInputs(inputs: LedgerInputs): ActivityEvent[] {
  const events: ActivityEvent[] = [
    ...inputs.ingestionRuns.map(ingestionEvent),
    ...inputs.digestRuns.map(digestEvent),
    ...inputs.jobs.map(pipelineEvent),
    ...inputs.renderJobs.map(renderEvent),
    ...inputs.reviews.map(reviewEvent),
  ];
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

/** Latest completed ingestion run per owned job. */
function latestCompletedPerJob(runs: IngestionRunRow[], jobs: IngestionJob[]): IngestionRunRow[] {
  const latest = new Map<IngestionJob, IngestionRunRow>();
  for (const run of runs) {
    if (!jobs.includes(run.job) || !run.finished_at) continue;
    const prev = latest.get(run.job);
    if (!prev || run.finished_at > (prev.finished_at ?? '')) latest.set(run.job, run);
  }
  return [...latest.values()];
}

export function deriveLiveStatuses(inputs: LedgerInputs): LiveDashboard {
  const feed = eventsFromInputs(inputs);
  const statuses = {} as Record<AssistantId, LiveAssistantStatus>;

  for (const id of ASSISTANT_ORDER) {
    const def = ASSISTANT_DEFS[id];
    const events = feed.filter((e) => e.assistantId === id);

    // --- working: any in-flight event ---
    const inFlight = events.find((e) => e.status === 'running' || e.status === 'queued');

    // --- errored: latest completed run per source failed ---
    let failure: string | null = null;
    const latestRuns = latestCompletedPerJob(inputs.ingestionRuns, def.ingestionJobs);
    const failedRun = latestRuns.find((r) => r.status === 'failed');
    if (failedRun) failure = ingestionEvent(failedRun).summary;
    if (!failure && def.includesDigestRuns && inputs.digestRuns.length > 0) {
      const latestDigest = [...inputs.digestRuns].sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0];
      if (latestDigest.status === 'failed') failure = digestEvent(latestDigest).summary;
    }
    if (!failure && def.includesPipelineJobs) {
      const doneJobs = inputs.jobs.filter((j) => j.finished_at);
      const latestJob = [...doneJobs].sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? ''))[0];
      if (latestJob?.status === 'failed') failure = pipelineEvent(latestJob).summary;
      if (!failure) {
        const doneRenders = inputs.renderJobs.filter((r) => r.finished_at);
        const latestRender = [...doneRenders].sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? ''))[0];
        if (latestRender?.status === 'failed') failure = renderEvent(latestRender).summary;
      }
    }

    // --- waiting ---
    let waitingActivity: string | null = null;
    if (id === 'generator' && inputs.awaitingReviewDrafts.length > 0) {
      const d = inputs.awaitingReviewDrafts[0];
      waitingActivity = `"${d.title}" rendered — awaiting review`;
    }
    if (id === 'video_reviewer' && inputs.reviews.length > 0) {
      const latest = [...inputs.reviews].sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at))[0];
      if ((latest.overall_verdict === 'revise' || latest.overall_verdict === 'block') && latest.video_status !== 'posted') {
        const title = latest.video_title ?? latest.your_video_id;
        waitingActivity = `"${title}" needs ${latest.overall_verdict === 'block' ? 'rework' : 'revisions'}`;
      }
    }

    // --- precedence ---
    let state: AssistantState = 'idle';
    let currentActivity: string | null = null;
    if (failure) {
      state = 'errored';
      currentActivity = failure;
    } else if (inFlight) {
      state = 'working';
      currentActivity = inFlight.summary;
    } else if (waitingActivity) {
      state = 'waiting';
      currentActivity = waitingActivity;
    } else {
      currentActivity = events[0]?.summary ?? null;
    }

    // --- overdue (orthogonal) ---
    let overdue = false;
    if (def.maxExpectedGapHours !== null) {
      const completedOk = events.filter((e) => e.status === 'success' || e.status === 'partial');
      if (completedOk.length > 0) {
        const newest = completedOk[0].at;
        const ageHours = (inputs.now.getTime() - new Date(newest).getTime()) / 3_600_000;
        overdue = ageHours > def.maxExpectedGapHours;
      }
    }

    statuses[id] = {
      assistantId: id,
      state,
      currentActivity,
      lastEventAt: events[0]?.at ?? null,
      overdue,
      recentActivity: events.slice(0, 3),
    };
  }

  return { statuses, feed };
}
