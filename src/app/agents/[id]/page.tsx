// src/app/agents/[id]/page.tsx
//
// The per-agent page — Plan #5, sub-phase G.
// Header (back link, accent icon tile, name/role, live status) over a 4-tab
// workspace: Activity / Memory / Settings / Chat. Disabled agents render a
// "coming soon" hero instead of tabs.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AssistantStatusDot } from "@/components/compositions/assistant-status-dot";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getServiceClient } from "@/lib/supabase/server";
import {
  getAssistantById,
  listAssistantStatuses,
} from "@/lib/supabase/repositories/assistants";
import type { AssistantState } from "@/lib/supabase/repositories/assistants";
import { iconFor, comingPhaseFor } from "../_components/agent-presentation";
import { ActivityTab } from "./_components/activity-tab";
import { MemoryTab } from "./_components/memory-tab";
import { SettingsTab } from "./_components/settings-tab";
import { ChatTab } from "./_components/chat-tab";

export const dynamic = "force-dynamic";

export default async function AgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getServiceClient();

  const assistant = await getAssistantById(supabase, id);
  if (!assistant) notFound();

  const enabled = assistant.is_enabled;
  const statuses = enabled ? await listAssistantStatuses(supabase) : [];
  const state: AssistantState =
    statuses.find((s) => s.assistant_id === id)?.state ?? "idle";

  const Icon = iconFor(assistant.icon_name);

  return (
    <AppShell bare sidebar={<AppSidebar activeHref="/agents" />}>
      <div className="mx-auto max-w-[1000px] px-8 py-8">
        {/* Back link */}
        <Link
          href="/agents"
          className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
        >
          <ArrowLeft className="size-3.5" />
          All agents
        </Link>

        {/* Header */}
        <div className="mt-5 flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)]"
            style={{
              backgroundColor: enabled ? "var(--accent-muted)" : "var(--surface-2)",
              color: enabled ? "var(--accent)" : "var(--text-tertiary)",
            }}
            aria-hidden
          >
            <Icon className="h-6 w-6" strokeWidth={1.75} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold leading-tight text-[var(--text-primary)]">
                {assistant.display_name}
              </h1>
              {enabled && <AssistantStatusDot status={state} label={state} />}
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {assistant.role_description}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="mt-8">
          {enabled ? (
            <Tabs defaultValue="activity">
              <TabsList variant="line">
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="memory">Memory</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
                <TabsTrigger value="chat">Chat</TabsTrigger>
              </TabsList>

              <TabsContent value="activity" className="mt-6">
                <ActivityTab assistantId={id} />
              </TabsContent>
              <TabsContent value="memory" className="mt-6">
                <MemoryTab assistantId={id} />
              </TabsContent>
              <TabsContent value="settings" className="mt-6">
                <SettingsTab assistantId={id} />
              </TabsContent>
              <TabsContent value="chat" className="mt-6">
                <ChatTab assistantId={id} displayName={assistant.display_name} />
              </TabsContent>
            </Tabs>
          ) : (
            <ComingSoon
              name={assistant.display_name}
              role={assistant.role_description}
              phase={comingPhaseFor(id)}
              Icon={Icon}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ComingSoon({
  name,
  role,
  phase,
  Icon,
}: {
  name: string;
  role: string;
  phase: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)] px-8 py-20 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: "var(--surface-2)", color: "var(--text-tertiary)" }}
        aria-hidden
      >
        <Icon className="h-7 w-7" strokeWidth={1.5} />
      </div>
      <div className="max-w-md">
        <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-medium text-[var(--text-tertiary)]">
          Coming in {phase}
        </span>
        <h2 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">{name}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{role}</p>
        <p className="mt-4 text-[13px] leading-relaxed text-[var(--text-tertiary)]">
          This agent isn&apos;t active yet — it ships in {phase}. When it does, you&apos;ll be
          able to watch its activity, edit what it&apos;s learned, tune its settings, and chat
          with it right here.
        </p>
      </div>
    </div>
  );
}
