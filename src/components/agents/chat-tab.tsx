// TEMPORARY shell — replaced in Task 15.
import type { ChatMessage, ChatThread } from "@/lib/supabase/repositories/assistant-chat";

export function ChatTab(_props: {
  agentId: string;
  threads: ChatThread[];
  activeThreadId: string | null;
  initialMessages: ChatMessage[];
}) {
  return <p className="text-sm text-[var(--text-tertiary)]">Chat — coming in the next commit.</p>;
}
