import { describe, it, expect } from "vitest";
import { getProduceVideoJobByTopic } from "@/lib/supabase/repositories/jobs";
import { getLatestYourVideoByTopic } from "@/lib/supabase/repositories/your-videos";
import { getLatestCompilationDraftByTopic } from "@/lib/supabase/repositories/compilation-drafts";

function clientReturning(table: string, row: unknown) {
  const terminal = { order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) };
  const chainable: { eq: () => typeof chainable & typeof terminal; order: typeof terminal["order"] } = {
    eq: () => ({ ...chainable, ...terminal }),
    order: terminal.order,
  };
  return {
    from: (t: string) => {
      if (t !== table) throw new Error(`unexpected table ${t}`);
      return { select: () => chainable };
    },
  } as never;
}

describe("topic-keyed reads", () => {
  it("getProduceVideoJobByTopic returns the job row", async () => {
    const job = await getProduceVideoJobByTopic(clientReturning("jobs", { id: "j1", status: "running", current_agent: "writer", progress_pct: 60 }), "t1");
    expect(job?.id).toBe("j1");
  });
  it("getLatestYourVideoByTopic returns null when none", async () => {
    const v = await getLatestYourVideoByTopic(clientReturning("your_videos", null), "t1");
    expect(v).toBeNull();
  });
  it("getLatestCompilationDraftByTopic returns the id row", async () => {
    const d = await getLatestCompilationDraftByTopic(clientReturning("compilation_drafts", { id: "cd1" }), "t1");
    expect(d?.id).toBe("cd1");
  });
});
