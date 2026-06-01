import "server-only";
import { NextResponse } from "next/server";
import type { ModelMessage } from "ai";
import { serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import { getAssistantById } from "@/lib/supabase/repositories/assistants";
import {
  createChatThread,
  appendChatMessage,
  getThreadMessages,
  touchThread,
} from "@/lib/supabase/repositories/assistants";
import { buildChatStream } from "@/lib/agents/chat/engine";

export const dynamic = "force-dynamic";

// POST /api/agents/[id]/chat
//
// Body: { threadId?: string; message: string }
//
// Streams a UI-message SSE response for the given assistant. Persists the
// user message before streaming and the final assistant reply in onFinish.
// On new conversations (no threadId supplied) the created thread's id is
// returned in the `x-thread-id` response header so clients can stitch
// subsequent turns into the same thread.
//
// Streaming API used (AI SDK v6):
//   result.toUIMessageStreamResponse({ headers, onFinish })
//   onFinish receives { responseMessage: UIMessage } whose `.parts` array
//   contains TextUIPart items ({ type: 'text', text: string }). We join all
//   text parts to produce the assistant's persisted content.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = getServiceClient();

  // --- pre-stream work (wrapped; errors return JSON) ---
  let threadId: string;
  let result: ReturnType<typeof buildChatStream>;

  try {
    // 1. Guard: assistant must exist (any state — disabled assistants can still
    //    receive messages; the system prompt handles disabled state messaging).
    const assistant = await getAssistantById(supabase, id);
    if (!assistant) {
      return NextResponse.json({ ok: false, error: "assistant_not_found" }, { status: 404 });
    }

    // 2. Parse + validate body.
    const body = (await req.json()) as { threadId?: unknown; message?: unknown };
    if (typeof body.message !== "string" || body.message.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "message must be a non-empty string" },
        { status: 400 },
      );
    }
    const message: string = body.message;
    const incomingThreadId = typeof body.threadId === "string" ? body.threadId : undefined;

    // 3. Thread: use existing or create a new one.
    if (incomingThreadId) {
      threadId = incomingThreadId;
    } else {
      const thread = await createChatThread(supabase, { assistantId: id });
      threadId = thread.id;
    }

    // 4. Persist the user message.
    await appendChatMessage(supabase, { threadId, role: "user", content: message });

    // 5. Load history (user + assistant turns only; system prompt added by engine).
    const rows = await getThreadMessages(supabase, threadId);
    const messages: ModelMessage[] = rows.map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
    }));

    // 6. Build the stream (does NOT start streaming yet).
    result = buildChatStream({ supabase, assistantId: id, messages });
  } catch (e) {
    console.error("chat route pre-stream error", e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }

  // --- stream (cannot be wrapped in try/catch without consuming it) ---
  // Capture threadId in closure for onFinish.
  const capturedThreadId = threadId;

  return result.toUIMessageStreamResponse({
    headers: { "x-thread-id": capturedThreadId },
    onFinish: async (event) => {
      try {
        // Extract text from all TextUIPart items in the response message.
        const text = event.responseMessage.parts
          .filter((p): p is { type: "text"; text: string } & typeof p => p.type === "text")
          .map((p) => p.text)
          .join("");

        if (text) {
          await appendChatMessage(supabase, {
            threadId: capturedThreadId,
            role: "assistant",
            content: text,
          });
        }
        await touchThread(supabase, capturedThreadId);
      } catch (persistErr) {
        // Persistence failure must not crash the already-sent response.
        console.error("chat route onFinish persistence error", persistErr);
      }
    },
  });
}
