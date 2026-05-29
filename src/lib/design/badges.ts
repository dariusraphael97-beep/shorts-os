export type Tone = "accent" | "success" | "warning" | "danger" | "muted";
export interface BadgeSpec { label: string; tone: Tone; }

export type DiscoveryState = "discovered" | "emerging" | "validated" | "saturated";
const DISCOVERY: Record<DiscoveryState, BadgeSpec> = {
  discovered: { label: "Discovered", tone: "accent" },
  emerging: { label: "Emerging", tone: "warning" },
  validated: { label: "Validated", tone: "success" },
  saturated: { label: "Saturated", tone: "muted" },
};
export function discoveryStateBadge(state: string): BadgeSpec {
  return DISCOVERY[state as DiscoveryState] ?? { label: "Unknown", tone: "muted" };
}

export type ProvenBand = "proven" | "first_mover" | "mixed";
const PROVEN: Record<ProvenBand, BadgeSpec> = {
  proven: { label: "Proven", tone: "success" },
  first_mover: { label: "First-mover", tone: "accent" },
  mixed: { label: "Mixed", tone: "muted" },
};
export function provenBandBadge(band: string): BadgeSpec {
  return PROVEN[band as ProvenBand] ?? { label: "Unknown", tone: "muted" };
}

export type ProductionFit = "high" | "medium" | "low";
const FIT: Record<ProductionFit, BadgeSpec> = {
  high: { label: "High fit", tone: "success" },
  medium: { label: "Medium fit", tone: "warning" },
  low: { label: "Low fit", tone: "danger" },
};
export function productionFitBadge(fit: string): BadgeSpec {
  return FIT[fit as ProductionFit] ?? { label: "Unknown fit", tone: "muted" };
}

export type OutlierTier = "none" | "mild" | "strong" | "extreme";
export function outlierTier(multiplier: number): OutlierTier {
  if (multiplier >= 5) return "extreme";
  if (multiplier >= 2.5) return "strong";
  if (multiplier >= 1.5) return "mild";
  return "none";
}

export type AssistantStatus = "idle" | "working" | "waiting" | "errored";
export function assistantStatusTone(status: AssistantStatus): Tone {
  const map: Record<AssistantStatus, Tone> = {
    idle: "muted", working: "accent", waiting: "warning", errored: "danger",
  };
  return map[status];
}
