import { describe, it, expect } from "vitest";
import { getServiceClient } from "@/lib/supabase/server";

describe("topic_queue table", () => {
  it("defaults state to queued", async () => {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("topic_queue")
      .insert({
        source: "reddit",
        title: "A wild test topic",
        raw_payload: { test: true },
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.state).toBe("queued");
    await supabase.from("topic_queue").delete().eq("id", data!.id);
  });
});
