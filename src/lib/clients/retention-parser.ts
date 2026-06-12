// Pure, dependency-free, client-safe: turns arbitrary pasted text (YT Studio CSV,
// raw YT Analytics API JSON, or a JSON array) into a normalized retention curve.
// ParsedRetentionPoint is intentionally a 2-field structural subset of L2's
// RetentionCurvePoint (src/lib/longform/retention.ts), so callers can pass the
// output straight to summarizeOpeningRetention with no cross-import.

export interface ParsedRetentionPoint {
  elapsedVideoTimeRatio: number;
  audienceWatchRatio: number;
}

export class RetentionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetentionParseError';
  }
}

const ELAPSED_KEYS = ['elapsedvideotimeratio', 'elapsed', 'position', 'videoposition', 'x'];
const WATCH_KEYS = ['audiencewatchratio', 'absoluteretention', 'retention', 'watch', 'y'];

function lc(s: string): string {
  return s.toLowerCase().replace(/[\s_()%]/g, '');
}

function toNum(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[%,\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function fromObjects(arr: Array<Record<string, unknown>>): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (const obj of arr) {
    const keys = Object.keys(obj);
    const eKey = keys.find((k) => ELAPSED_KEYS.includes(lc(k)));
    const wKey = keys.find((k) => WATCH_KEYS.includes(lc(k)));
    if (!eKey || !wKey) continue;
    const e = toNum(obj[eKey]);
    const w = toNum(obj[wKey]);
    if (e !== null && w !== null) pairs.push([e, w]);
  }
  return pairs;
}

function parseJson(text: string): Array<[number, number]> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RetentionParseError('Looks like JSON but could not be parsed.');
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && 'rows' in data) {
    const rows = (data as { rows: unknown }).rows;
    if (Array.isArray(rows)) data = rows;
  }
  if (!Array.isArray(data)) {
    throw new RetentionParseError('Expected a JSON array of points or an object with a "rows" array.');
  }
  if (data.length === 0) {
    throw new RetentionParseError('JSON array is empty.');
  }
  if (Array.isArray(data[0])) {
    return (data as unknown[][])
      .map((row) => [toNum(row[0]), toNum(row[1])] as [number | null, number | null])
      .filter((p): p is [number, number] => p[0] !== null && p[1] !== null);
  }
  if (typeof data[0] === 'object' && data[0] !== null) {
    return fromObjects(data as Array<Record<string, unknown>>);
  }
  throw new RetentionParseError('Unrecognized JSON array shape.');
}

function parseDelimited(text: string): Array<[number, number]> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const delim = lines.some((l) => l.includes('\t')) ? '\t' : ',';
  const pairs: Array<[number, number]> = [];
  for (const line of lines) {
    const cells = line.split(delim);
    if (cells.length < 2) continue;
    const e = toNum(cells[0]);
    const w = toNum(cells[1]);
    if (e === null || w === null) continue; // skips header + junk rows
    pairs.push([e, w]);
  }
  return pairs;
}

function scaleColumn(values: number[]): number[] {
  const max = Math.max(...values);
  return max > 1.5 ? values.map((v) => v / 100) : values;
}

function normalize(pairs: Array<[number, number]>): ParsedRetentionPoint[] {
  if (pairs.length === 0) {
    throw new RetentionParseError('No numeric data points found.');
  }
  const elapsed = scaleColumn(pairs.map((p) => p[0]));
  const watch = scaleColumn(pairs.map((p) => p[1]));
  const seen = new Set<number>();
  const points: ParsedRetentionPoint[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const e = Math.min(1, Math.max(0, elapsed[i]));
    const w = Math.max(0, watch[i]);
    const key = Math.round(e * 1e6) / 1e6;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push({ elapsedVideoTimeRatio: e, audienceWatchRatio: w });
  }
  points.sort((a, b) => a.elapsedVideoTimeRatio - b.elapsedVideoTimeRatio);
  if (points.length < 2) {
    throw new RetentionParseError('Need at least 2 distinct points to form a retention curve.');
  }
  return points;
}

export function parseRetentionCurve(input: string): ParsedRetentionPoint[] {
  const text = (input ?? '').trim();
  if (!text) throw new RetentionParseError('Empty input — paste a CSV or JSON retention curve.');
  const pairs = text.startsWith('{') || text.startsWith('[') ? parseJson(text) : parseDelimited(text);
  return normalize(pairs);
}
