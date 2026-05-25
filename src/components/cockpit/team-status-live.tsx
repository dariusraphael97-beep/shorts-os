"use client";

import { useEffect, useState } from "react";
import { subscribeToTable } from "@/lib/supabase/realtime-subscribe";
import type { Agent } from "@/lib/supabase/repositories/agents";
import { AgentCard } from "./agent-card";
import { AgentDrawer } from "./agent-drawer";

export function TeamStatusLive({ initial }: { initial: Agent[] }) {
  const [agents, setAgents] = useState(initial);
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);

  useEffect(() => {
    const unsub = subscribeToTable<Agent>({
      table: "agents",
      event: "UPDATE",
      onEvent: (p) => {
        const updated = p.new;
        if (!updated?.id) return;
        setAgents((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
      },
    });
    return unsub;
  }, []);

  return (
    <>
      <div className="p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wide text-text-muted px-1">Agents</div>
        {agents.map((a) => (
          <AgentCard key={a.id} agent={a} onClick={() => setActiveAgent(a)} />
        ))}
        <p className="text-[11px] text-text-muted px-1 pt-2 leading-snug">
          All agents idle — they&apos;ll wake up in Plan #3.
        </p>
      </div>
      <AgentDrawer
        agent={activeAgent}
        open={activeAgent !== null}
        onOpenChange={(open) => {
          if (!open) setActiveAgent(null);
        }}
      />
    </>
  );
}
