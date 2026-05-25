// src/lib/sse.ts
//
// Helper for encoding StreamEvents into the SSE wire format.
// The dispatch route enqueues these into a ReadableStream that's
// returned with Content-Type: text/event-stream.

import "server-only";
import type { StreamEvent } from "@/lib/agents/types";

const encoder = new TextEncoder();

export function encodeSseEvent(event: StreamEvent): Uint8Array {
  const dataJson = JSON.stringify(event.data);
  // SSE framing: "event: <name>\ndata: <json>\n\n"
  // JSON.stringify escapes newlines so the data line stays single-line.
  return encoder.encode(`event: ${event.type}\ndata: ${dataJson}\n\n`);
}
