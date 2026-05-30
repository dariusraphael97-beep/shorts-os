import { NextResponse } from "next/server";
import { Resend } from "resend";
import { assertCronAuth, serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import { loadEnv } from "@/lib/env";
import { isoWeekStart } from "@/lib/niches/current-week";
import { listDigestRankedClusters } from "@/lib/supabase/repositories/niche-clusters";
import { renderDigest } from "@/lib/digest/render-digest";
import { insertDigestRun } from "@/lib/supabase/repositories/digest-runs";
import { insertNichePrediction } from "@/lib/supabase/repositories/niche-predictions";
import { runDigestSend } from "@/lib/digest/send-digest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Cron triggers via GET (Vercel). The admin preview "Resend now" button POSTs with ?force=1
// to bypass cron auth (it is itself behind the app, not publicly reachable without secrets).
async function handle(req: Request): Promise<Response> {
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force) {
    try {
      assertCronAuth(req);
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }
  }

  const env = loadEnv();
  const supabase = getServiceClient();
  const weekStart = isoWeekStart(new Date());
  const canSend = !!env.RESEND_API_KEY;
  const recipient = env.DIGEST_RECIPIENT ?? null;
  const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

  try {
    const result = await runDigestSend({
      weekStart,
      recipient,
      canSend,
      fetchClusters: async () => {
        const rows = await listDigestRankedClusters(supabase, weekStart);
        return rows.map((c) => ({
          ...c,
          production_fit: c.production_fit ?? "manual_only",
          discovery_state: c.discovery_state ?? "public",
        }));
      },
      renderHtml: renderDigest,
      send: async ({ to, html, text, subject }) => {
        if (!resend) throw new Error("RESEND_API_KEY not set");
        const { data, error } = await resend.emails.send({
          from: "onboarding@resend.dev",
          to,
          subject,
          html,
          text,
        });
        if (error) throw new Error(error.message ?? "resend send failed");
        return { id: data?.id ?? "" };
      },
      insertDigestRun: async (r) => {
        await insertDigestRun(supabase, r);
      },
      insertPrediction: async (p) => {
        await insertNichePrediction(supabase, p);
      },
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("digest-send failed", e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}

export async function GET(req: Request): Promise<Response> {
  return handle(req);
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}
