import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { productionFitBadge, type Tone } from "@/lib/design/badges";

const toneClass: Record<Tone, string> = {
  accent:  "bg-[var(--accent-muted)] text-[var(--accent)] border-transparent",
  success: "bg-[color-mix(in_oklch,var(--success)_15%,transparent)] text-[var(--success)] border-transparent",
  warning: "bg-[color-mix(in_oklch,var(--warning)_15%,transparent)] text-[var(--warning)] border-transparent",
  danger:  "bg-[color-mix(in_oklch,var(--danger)_15%,transparent)] text-[var(--danger)] border-transparent",
  muted:   "bg-muted text-[var(--text-secondary)] border-transparent",
};

interface ProductionFitBadgeProps {
  fit: string;
}

export function ProductionFitBadge({ fit }: ProductionFitBadgeProps) {
  const { label, tone } = productionFitBadge(fit);
  return (
    <Badge variant="outline" className={cn("font-medium", toneClass[tone])}>
      {label}
    </Badge>
  );
}
