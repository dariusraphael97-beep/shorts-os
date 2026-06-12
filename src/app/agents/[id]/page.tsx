export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { Construction } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getServiceClient } from "@/lib/supabase/server";
import { getAssistantById, listAssistantMemory, getAssistantSettings } from "@/lib/supabase/repositories/assistants";
import { listChatThreads, listChatMessages, type ChatMessage, type ChatThread } from "@/lib/supabase/repositories/assistant-chat";
import { getLiveDashboard } from "@/lib/assistants/ledger";
import { ASSISTANT_DEFS, assistantIcon, isAssistantId } from "@/lib/assistants/registry";
import { AssistantStatusDot } from "@/components/compositions/assistant-status-dot";
import { Badge } from "@/components/ui/badge";
import { ActivityFeed } from "@/components/mission-control/activity-feed";
import { AutoRefresh } from "@/components/mission-control/auto-refresh";
import { AgentTabs, type AgentTab } from "@/components/agents/agent-tabs";
import { MemoryTab } from "@/components/agents/memory-tab";
import { SettingsTab } from "@/components/agents/settings-tab";
import { ChatTab } from "@/components/agents/chat-tab";
import { relativeTime } from "@/lib/format/relative-time";

const VALID_TABS: AgentTab[] = ["activity", "chat", "memory", "settings"];
const FEED_PAGE_SIZE = 30;

export default async function AgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; thread?: string }>;
}) {
  const { id } = await params;
  if (!isAssistantId(id)) notFound();
  const sp = await searchParams;
  const tab: AgentTab = VALID_TABS.includes(sp.tab as AgentTab) ? (sp.tab as AgentTab) : "activity";

  const supabase = getServiceClient();
  const def = ASSISTANT_DEFS[id];
  const isPlaceholder = def.comingInPhase !== undefined;

  const [assistant, dashboard] = await Promise.all([
    getAssistantById(supabase, id).catch(() => null),
    // Skip ledger queries entirely for placeholder agents — they have no runs.
    isPlaceholder ? Promise.resolve(null) : getLiveDashboard(supabase),
  ]);
  const live = dashboard?.statuses[id];
  const name = assistant?.display_name ?? def.fallbackName;
  const role = assistant?.role_description ?? def.fallbackRole;
  const Icon = assistantIcon(assistant?.icon_name ?? def.fallbackIcon);

  // Derive per-agent feed from the already-fetched dashboard (single ledger fetch).
  const agentFeed = dashboard ? dashboard.feed.filter((e) => e.assistantId === id).slice(0, FEED_PAGE_SIZE) : [];
  const agentFeedNextBefore =
    agentFeed.length === FEED_PAGE_SIZE ? (agentFeed[agentFeed.length - 1]?.at ?? null) : null;

  return (
    <AppShell sidebar={<AppSidebar activeHref="/mission-control" />}>
      {tab === "activity" && !isPlaceholder && <AutoRefresh intervalMs={15000} />}

      <header className="mb-6 flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent)]">
          <Icon className="h-6 w-6" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold text-[var(--text-primary)]">{name}</h1>
            {isPlaceholder && <Badge variant="secondary">Phase {def.comingInPhase}</Badge>}
          </div>
          <p className="truncate text-sm text-[var(--text-secondary)]">{role}</p>
        </div>
        {!isPlaceholder && live && (
          <div className="flex shrink-0 items-center gap-2 text-sm text-[var(--text-secondary)]">
            <AssistantStatusDot status={live.state} />
            <span className="max-w-md truncate" title={live.currentActivity ?? undefined}>
              {live.currentActivity ?? "No runs recorded yet"}
            </span>
            {live.lastEventAt && (
              <span className="font-mono text-xs text-[var(--text-tertiary)]">
                {relativeTime(live.lastEventAt)}
              </span>
            )}
          </div>
        )}
      </header>

      {isPlaceholder ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] py-16 text-center">
          <Construction className="h-8 w-8 text-[var(--text-tertiary)]" strokeWidth={1.5} />
          <p className="text-base font-medium text-[var(--text-secondary)]">
            The {def.fallbackName} arrives in Phase {def.comingInPhase}
          </p>
          <p className="max-w-sm text-sm text-[var(--text-tertiary)]">
            {def.fallbackRole}
          </p>
        </div>
      ) : (
        <>
          <AgentTabs agentId={id} active={tab} />
          {tab === "activity" && (
            // key resets client pagination state (events + cursor) when new events arrive via AutoRefresh
            <ActivityFeed
              key={agentFeed[0]?.id ?? "empty"}
              initialEvents={agentFeed}
              initialNextBefore={agentFeedNextBefore}
              nameById={{}}
              assistantId={id}
            />
          )}
          {tab === "chat" && <ChatSection agentId={id} threadId={sp.thread} />}
          {tab === "memory" && <MemorySection agentId={id} />}
          {tab === "settings" && <SettingsSection agentId={id} isEnabled={assistant?.is_enabled ?? true} />}
        </>
      )}
    </AppShell>
  );
}

async function MemorySection({ agentId }: { agentId: string }) {
  const supabase = getServiceClient();
  const memories = await listAssistantMemory(supabase, agentId).catch(() => []);
  return <MemoryTab agentId={agentId} memories={memories} />;
}

async function SettingsSection({ agentId, isEnabled }: { agentId: string; isEnabled: boolean }) {
  const supabase = getServiceClient();
  const settings = await getAssistantSettings(supabase, agentId).catch(() => ({}) as Record<string, unknown>);
  const def = ASSISTANT_DEFS[agentId as keyof typeof ASSISTANT_DEFS];
  return (
    <SettingsTab
      agentId={agentId}
      isEnabled={isEnabled}
      chatModel={typeof settings.chat_model === "string" ? settings.chat_model : "claude-sonnet-4-6"}
      schedules={def.schedules}
    />
  );
}

async function ChatSection({ agentId, threadId }: { agentId: string; threadId?: string }) {
  const supabase = getServiceClient();
  const threads: ChatThread[] = await listChatThreads(supabase, agentId, 20).catch(() => []);
  const activeThread = threadId ? threads.find((t) => t.id === threadId) ?? null : null;
  const messages: ChatMessage[] = activeThread
    ? await listChatMessages(supabase, activeThread.id).catch(() => [])
    : [];
  return <ChatTab agentId={agentId} threads={threads} activeThreadId={activeThread?.id ?? null} initialMessages={messages} />;
}
