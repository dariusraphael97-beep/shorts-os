import type { StreamEvent } from "@/lib/agents/types";

/** Parse a single SSE frame ("event: <name>\ndata: <json>") into a StreamEvent, or null. */
export function parseSseFrame(frame: string): StreamEvent | null {
  const lines = frame.split("\n");
  let eventName: string | null = null;
  let dataLine: string | null = null;
  for (const line of lines) {
    if (line.startsWith("event: ")) eventName = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataLine = line.slice(6);
  }
  if (!eventName || !dataLine) return null;
  try {
    return { type: eventName, data: JSON.parse(dataLine) } as StreamEvent;
  } catch {
    return null;
  }
}
