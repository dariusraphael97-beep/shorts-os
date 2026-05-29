import { ToneBadge } from "@/components/compositions/tone-badge";
import { provenBandBadge } from "@/lib/design/badges";

interface ProvenBandBadgeProps {
  band: string;
}

export function ProvenBandBadge({ band }: ProvenBandBadgeProps) {
  return <ToneBadge spec={provenBandBadge(band)} />;
}
