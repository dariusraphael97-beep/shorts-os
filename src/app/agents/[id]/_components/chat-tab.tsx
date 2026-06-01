"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { MessageSquarePlus, Send, Wrench, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { relativeTime } from "../../_components/agent-presentation";

interface ThreadRow {
  id: string;
  assistant_id: string;
  started_at: string;
  last_message_at: string;
  title: string | null;
}

interface MessageRow {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  created_at: string;
}

export function ChatTab({
  assistantId,
  displayName,
}: {
  assistantId: string;
  displayName: string;
}) {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState("");

  // Mirror of the active thread id that the transport closures can read
  // synchronously (the captured `x-thread-id` for freshly-created threads).
  const threadIdRef = useRef<string | undefined>(undefined);
  threadIdRef.current = activeThreadId;

  const mounted = useRef(true);

  // ── Transport ───────────────────────────────────────────────────────────
  // We send only { threadId, message } (NOT the whole messages array): the
  // server replays history from the DB. A custom fetch reads the response's
  // `x-thread-id` header so a newly-created thread's id is captured for the
  // next turn + added to the thread list.
  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: `/api/agents/${assistantId}/chat`,
        prepareSendMessagesRequest: ({ messages }) => {
          const last = messages[messages.length - 1];
          const text = last
            ? last.parts
                .filter((p): p is { type: "text"; text: string } => p.type === "text")
                .map((p) => p.text)
                .join("")
            : "";
          return {
            body: {
              threadId: threadIdRef.current,
              message: text,
            },
          };
        },
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const headerThreadId = res.headers.get("x-thread-id");
          if (headerThreadId && !threadIdRef.current) {
            threadIdRef.current = headerThreadId;
            if (mounted.current) {
              setActiveThreadId(headerThreadId);
              // Optimistically surface the new thread in the list; the next
              // thread refetch will replace it with the canonical row.
              setThreads((prev) =>
                prev.some((t) => t.id === headerThreadId)
                  ? prev
                  : [
                      {
                        id: headerThreadId,
                        assistant_id: assistantId,
                        started_at: new Date().toISOString(),
                        last_message_at: new Date().toISOString(),
                        title: null,
                      },
                      ...prev,
                    ],
              );
            }
          }
          return res;
        },
      }),
    [assistantId],
  );

  const { messages, sendMessage, setMessages, status } = useChat<UIMessage>({ transport });

  const isStreaming = status === "submitted" || status === "streaming";

  // ── Thread list ───────────────────────────────────────────────────────────
  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${assistantId}/chat`, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { ok: boolean; threads?: ThreadRow[] };
      if (mounted.current && json.ok && json.threads) setThreads(json.threads);
    } catch {
      // keep last good state
    }
  }, [assistantId]);

  useEffect(() => {
    mounted.current = true;
    void loadThreads();
    return () => {
      mounted.current = false;
    };
  }, [loadThreads]);

  // Refresh thread list when a turn completes (new title / ordering / new thread).
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current !== "ready" && status === "ready") {
      void loadThreads();
    }
    prevStatus.current = status;
  }, [status, loadThreads]);

  // ── Thread selection ───────────────────────────────────────────────────────
  async function selectThread(threadId: string) {
    setActiveThreadId(threadId);
    threadIdRef.current = threadId;
    try {
      const res = await fetch(
        `/api/agents/${assistantId}/chat?threadId=${encodeURIComponent(threadId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as { ok: boolean; messages?: MessageRow[] };
      if (!json.ok || !json.messages) return;
      const seeded: UIMessage[] = json.messages.map((m) => ({
        id: m.id,
        role: m.role === "assistant" ? "assistant" : "user",
        parts: [{ type: "text", text: m.content }],
      }));
      setMessages(seeded);
    } catch {
      // ignore
    }
  }

  function newChat() {
    setActiveThreadId(undefined);
    threadIdRef.current = undefined;
    setMessages([]);
    setInput("");
  }

  function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    void sendMessage({ text });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* Thread list */}
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={newChat}
          className="w-full justify-start"
        >
          <MessageSquarePlus className="size-3.5" />
          New chat
        </Button>
        <ScrollArea className="max-h-[420px]">
          <ul className="space-y-1 pr-2">
            {threads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => void selectThread(t.id)}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                    t.id === activeThreadId
                      ? "bg-[var(--surface-2)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)]",
                  )}
                >
                  <span className="block truncate">{t.title ?? "Untitled chat"}</span>
                  <span className="mt-0.5 block text-[10px] text-[var(--text-tertiary)]">
                    {relativeTime(t.last_message_at)}
                  </span>
                </button>
              </li>
            ))}
            {threads.length === 0 && (
              <li className="px-3 py-2 text-[11px] text-[var(--text-tertiary)]">
                No conversations yet.
              </li>
            )}
          </ul>
        </ScrollArea>
      </div>

      {/* Conversation */}
      <div className="flex h-[480px] flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-3 p-4">
            {messages.length === 0 ? (
              <EmptyChat displayName={displayName} />
            ) : (
              messages.map((m) => <MessageBubble key={m.id} message={m} />)
            )}
            {status === "submitted" && <TypingIndicator />}
          </div>
        </ScrollArea>

        {/* Composer */}
        <div className="border-t border-[var(--border-subtle)] p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder={`Message ${displayName}…`}
              className="max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus-visible:border-[var(--accent)]"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={isStreaming || input.trim() === ""}
              aria-label="Send message"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Message rendering ─────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("flex max-w-[85%] flex-col gap-1.5", isUser && "items-end")}>
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            if (part.text === "") return null;
            return (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
                  isUser
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-2)] text-[var(--text-primary)]",
                )}
              >
                {part.text}
              </div>
            );
          }

          // Tool-call steps: surface compactly. Static tool parts are typed
          // `tool-<name>`; dynamic ones use `dynamic-tool` with a `toolName`.
          if (part.type === "dynamic-tool") {
            return <ToolChip key={i} name={part.toolName} state={part.state} />;
          }
          if (part.type.startsWith("tool-")) {
            const name = part.type.slice("tool-".length);
            const state = "state" in part && typeof part.state === "string" ? part.state : undefined;
            return <ToolChip key={i} name={name} state={state} />;
          }

          // Unknown part types (reasoning, files, etc.) — ignore gracefully.
          return null;
        })}
      </div>
    </div>
  );
}

function ToolChip({ name, state }: { name: string; state?: string }) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] text-[var(--text-tertiary)]">
      <Wrench className="size-3" />
      called {name}
      {state && state !== "output-available" && (
        <span className="text-[var(--text-tertiary)]/70">· {state}</span>
      )}
    </span>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl bg-[var(--surface-2)] px-3.5 py-2.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-tertiary)] motion-reduce:animate-none"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyChat({ displayName }: { displayName: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg"
        style={{ backgroundColor: "var(--surface-2)", color: "var(--text-tertiary)" }}
        aria-hidden
      >
        <MessagesSquare className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        Ask {displayName} about its work…
      </p>
    </div>
  );
}
