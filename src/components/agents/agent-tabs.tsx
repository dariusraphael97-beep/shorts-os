import Link from "next/link";
import { cn } from "@/lib/utils";

export type AgentTab = "activity" | "chat" | "memory" | "settings";

const TABS: { key: AgentTab; label: string }[] = [
  { key: "activity", label: "Activity" },
  { key: "chat", label: "Chat" },
  { key: "memory", label: "Memory" },
  { key: "settings", label: "Settings" },
];

export function AgentTabs({ agentId, active }: { agentId: string; active: AgentTab }) {
  return (
    <nav
      role="tablist"
      aria-label="Agent sections"
      className="mb-6 flex gap-1 border-b border-[var(--border-subtle)]"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/agents/${agentId}?tab=${tab.key}`}
          scroll={false}
          role="tab"
          aria-selected={active === tab.key}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === tab.key
              ? "border-[var(--accent)] text-[var(--text-primary)]"
              : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
