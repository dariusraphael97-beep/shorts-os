"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { Agent } from "@/lib/supabase/repositories/agents";

export function AgentDrawer({
  agent,
  open,
  onOpenChange,
}: {
  agent: Agent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-surface border-l border-subtle text-text-primary w-full sm:max-w-md"
      >
        {agent && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3 text-text-primary">
                <span className="text-3xl" aria-hidden>
                  {agent.emoji ?? "🤖"}
                </span>
                <span>{agent.display_name}</span>
              </SheetTitle>
              <SheetDescription className="text-text-secondary">
                {agent.description}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4 px-4 pb-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-md border border-subtle bg-elevated p-3">
                  <div className="text-[10px] uppercase tracking-wide text-text-muted">State</div>
                  <div className="text-sm font-mono text-text-primary mt-1">{agent.current_state}</div>
                </div>
                <div className="rounded-md border border-subtle bg-elevated p-3">
                  <div className="text-[10px] uppercase tracking-wide text-text-muted">Decisions</div>
                  <div className="text-sm font-mono text-text-primary mt-1">{agent.total_decisions}</div>
                </div>
                <div className="rounded-md border border-subtle bg-elevated p-3">
                  <div className="text-[10px] uppercase tracking-wide text-text-muted">Wins</div>
                  <div className="text-sm font-mono text-accent-electric mt-1">{agent.total_wins}</div>
                </div>
              </div>

              {agent.current_task && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">Current task</div>
                  <p className="text-xs text-text-secondary">{agent.current_task}</p>
                </div>
              )}

              <div>
                <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">Model</div>
                <p className="text-xs font-mono text-text-secondary">{agent.model_id}</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wide text-text-muted">Prompt template</span>
                  <span className="text-[10px] font-mono text-text-muted">v{agent.prompt_version}</span>
                </div>
                <pre className="text-[11px] font-mono text-text-secondary bg-elevated border border-subtle rounded p-3 max-h-96 overflow-auto whitespace-pre-wrap">
                  {agent.prompt_template}
                </pre>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
