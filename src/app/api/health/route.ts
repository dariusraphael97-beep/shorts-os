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

  return NextResponse.json({
    status: dbStatus === "ok" ? "healthy" : "degraded",
    db: { status: dbStatus, error: dbError },
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  });
}
