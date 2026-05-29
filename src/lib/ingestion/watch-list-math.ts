// Pure watch-list math (§4.5). No IO.

const MS_PER_DAY = 86_400_000;

export function computeUploadCadencePerWeek(uploadDates: Date[], windowDays: number, now: Date = new Date()): number {
  if (uploadDates.length === 0) return 0;
  const cutoff = now.getTime() - windowDays * MS_PER_DAY;
  const inWindow = uploadDates.filter((d) => d.getTime() >= cutoff).length;
  const weeks = windowDays / 7;
  return weeks > 0 ? inWindow / weeks : 0;
}

export function computeAvgViews(views: number[]): number {
  if (views.length === 0) return 0;
  return views.reduce((a, b) => a + b, 0) / views.length;
}

export function computeOutlierRate(videoViews: number[], avgViews: number, multiplier: number): number {
  if (videoViews.length === 0 || avgViews <= 0) return 0;
  const threshold = avgViews * multiplier;
  const outliers = videoViews.filter((v) => v >= threshold).length;
  return outliers / videoViews.length;
}

export function computeGrowthFraction(current: number, past: number | null | undefined): number | null {
  if (past === null || past === undefined || past <= 0) return null;
  return (current - past) / past;
}

export interface AutoAddInput {
  subscriberCount: number;
  uploadCadencePerWeek: number;
  outlierRate: number;
  subs30dAgo: number | null;
  atCap: boolean;
}

export interface AutoAddDecision {
  add: boolean;
  source: 'auto_outlier' | 'auto_breakout' | null;
}

const SUB_MIN = 5_000;
const SUB_MAX = 500_000;
const MIN_CADENCE = 1;
const MIN_OUTLIER_RATE = 0.1;
const BREAKOUT_MULTIPLE = 2;

export function evaluateAutoAdd(input: AutoAddInput): AutoAddDecision {
  if (input.atCap) return { add: false, source: null };
  const inRange = input.subscriberCount >= SUB_MIN && input.subscriberCount <= SUB_MAX;
  if (!inRange) return { add: false, source: null };

  if (input.uploadCadencePerWeek >= MIN_CADENCE && input.outlierRate >= MIN_OUTLIER_RATE) {
    return { add: true, source: 'auto_outlier' };
  }
  if (input.subs30dAgo !== null && input.subs30dAgo > 0 && input.subscriberCount >= input.subs30dAgo * BREAKOUT_MULTIPLE) {
    return { add: true, source: 'auto_breakout' };
  }
  return { add: false, source: null };
}
