'use client';

import { useMemo, useState } from 'react';
import { parseRetentionCurve, type ParsedRetentionPoint } from '@/lib/clients/retention-parser';

type PostedVideo = { id: string; external_video_id: string | null; title: string };

function Sparkline({ points }: { points: ParsedRetentionPoint[] }) {
  const d = useMemo(() => {
    if (points.length < 2) return '';
    const maxW = Math.max(...points.map((p) => p.audienceWatchRatio), 1);
    return points
      .map((p, i) => {
        const x = p.elapsedVideoTimeRatio * 100;
        const y = 30 - (p.audienceWatchRatio / maxW) * 28;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [points]);
  return (
    <svg viewBox="0 0 100 30" className="w-full h-16" preserveAspectRatio="none">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1} className="text-accent-electric" />
    </svg>
  );
}

export function RetentionImportCard({ videos }: { videos: PostedVideo[] }) {
  const [videoId, setVideoId] = useState(videos[0]?.id ?? '');
  const [raw, setRaw] = useState('');
  const [showMetrics, setShowMetrics] = useState(false);
  const [metrics, setMetrics] = useState({ views: '', avd: '', ctr: '', impressions: '' });
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = useMemo<{ points: ParsedRetentionPoint[] } | { error: string } | null>(() => {
    if (!raw.trim()) return null;
    try {
      return { points: parseRetentionCurve(raw) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'parse error' };
    }
  }, [raw]);

  const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/youtube/retention-ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          yourVideoId: videoId,
          rawCurve: raw,
          metrics: showMetrics
            ? {
                views: num(metrics.views),
                avgViewDurationSeconds: num(metrics.avd),
                ctrPct: num(metrics.ctr),
                impressions: num(metrics.impressions),
              }
            : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
      setStatus({
        kind: 'ok',
        msg: `Saved ${json.points} points. First-30s retention: ${
          json.first30sRetention != null ? `${Math.round(json.first30sRetention * 100)}%` : 'n/a'
        }.`,
      });
      setRaw('');
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : 'failed' });
    } finally {
      setSaving(false);
    }
  }

  const canSave = !!videoId && parsed !== null && 'points' in parsed && !saving;

  return (
    <section className="rounded-lg border border-subtle bg-surface p-4 space-y-3">
      <div>
        <h2 className="text-sm font-medium text-text-primary">Audience retention — manual import</h2>
        <p className="text-xs text-text-muted mt-1">
          YouTube withholds the retention curve from the API until a video has enough views, so paste it from
          YT Studio (Analytics → Engagement → Audience retention) as CSV or JSON. The first-30s hold this
          computes is the L2 playbook&apos;s primary ranking signal.
        </p>
      </div>

      {videos.length === 0 ? (
        <p className="text-xs text-text-muted">No posted videos yet.</p>
      ) : (
        <>
          <label className="block text-xs text-text-secondary">
            Video
            <select
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              className="mt-1 w-full rounded border border-subtle bg-app px-2 py-1.5 text-xs text-text-primary"
            >
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title.slice(0, 80)} {v.external_video_id ? `(${v.external_video_id})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-text-secondary">
            Retention curve (CSV or JSON)
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={6}
              placeholder={'0,100\n25,68\n50,42\n75,31\n100,18'}
              className="mt-1 w-full rounded border border-subtle bg-app px-2 py-1.5 font-mono text-xs text-text-primary"
            />
          </label>

          {parsed && 'error' in parsed && <p className="text-xs text-accent-red">⚠ {parsed.error}</p>}
          {parsed && 'points' in parsed && (
            <div className="space-y-1">
              <p className="text-xs text-text-muted">{parsed.points.length} points parsed</p>
              <Sparkline points={parsed.points} />
            </div>
          )}

          <button type="button" onClick={() => setShowMetrics((s) => !s)} className="text-xs text-text-muted underline">
            {showMetrics ? 'Hide' : 'Add'} headline metrics (optional)
          </button>
          {showMetrics && (
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['views', 'Views'],
                  ['avd', 'Avg view duration (s)'],
                  ['ctr', 'CTR %'],
                  ['impressions', 'Impressions'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="block text-xs text-text-secondary">
                  {label}
                  <input
                    inputMode="decimal"
                    value={metrics[k]}
                    onChange={(e) => setMetrics((m) => ({ ...m, [k]: e.target.value }))}
                    className="mt-1 w-full rounded border border-subtle bg-app px-2 py-1.5 text-xs text-text-primary"
                  />
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!canSave}
              onClick={save}
              className="px-4 py-2 rounded bg-accent-electric text-app text-xs font-medium hover:opacity-90 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save retention curve'}
            </button>
            {status && (
              <span className={`text-xs ${status.kind === 'ok' ? 'text-text-secondary' : 'text-accent-red'}`}>
                {status.kind === 'ok' ? '✓ ' : '✗ '}
                {status.msg}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
