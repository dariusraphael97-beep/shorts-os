import { describe, it, expect } from "vitest";
import { getServiceClient } from "@/lib/supabase/server";

describe("niches table", () => {
  it("can insert and read a niche", async () => {
    const supabase = getServiceClient();
    const slug = `test-niche-${Date.now()}`;

    const { data: inserted, error: insertErr } = await supabase
      .from("niches")
      .insert({ slug, display_name: "Test Niche" })
      .select()
      .single();
    expect(insertErr).toBeNull();
    expect(inserted?.slug).toBe(slug);

    await supabase.from("niches").delete().eq("id", inserted!.id);
  });
});
