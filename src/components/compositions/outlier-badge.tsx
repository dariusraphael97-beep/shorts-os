import { Flame, TrendingUp, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { outlierTier, type OutlierTier } from "@/lib/design/badges";

const tierStyle: Record<Exclude<OutlierTier, "none">, string> = {
  mild:    "bg-[color-mix(in_oklch,var(--warning)_15%,transparent)] text-[var(--warning)] border-[color-mix(in_oklch,var(--warning)_25%,transparent)]",
  strong:  "bg-[var(--accent-muted)] text-[var(--accent)] border-[color-mix(in_oklch,var(--accent)_25%,transparent)]",
  extreme: "bg-[color-mix(in_oklch,var(--danger)_15%,transparent)] text-[var(--danger)] border-[color-mix(in_oklch,var(--danger)_25%,transparent)]",
};

const TierIcon: Record<Exclude<OutlierTier, "none">, React.ElementType> = {
  mild:    TrendingUp,
  strong:  Zap,
  extreme: Flame,
};

interface OutlierBadgeProps {
  multiplier: number;
}

export function OutlierBadge({ multiplier }: OutlierBadgeProps) {
  const tier = outlierTier(multiplier);
  if (tier === "none") return null;

  const Icon = TierIcon[tier];

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-medium tracking-tight",
        tierStyle[tier],
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
      {multiplier.toFixed(1)}× outlier
    </Badge>
  );
}
