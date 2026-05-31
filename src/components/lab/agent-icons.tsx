// src/components/lab/agent-icons.tsx
//
// Shared, design-system-aligned glyphs for the four pipeline agents.
// Replaces the legacy emoji (🧭 ✍️ 🎙️ 🎬) with consistent stroke icons
// from lucide-react so they theme correctly and stay crisp at any size.
// Purely presentational — no behavior.

import { Compass, PenLine, Mic, Clapperboard, type LucideIcon } from "lucide-react";
import type { AgentId } from "@/lib/agents/types";

export const AGENT_ICON: Record<AgentId, LucideIcon> = {
  strategist: Compass,
  writer: PenLine,
  voice_coach: Mic,
  director: Clapperboard,
  composer: Clapperboard,
};

export const AGENT_LABEL: Record<AgentId, string> = {
  strategist: "Strategist",
  writer: "Writer",
  voice_coach: "Voice Coach",
  director: "Director",
  composer: "Composer",
};
