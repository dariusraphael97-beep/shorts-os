import type { SupabaseClient } from "@supabase/supabase-js";
import type { LongformPipelineDeps } from "@/lib/agents/longform/orchestrator";
import { runLongformWriter } from "@/lib/agents/longform/writer";
import { runStylePicker } from "@/lib/agents/longform/style-picker";
import { runBeatPlanner } from "@/lib/agents/longform/beat-planner";
import { pickLongformVoice } from "@/lib/agents/voice-coach";
import { createProduceLongformJob, finishJobSuccess, finishJobFailure } from "@/lib/supabase/repositories/jobs";
import { createLongformDraft } from "@/lib/supabase/repositories/longform";
import { recordLongformLedger } from "@/lib/supabase/repositories/decisions";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";

export function buildLongformDeps(supabase: SupabaseClient): LongformPipelineDeps {
  return {
    runWriter: runLongformWriter,
    runStylePicker,
    runBeatPlanner,
    pickVoice: pickLongformVoice,
    createJob: (a) => createProduceLongformJob(supabase, a),
    createDraft: (a) => createLongformDraft(supabase, a),
    recordLedger: (rows) => recordLongformLedger(supabase, rows),
    enqueueRender: (a) =>
      enqueueRenderJob(supabase, {
        jobType: "render_longform",
        payload: { your_video_id: a.yourVideoId },
        yourVideoId: a.yourVideoId,
      }).then((j) => ({ id: j.id })),
    finishJob: (jobId) => finishJobSuccess(supabase, jobId),
    failJob: (jobId, error) => finishJobFailure(supabase, jobId, error),
  };
}
