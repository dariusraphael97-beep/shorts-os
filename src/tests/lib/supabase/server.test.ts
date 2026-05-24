import { describe, it, expect } from "vitest";
import { getServiceClient } from "@/lib/supabase/server";

describe("server supabase client", () => {
  it("returns a client with auth from env", () => {
    const client = getServiceClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
  });

  it("returns the same instance on repeated calls (singleton)", () => {
    const a = getServiceClient();
    const b = getServiceClient();
    expect(a).toBe(b);
  });
});
