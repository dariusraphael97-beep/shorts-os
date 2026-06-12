"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AssistantCard } from "@/components/compositions/assistant-card";
import { MissionControlGrid } from "@/components/compositions/mission-control-grid";
import { assistantIcon } from "@/lib/assistants/registry";
import type { AssistantStatus } from "@/lib/design/badges";
import { relativeTime } from "@/lib/format/relative-time";

/** Fully serializable card payload (server page → client grid). */
export interface AgentCardData {
  id: string;
  name: string;
  role: string;
  iconName: string;
  status: AssistantStatus;
  activitySummary?: string;
  overdue: boolean;
  recentActivity: { id: string; summary: string; at: string }[]; // at = ISO
  disabled: boolean;
  comingInPhase?: number;
}

export function AgentGrid({ cards }: { cards: AgentCardData[] }) {
  const router = useRouter();
  return (
    <MissionControlGrid>
      {cards.map((card, i) => (
        <motion.div
          key={card.id}
          id={`agent-card-${card.id}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: i * 0.05, ease: "easeOut" }}
        >
          <AssistantCard
            icon={assistantIcon(card.iconName)}
            name={card.name}
            role={card.role}
            status={card.status}
            activitySummary={card.activitySummary}
            overdue={card.overdue}
            recentActivity={card.recentActivity.map((e) => ({ ...e, at: relativeTime(e.at) }))}
            disabled={card.disabled}
            comingInPhase={card.comingInPhase}
            onOpen={card.disabled ? undefined : () => router.push(`/agents/${card.id}`)}
          />
        </motion.div>
      ))}
    </MissionControlGrid>
  );
}
