export type Trend = "up" | "down" | "flat";

export function buildSparklinePath(values: number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  return values
    .map((v, i) => {
      const x = Math.round(i * stepX);
      const y = max === min ? height / 2 : Math.round(height - ((v - min) / range) * height);
      return `${i === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
}

export function sparklineTrend(values: number[]): Trend {
  if (values.length < 2) return "flat";
  const first = values[0];
  const last = values[values.length - 1];
  if (last > first) return "up";
  if (last < first) return "down";
  return "flat";
}
