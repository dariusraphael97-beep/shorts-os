// src/app/agents/_components/agent-presentation.tsx
//
// Shared presentation helpers for the Agents surface — used by the dashboard
// card (`agent-card.tsx`) and the per-agent page (`/agents/[id]`). Keeping the
// icon + phase + relative-time lookups in one module means the card grid and
// the detail header stay visually consistent.

import {
  Compass,
  Eye,
  Sparkles,
  ShieldCheck,
  LineChart,
  Scissors,
  Bot,
  type LucideIcon,
} from "lucide-react";

// ─── Icon lookup ────────────────────────────────────────────────────────────
// Maps an assistant's `icon_name` (db value) to a lucide component.
const ICONS: Record<string, LucideIcon> = {
  compass: Compass,
  eye: Eye,
  sparkles: Sparkles,
  "shield-check": ShieldCheck,
  "line-chart": LineChart,
  scissors: Scissors,
};

export function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? Bot;
}

// ─── Phase lookup ───────────────────────────────────────────────────────────
// Disabled placeholders advertise the phase that ships them.
const COMING_PHASE: Record<string, string> = {
  analyst: "Phase 4",
  editor_copilot: "Phase 3",
};

export function comingPhaseFor(id: string): string {
  return COMING_PHASE[id] ?? "a future phase";
}

// ─── Relative time ──────────────────────────────────────────────────────────
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / (60 * 1000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
