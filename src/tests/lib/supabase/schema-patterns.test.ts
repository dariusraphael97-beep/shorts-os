import { describe, it, expect } from "vitest";
import { getServiceClient } from "@/lib/supabase/server";

describe("patterns table", () => {
  it("computes win_rate_pct as a generated column", async () => {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("patterns")
      .insert({ kind: "hook", value: { type: "question" }, win_count: 7, total_count: 10 })
      .select()
      .single();
    expect(error).toBeNull();
    expect(Number(data!.win_rate_pct)).toBeCloseTo(70, 1);
    await supabase.from("patterns").delete().eq("id", data!.id);
  });
});
