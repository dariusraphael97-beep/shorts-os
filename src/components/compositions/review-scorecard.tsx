import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ToneBadge } from "@/components/compositions/tone-badge";
import type { Tone } from "@/lib/design/badges";
import { cn } from "@/lib/utils";

export type Verdict = "pass" | "warn" | "fail";

export interface ReviewDimension {
  key: string;
  label: string;
  verdict: Verdict;
  note?: string;
}

export interface ReviewScorecardProps {
  overallVerdict: Verdict;
  overallScore?: number; // 0–100, optional ring
  dimensions: ReviewDimension[];
  className?: string;
}

const VERDICT_TONE: Record<Verdict, Tone> = {
  pass: "success",
  warn: "warning",
  fail: "danger",
};

const VERDICT_LABEL: Record<Verdict, string> = {
  pass: "Pass",
  warn: "Warn",
  fail: "Fail",
};

const RING_SIZE = 60;
const STROKE_WIDTH = 5;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CX = RING_SIZE / 2;
const CY = RING_SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface ScoreRingProps {
  score: number;
}

function ScoreRing({ score }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg width={RING_SIZE} height={RING_SIZE} aria-hidden="true">
        {/* Track */}
        <circle
          cx={CX}
          cy={CY}
          r={RADIUS}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={STROKE_WIDTH}
        />
        {/* Progress arc */}
        <circle
          cx={CX}
          cy={CY}
          r={RADIUS}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${CX} ${CY})`}
        />
      </svg>
      {/* Centered score label */}
      <div
        className="absolute inset-0 flex items-center justify-center font-mono text-xs font-semibold text-[var(--text-primary)]"
        aria-label={`Score: ${clamped}`}
      >
        {clamped}
      </div>
    </div>
  );
}

export function ReviewScorecard({
  overallVerdict,
  overallScore,
  dimensions,
  className,
}: ReviewScorecardProps) {
  return (
    <Card className={cn("gap-3", className)}>
      {/* Header: verdict pill + optional score ring */}
      <CardHeader className="flex-row items-center justify-between gap-4 py-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-secondary)]">Review</span>
          <ToneBadge
            spec={{ label: VERDICT_LABEL[overallVerdict], tone: VERDICT_TONE[overallVerdict] }}
          />
        </div>
        {overallScore !== undefined && <ScoreRing score={overallScore} />}
      </CardHeader>

      {/* Per-dimension list */}
      <CardContent>
        <ul className="space-y-3" role="list">
          {dimensions.map((d) => (
            <li
              key={d.key}
              className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-3 last:border-b-0 last:pb-0"
            >
              {/* Label + optional note */}
              <div className="min-w-0 flex-1">
                <span className="text-sm text-[var(--text-primary)]">{d.label}</span>
                {d.note && (
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{d.note}</p>
                )}
              </div>
              {/* Verdict pill */}
              <ToneBadge
                spec={{ label: VERDICT_LABEL[d.verdict], tone: VERDICT_TONE[d.verdict] }}
                className="shrink-0"
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
