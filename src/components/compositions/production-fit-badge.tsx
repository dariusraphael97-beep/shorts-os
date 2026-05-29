import { ToneBadge } from "@/components/compositions/tone-badge";
import { productionFitBadge } from "@/lib/design/badges";

interface ProductionFitBadgeProps {
  fit: string;
}

export function ProductionFitBadge({ fit }: ProductionFitBadgeProps) {
  return <ToneBadge spec={productionFitBadge(fit)} />;
}
