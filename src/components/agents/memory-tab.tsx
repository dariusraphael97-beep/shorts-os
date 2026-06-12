// TEMPORARY shell — replaced in Task 13.
import type { AssistantMemory } from "@/lib/supabase/repositories/assistants";

export function MemoryTab(_props: { agentId: string; memories: AssistantMemory[] }) {
  return <p className="text-sm text-[var(--text-tertiary)]">Memory — coming in the next commit.</p>;
}
