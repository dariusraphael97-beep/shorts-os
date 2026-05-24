import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = getServiceClient();

  // Check Supabase is reachable
  let dbStatus: "ok" | "error" = "ok";
  let dbError: string | undefined;
  try {
    const { error } = await supabase.from("niches").select("id").limit(1);
    // Suppress "table does not exist" errors — the schema isn't created yet.
    // Match both the legacy PostgREST/Postgres message and the modern
    // PostgREST schema-cache message.
    if (
      error &&
      !error.message.match(
        /relation.*does not exist|could not find the table.*in the schema cache/i,
      )
    ) {
      dbStatus = "error";
      dbError = error.message;
    }
  } catch (e) {
    dbStatus = "error";
    dbError = e instanceof Error ? e.message : String(e);
  }

  // Per-table liveness counts. Each wrapped so a single failure (e.g. table
  // not yet created) doesn't fail the whole probe.
  const checks: Record<string, unknown> = {};
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const { count } = await supabase
      .from("niches")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);
    checks.activeNiches = count ?? 0;
  } catch (e) {
    checks.activeNiches = { error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const { count } = await supabase
      .from("viral_observations")
      .select("*", { count: "exact", head: true })
      .gte("observed_at", since24h);
    checks.viralObservations_last24h = count ?? 0;
  } catch (e) {
    checks.viralObservations_last24h = {
      error: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    const { count } = await supabase
      .from("topic_queue")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since24h);
    checks.topicQueue_last24h = count ?? 0;
  } catch (e) {
    checks.topicQueue_last24h = {
      error: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    const { count } = await supabase
      .from("agents")
      .select("*", { count: "exact", head: true });
    checks.agentsSeeded = count ?? 0;
  } catch (e) {
    checks.agentsSeeded = {
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return NextResponse.json({
    status: dbStatus === "ok" ? "healthy" : "degraded",
    db: { status: dbStatus, error: dbError },
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    checks,
  });
}
