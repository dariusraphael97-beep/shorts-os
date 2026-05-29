import { ToneBadge } from "@/components/compositions/tone-badge";
import { discoveryStateBadge } from "@/lib/design/badges";

interface DiscoveryStateBadgeProps {
  state: string;
}

export function DiscoveryStateBadge({ state }: DiscoveryStateBadgeProps) {
  return <ToneBadge spec={discoveryStateBadge(state)} />;
}
