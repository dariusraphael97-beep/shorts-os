import "server-only";
import { after } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { getDefaultChannel, saveOnboarding, markOnboardingComplete } from "@/lib/supabase/repositories/channels";
import { loadEnv } from "@/lib/env";
import { runOnboardingScan } from "@/lib/onboarding/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({
  // Optional: the redesigned setup screen no longer asks for goals. A provided
  // value is still validated (an invalid enum 400s); absence is accepted.
  creatorGoals: z.enum(["monetize", "grow_subscribers", "test_niche", "other"]).optional(),
  interests: z.array(z.string()).default([]),
});

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try { body = BodySchema.parse(await req.json()); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : "bad body" }, { status: 400 }); }

  const supabase = getServiceClient();
  const channel = await getDefaultChannel(supabase);
  await saveOnboarding(supabase, { channelId: channel.id, creatorGoals: body.creatorGoals, interests: body.interests });
  // ^ creatorGoals may be undefined here; saveOnboarding writes null when omitted.
  await markOnboardingComplete(supabase, channel.id);

  // Fire-and-forget 3-job chain (search → classify → cluster) after response.
  const env = loadEnv();
  const origin = new URL(req.url).origin;
  after(() => runOnboardingScan({ origin, secret: env.CRON_SECRET }));

  return Response.json({ ok: true }, { status: 200 });
}
