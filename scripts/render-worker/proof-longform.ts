// scripts/render-worker/proof-longform.ts
// Local, cost-bounded proof render: renders ONLY chapter 0 of a longform draft end-to-end
// (real Higgsfield images → Ken-Burns → Cartesia VO → compose) to a local .mp4 — no Blob
// upload, no callback. For verifying the live Higgsfield wiring before a full render.
//
// Usage:
//   HIGGSFIELD_ENABLED=1 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... CARTESIA_API_KEY=... \
//     node --import tsx proof-longform.ts [your_video_id]
import { getSupabase } from "./lib/supabase.ts";
import { runRenderLongform } from "./handlers/render-longform.ts";

const videoId = process.argv[2] ?? "b36f12c9-74b0-488e-a4ff-239c36352a95";

async function main() {
  const supabase = getSupabase();
  console.log(`[proof] rendering chapter 0 of draft ${videoId} …`);
  const out = await runRenderLongform(
    { id: "proof-local", payload: { your_video_id: videoId } },
    supabase,
    { maxChapters: 1, maxBeatsPerChapter: 15, skipUpload: true },
  );
  console.log("\n[proof] DONE");
  console.log("  file     :", out.render_artifact_url);
  console.log("  duration :", out.duration_seconds_actual, "s");
  console.log("  markers  :", JSON.stringify(out.chapter_markers));
  console.log("\n[proof] trace:\n" + out.debug_trace);
}

main().catch((err) => {
  console.error("[proof] FAILED:", err?.message ?? err);
  if (err?.trace) console.error("[proof] trace:\n" + err.trace);
  process.exit(1);
});
