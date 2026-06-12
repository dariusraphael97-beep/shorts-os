import { describe, it, expect } from 'vitest';
import { deriveLiveStatuses, eventsFromInputs, type LedgerInputs } from '@/lib/assistants/live-status';
import type { IngestionRunRow } from '@/lib/supabase/repositories/ingestion-runs';
import type { Job } from '@/lib/supabase/repositories/jobs';
import type { RenderJobRow } from '@/lib/supabase/repositories/render-jobs';
import type { RecentReview } from '@/lib/supabase/repositories/video-reviews';

const NOW = new Date('2026-06-11T12:00:00Z');

function emptyInputs(): LedgerInputs {
  return {
    ingestionRuns: [],
    jobs: [],
    renderJobs: [],
    digestRuns: [],
    reviews: [],
    awaitingReviewDrafts: [],
    now: NOW,
  };
}

function run(partial: Partial<IngestionRunRow>): IngestionRunRow {
  return {
    id: partial.id ?? 'r1',
    job: partial.job ?? 'youtube_category_sweep',
    status: partial.status ?? 'success',
    started_at: partial.started_at ?? '2026-06-11T11:00:00Z',
    finished_at: 'finished_at' in partial ? (partial.finished_at as string | null) : '2026-06-11T11:05:00Z',
    items_ingested: partial.items_ingested ?? 100,
    items_skipped: partial.items_skipped ?? 5,
    quota_units: partial.quota_units ?? 0,
    error: partial.error ?? null,
    context: partial.context ?? {},
  };
}

function job(partial: Partial<Job>): Job {
  return {
    id: partial.id ?? 'j1',
    kind: partial.kind ?? 'produce_longform_video',
    channel_id: null,
    topic_queue_id: null,
    status: partial.status ?? 'running',
    current_step: partial.current_step ?? 'writer',
    current_agent: partial.current_agent ?? 'writer',
    progress_pct: partial.progress_pct ?? 40,
    error: partial.error ?? null,
    metadata: {},
    created_at: partial.created_at ?? '2026-06-11T10:00:00Z',
    started_at: partial.started_at ?? '2026-06-11T10:00:00Z',
    finished_at: partial.finished_at ?? null,
  };
}

function render(partial: Partial<RenderJobRow>): RenderJobRow {
  return {
    id: partial.id ?? 'rj1',
    job_type: partial.job_type ?? 'render_longform',
    payload: {},
    status: partial.status ?? 'succeeded',
    attempts: 1,
    last_error: partial.last_error ?? null,
    claimed_at: null,
    started_at: partial.started_at ?? '2026-06-11T09:00:00Z',
    finished_at: partial.finished_at ?? '2026-06-11T09:30:00Z',
    sandbox_invocation_id: null,
    your_video_id: partial.your_video_id ?? null,
    compilation_draft_id: null,
    clip_library_id: null,
    created_at: partial.created_at ?? '2026-06-11T08:55:00Z',
  };
}

function review(partial: Partial<RecentReview>): RecentReview {
  return {
    id: partial.id ?? 'rev1',
    your_video_id: partial.your_video_id ?? 'v1',
    reviewed_at: partial.reviewed_at ?? '2026-06-11T08:00:00Z',
    overall_verdict: partial.overall_verdict ?? 'ship',
    video_title: partial.video_title ?? 'The Truth About the B58',
    video_status: partial.video_status ?? 'rendered',
  };
}

describe('deriveLiveStatuses', () => {
  it('cold start: all idle, not overdue, no currentActivity', () => {
    const { statuses } = deriveLiveStatuses(emptyInputs());
    for (const id of ['niche_scout', 'watch_list_curator', 'generator', 'video_reviewer', 'analyst', 'editor_copilot'] as const) {
      expect(statuses[id].state).toBe('idle');
      expect(statuses[id].overdue).toBe(false);
      expect(statuses[id].currentActivity).toBeNull();
    }
  });

  it('in-flight ingestion run → niche_scout working', () => {
    const inputs = emptyInputs();
    inputs.ingestionRuns = [run({ id: 'a', status: 'partial', finished_at: null, started_at: '2026-06-11T11:58:00Z' })];
    const { statuses } = deriveLiveStatuses(inputs);
    expect(statuses.niche_scout.state).toBe('working');
    expect(statuses.niche_scout.currentActivity).toContain('Category sweep');
  });

  it('latest run failed → errored; older failure superseded by success → idle', () => {
    const failedLatest = emptyInputs();
    failedLatest.ingestionRuns = [
      run({ id: 'new', status: 'failed', error: 'quota exceeded', finished_at: '2026-06-11T11:00:00Z' }),
      run({ id: 'old', status: 'success', finished_at: '2026-06-11T05:00:00Z' }),
    ];
    expect(deriveLiveStatuses(failedLatest).statuses.niche_scout.state).toBe('errored');

    const recovered = emptyInputs();
    recovered.ingestionRuns = [
      run({ id: 'new', status: 'success', finished_at: '2026-06-11T11:00:00Z' }),
      run({ id: 'old', status: 'failed', error: 'quota exceeded', finished_at: '2026-06-11T05:00:00Z' }),
    ];
    expect(deriveLiveStatuses(recovered).statuses.niche_scout.state).toBe('idle');
  });

  it('a failure in one job does not clear via success in another job', () => {
    const inputs = emptyInputs();
    inputs.ingestionRuns = [
      run({ id: 'a', job: 'google_trends', status: 'failed', finished_at: '2026-06-11T06:00:00Z' }),
      run({ id: 'b', job: 'youtube_category_sweep', status: 'success', finished_at: '2026-06-11T11:00:00Z' }),
    ];
    expect(deriveLiveStatuses(inputs).statuses.niche_scout.state).toBe('errored');
  });

  it('watch_list_sync routes to the curator, performance_sync to the analyst', () => {
    const inputs = emptyInputs();
    inputs.ingestionRuns = [
      run({ id: 'w', job: 'watch_list_sync', status: 'failed', finished_at: '2026-06-11T11:00:00Z' }),
      run({ id: 'p', job: 'performance_sync', status: 'success', finished_at: '2026-06-11T11:00:00Z' }),
    ];
    const { statuses } = deriveLiveStatuses(inputs);
    expect(statuses.watch_list_curator.state).toBe('errored');
    expect(statuses.analyst.state).toBe('idle');
    expect(statuses.niche_scout.state).toBe('idle');
  });

  it('generator: running pipeline job → working; waiting on rendered draft; errored beats waiting', () => {
    const working = emptyInputs();
    working.jobs = [job({ status: 'running' })];
    expect(deriveLiveStatuses(working).statuses.generator.state).toBe('working');

    const waiting = emptyInputs();
    waiting.awaitingReviewDrafts = [{ id: 'v1', title: 'B58 video' }];
    const w = deriveLiveStatuses(waiting).statuses.generator;
    expect(w.state).toBe('waiting');
    expect(w.currentActivity).toContain('B58 video');

    const errored = emptyInputs();
    errored.awaitingReviewDrafts = [{ id: 'v1', title: 'B58 video' }];
    errored.renderJobs = [render({ status: 'failed', last_error: 'ffmpeg crashed', finished_at: '2026-06-11T11:00:00Z' })];
    expect(deriveLiveStatuses(errored).statuses.generator.state).toBe('errored');
  });

  it('reviewer: revise verdict on unposted video → waiting; posted clears it', () => {
    const waiting = emptyInputs();
    waiting.reviews = [review({ overall_verdict: 'revise', video_status: 'rendered' })];
    expect(deriveLiveStatuses(waiting).statuses.video_reviewer.state).toBe('waiting');

    const cleared = emptyInputs();
    cleared.reviews = [review({ overall_verdict: 'revise', video_status: 'posted' })];
    expect(deriveLiveStatuses(cleared).statuses.video_reviewer.state).toBe('idle');
  });

  it('working beats waiting, errored beats working (precedence)', () => {
    const inputs = emptyInputs();
    inputs.jobs = [job({ status: 'running' })];
    inputs.awaitingReviewDrafts = [{ id: 'v1', title: 'X' }];
    expect(deriveLiveStatuses(inputs).statuses.generator.state).toBe('working');

    inputs.renderJobs = [render({ status: 'failed', finished_at: '2026-06-11T11:30:00Z' })];
    expect(deriveLiveStatuses(inputs).statuses.generator.state).toBe('errored');
  });

  it('overdue: newest success older than the threshold → annotated; fresh success → not', () => {
    const stale = emptyInputs();
    stale.ingestionRuns = [run({ id: 'old', finished_at: '2026-06-10T08:00:00Z' })]; // 28h ago > 13h
    const s = deriveLiveStatuses(stale).statuses.niche_scout;
    expect(s.state).toBe('idle');
    expect(s.overdue).toBe(true);

    const fresh = emptyInputs();
    fresh.ingestionRuns = [run({ id: 'new', finished_at: '2026-06-11T08:00:00Z' })]; // 4h ago
    expect(deriveLiveStatuses(fresh).statuses.niche_scout.overdue).toBe(false);
  });

  it('digest failure errors the scout; digest sent appears in the feed', () => {
    const inputs = emptyInputs();
    inputs.digestRuns = [
      { id: 'd1', week_start: '2026-06-08', sent_at: '2026-06-08T12:00:00Z', recipient: 'darius', status: 'failed', cluster_ids: [], html: null, error: 'smtp' },
    ];
    const { statuses, feed } = deriveLiveStatuses(inputs);
    expect(statuses.niche_scout.state).toBe('errored');
    expect(feed.some((e) => e.type === 'digest_send')).toBe(true);
  });

  it('feed merges all sources sorted newest-first', () => {
    const inputs = emptyInputs();
    inputs.ingestionRuns = [run({ id: 'a', finished_at: '2026-06-11T11:00:00Z' })];
    inputs.jobs = [job({ status: 'succeeded', finished_at: '2026-06-11T11:30:00Z' })];
    inputs.reviews = [review({ reviewed_at: '2026-06-11T10:00:00Z' })];
    const { feed } = deriveLiveStatuses(inputs);
    expect(feed.map((e) => e.assistantId)).toEqual(['generator', 'niche_scout', 'video_reviewer']);
  });
});

describe('eventsFromInputs', () => {
  it('maps ingestion failures with the error message', () => {
    const inputs = emptyInputs();
    inputs.ingestionRuns = [run({ status: 'failed', error: 'quota exceeded' })];
    const events = eventsFromInputs(inputs);
    expect(events[0].status).toBe('failed');
    expect(events[0].summary).toContain('quota exceeded');
  });
});
