import "server-only";
import { NextResponse } from "next/server";
import { generateText } from "ai";
import { getServiceClient } from "@/lib/supabase/server";
import { getClaudeModel } from "@/lib/ai/gateway";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const supabase = getServiceClient();
    const { data: obs, error } = await supabase
      .from("viral_observations")
      .select("id, title, source, channel_name, views, hook_text, raw_payload")
      .eq("id", id)
      .single();
    if (error || !obs) {
      return NextResponse.json({ ok: false, error: error?.message ?? "Not found" }, { status: 404 });
    }

    const prompt = `You are analyzing a viral short for a YouTube content strategist.

Title: ${obs.title ?? "(no title)"}
Source: ${obs.source}
Channel: ${obs.channel_name ?? "unknown"}
Views: ${obs.views ?? "unknown"}
Hook text excerpt: ${obs.hook_text ?? "(not extracted)"}
Raw metadata: ${JSON.stringify(obs.raw_payload).slice(0, 800)}

In 3-5 short sentences, explain WHY this short might be performing. Focus on: hook structure, format choice, niche fit, and pacing — whatever applies. Be specific, no platitudes.`;

    const result = await generateText({
      model: getClaudeModel("claude-haiku-4-5"),
      prompt,
      maxOutputTokens: 400,
    });

    return NextResponse.json({ ok: true, breakdown: result.text });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
