import { describe, it, expect } from "vitest";
import { getServiceClient } from "@/lib/supabase/server";

describe("viral_observations table", () => {
  it("can insert with required fields", async () => {
    const supabase = getServiceClient();
    const externalId = `test-${Date.now()}`;
    const { data, error } = await supabase
      .from("viral_observations")
      .insert({
        source: "youtube",
        external_id: externalId,
        url: "https://youtube.com/shorts/test",
        raw_payload: { test: true },
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.external_id).toBe(externalId);
    await supabase.from("viral_observations").delete().eq("id", data!.id);
  });

  it("rejects invalid source", async () => {
    const supabase = getServiceClient();
    const { error } = await supabase
      .from("viral_observations")
      .insert({
        source: "facebook",
        external_id: "x",
        url: "https://x",
        raw_payload: {},
      });
    expect(error?.message).toMatch(/check constraint|violates/i);
  });
});
