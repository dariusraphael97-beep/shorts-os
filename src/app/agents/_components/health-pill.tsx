import Link from "next/link";
import { CheckCircle2, AlertTriangle, OctagonAlert, type LucideIcon } from "lucide-react";
import type { HealthLevel } from "@/lib/agents/dashboard/health";

interface LevelStyle {
  icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
}

const STYLES: Record<HealthLevel, LevelStyle> = {
  healthy: {
    icon: CheckCircle2,
    color: "var(--success)",
    bg: "color-mix(in srgb, var(--success) 12%, transparent)",
    border: "color-mix(in srgb, var(--success) 30%, transparent)",
  },
  attention: {
    icon: AlertTriangle,
    color: "var(--warning)",
    bg: "color-mix(in srgb, var(--warning) 12%, transparent)",
    border: "color-mix(in srgb, var(--warning) 30%, transparent)",
  },
  critical: {
    icon: OctagonAlert,
    color: "var(--danger)",
    bg: "color-mix(in srgb, var(--danger) 12%, transparent)",
    border: "color-mix(in srgb, var(--danger) 30%, transparent)",
  },
};

interface HealthPillProps {
  level: HealthLevel;
  summary: string;
}

export function HealthPill({ level, summary }: HealthPillProps) {
  const style = STYLES[level];
  const Icon = style.icon;

  return (
    <Link
      href="/admin/health"
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
      style={{
        backgroundColor: style.bg,
        borderColor: style.border,
        color: style.color,
      }}
      aria-label={`System health: ${summary}. Open health dashboard.`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      <span>{summary}</span>
    </Link>
  );
}
