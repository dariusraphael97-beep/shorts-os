"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, MessagesSquare, SendHorizonal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/lib/format/relative-time";

export interface ChatThreadData {
  id: string;
  title: string | null;
  last_message_at: string;
}

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export function ChatTab({
  agentId,
  threads,
  activeThreadId,
  initialMessages,
}: {
  agentId: string;
  threads: ChatThreadData[];
  activeThreadId: string | null;
  initialMessages: ChatMessageData[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageData[]>(
    initialMessages.filter((m) => m.role !== "system"),
  );
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));

  const send = async () => {
    const message = draft.trim();
    if (!message || streaming) return;
    setDraft("");
    setError(null);
    setStreaming(true);
    setMessages((prev) => [
      ...prev,
      { id: `local-u-${prev.length}`, role: "user", content: message },
      { id: `local-a-${prev.length}`, role: "assistant", content: "" },
    ]);
    scrollToEnd();
    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId ?? undefined, message }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `request failed (${res.status})`);
      }
      const newThreadId = res.headers.get("x-thread-id");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
        scrollToEnd();
      }
      if (!activeThreadId && newThreadId) {
        router.replace(`/agents/${agentId}?tab=chat&thread=${newThreadId}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "stream failed");
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-16rem)] min-h-[24rem] gap-4">
      {/* Thread list */}
      <aside className="hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto md:flex">
        <Button
          variant="ghost"
          size="sm"
          className="justify-start"
          onClick={() => router.push(`/agents/${agentId}?tab=chat`)}
        >
          <MessageSquarePlus className="mr-2 h-4 w-4" strokeWidth={1.5} /> New chat
        </Button>
        {threads.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => router.push(`/agents/${agentId}?tab=chat&thread=${t.id}`)}
            className={cn(
              "rounded-md px-2 py-1.5 text-left text-sm transition-colors",
              t.id === activeThreadId
                ? "bg-[var(--accent-muted)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-overlay,rgba(127,127,127,0.08))]",
            )}
          >
            <span className="block truncate">{t.title ?? "Untitled"}</span>
            <span className="block text-xs text-[var(--text-tertiary)]">{relativeTime(t.last_message_at)}</span>
          </button>
        ))}
      </aside>

      {/* Messages + composer */}
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-[var(--border-subtle)]">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <MessagesSquare className="h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} />
              <p className="text-sm font-medium text-[var(--text-secondary)]">Ask about this agent's data</p>
              <p className="max-w-xs text-xs text-[var(--text-tertiary)]">
                Answers are grounded in real runs and tables — it will say when it doesn't know.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                  m.role === "user"
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border-subtle)] text-[var(--text-primary)]",
                )}
              >
                {m.content || (streaming ? "…" : "")}
              </div>
            </div>
          ))}
          {error && (
            <div className="flex items-center gap-2 text-sm text-[var(--danger)]">
              <span>{error}</span>
              <Button variant="ghost" size="sm" onClick={() => setError(null)}>
                Dismiss
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-end gap-2 border-t border-[var(--border-subtle)] p-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask about niches, runs, retention…"
            rows={2}
            className="flex-1 resize-none"
            disabled={streaming}
          />
          <Button onClick={() => void send()} disabled={streaming || !draft.trim()} aria-label="Send">
            <SendHorizonal className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>
    </div>
  );
}
