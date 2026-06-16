// scripts/render-worker/refix-longform.ts
// One-off: re-render ONLY the chapters whose chapter_N.mp4 was deleted from the workdir, reusing the
// already-approved beat images (reuseExistingImages) so it costs no image-gen — fixes the A/V drift
// from the chunk-offset bug by re-synthesizing those chapters' VO with the corrected timing path.
//   env -u ANTHROPIC_BASE_URL node --import tsx --env-file=../../.env.local refix-longform.ts [id]
import { getSupabase } from "./lib/supabase.ts";
import { runRenderLongform } from "./handlers/render-longform.ts";

const videoId = process.argv[2] ?? "32c22a4d-6bb5-424f-a4d7-40d6b22c6d72";

async function main() {
  const supabase = getSupabase();
  console.log(`[refix] re-rendering deleted chapters of ${videoId} (reuse images, skip upload) …`);
  const out = await runRenderLongform(
    { id: "refix-local", payload: { your_video_id: videoId } },
    supabase,
    { reuseExistingImages: true, skipUpload: true },
  );
  console.log("\n[refix] DONE");
  console.log("  file     :", out.render_artifact_url);
  console.log("  duration :", out.duration_seconds_actual, "s");
  console.log("  markers  :", JSON.stringify(out.chapter_markers));
  console.log("\n[refix] trace:\n" + out.debug_trace);
}

main().catch((err) => {
  console.error("[refix] FAILED:", err?.message ?? err);
  if (err?.trace) console.error("[refix] trace:\n" + err.trace);
  process.exit(1);
});
