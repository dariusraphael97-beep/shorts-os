"use client";

import type { Agent, AgentState } from "@/lib/supabase/repositories/agents";

const STATE_STYLES: Record<AgentState, { bg: string; text: string; pulse: boolean; glow: boolean }> = {
  idle:           { bg: "bg-elevated",      text: "text-text-muted",      pulse: false, glow: false },
  thinking:       { bg: "bg-accent-amber/10",  text: "text-accent-amber",  pulse: true,  glow: false },
  working:        { bg: "bg-accent-electric/10", text: "text-accent-electric", pulse: true, glow: true  },
  awaiting_input: { bg: "bg-accent-orange/10", text: "text-accent-orange", pulse: true,  glow: false },
};

export function AgentCard({ agent, onClick }: { agent: Agent; onClick?: () => void }) {
  const style = STATE_STYLES[agent.current_state];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full text-left p-3 rounded-md border border-subtle bg-surface hover:bg-hover transition ${
        style.glow ? "shadow-[0_0_12px_rgba(0,255,136,0.25)]" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl shrink-0" aria-hidden>
          {agent.emoji ?? "🤖"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-text-primary truncate">{agent.display_name}</div>
          <span
            className={`inline-flex items-center gap-1.5 mt-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${style.bg} ${style.text} ${
              style.pulse ? "animate-pulse" : ""
            }`}
          >
            {agent.current_state}
          </span>
          {agent.current_task && (
            <div className="text-[11px] text-text-secondary mt-1 truncate" title={agent.current_task}>
              {agent.current_task}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
