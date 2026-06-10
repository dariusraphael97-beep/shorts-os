import { describe, it, expect } from 'vitest';
import { parseRetentionCurve, RetentionParseError } from '@/lib/clients/retention-parser';

describe('parseRetentionCurve', () => {
  it('parses a JSON array of {elapsedVideoTimeRatio, audienceWatchRatio}', () => {
    const pts = parseRetentionCurve(
      JSON.stringify([
        { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
        { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.4 },
        { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.2 },
      ]),
    );
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
      { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.4 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.2 },
    ]);
  });

  it('parses tolerant JSON keys (x/y, position/retention)', () => {
    const pts = parseRetentionCurve(JSON.stringify([{ x: 0, y: 1 }, { x: 1, y: 0.3 }]));
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.3 },
    ]);
  });

  it('parses the raw YT Analytics API response { rows: [[e,w],...] }', () => {
    const pts = parseRetentionCurve(JSON.stringify({ rows: [[0, 1], [0.5, 0.6], [1, 0.25]] }));
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
      { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.6 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.25 },
    ]);
  });

  it('ignores extra array columns (e.g. relativeRetentionPerformance) and takes first two', () => {
    const pts = parseRetentionCurve(JSON.stringify({ rows: [[0, 1, 0.5], [1, 0.2, 0.4]] }));
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.2 },
    ]);
  });

  it('parses CSV with a header and percentage values (0-100 -> 0-1)', () => {
    const csv = 'Video position (%),Absolute audience retention (%)\n0,100\n50,42.5\n100,18';
    const pts = parseRetentionCurve(csv);
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
      { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.425 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.18 },
    ]);
  });

  it('parses headerless CSV already in 0-1 ratios', () => {
    const pts = parseRetentionCurve('0,1\n0.25,0.7\n1,0.2');
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
      { elapsedVideoTimeRatio: 0.25, audienceWatchRatio: 0.7 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.2 },
    ]);
  });

  it('parses TSV and strips % and thousands commas', () => {
    const pts = parseRetentionCurve('0%\t100%\n100%\t20%');
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.2 },
    ]);
  });

  it('detects per-column scale independently (elapsed ratio, watch percent)', () => {
    const pts = parseRetentionCurve('0,100\n1,20');
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.2 },
    ]);
  });

  it('sorts by elapsed and de-dupes identical elapsed values (first-seen wins)', () => {
    const pts = parseRetentionCurve('1,0.2\n0,1\n0,0.9');
    expect(pts.map((p) => p.elapsedVideoTimeRatio)).toEqual([0, 1]);
    expect(pts[0].audienceWatchRatio).toBe(1);
  });

  it('clamps negative watch ratios to 0 and elapsed to [0,1]', () => {
    const pts = parseRetentionCurve(JSON.stringify([[0, -0.1], [1.2, 0.5]]));
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 0 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.5 },
    ]);
  });

  it('throws on empty input', () => {
    expect(() => parseRetentionCurve('   ')).toThrow(RetentionParseError);
  });

  it('throws when fewer than 2 distinct points', () => {
    expect(() => parseRetentionCurve('0,1')).toThrow(RetentionParseError);
  });

  it('throws on total garbage', () => {
    expect(() => parseRetentionCurve('hello world\nthis is not data')).toThrow(RetentionParseError);
  });
});
