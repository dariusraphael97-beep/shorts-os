"use client";

import { buildSparklinePath, sparklineTrend, type Trend } from "@/lib/design/sparkline";
import { cn } from "@/lib/utils";

const trendColorMap: Record<Trend, string> = {
  up: "text-[var(--success)]",
  down: "text-[var(--danger)]",
  flat: "text-[var(--text-tertiary)]",
};

interface VelocitySparklineProps {
  values: number[];
  width?: number;
  height?: number;
  showArea?: boolean;
  className?: string;
}

export function VelocitySparkline({
  values,
  width = 96,
  height = 24,
  showArea = false,
  className,
}: VelocitySparklineProps) {
  if (values.length < 2) return null;

  const trend = sparklineTrend(values);
  const linePath = buildSparklinePath(values, width, height);
  const areaPath = `${linePath} L${width} ${height} L0 ${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn(trendColorMap[trend], className)}
      aria-hidden="true"
    >
      {showArea && (
        <path
          d={areaPath}
          fill="currentColor"
          fillOpacity={0.12}
          stroke="none"
        />
      )}
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
