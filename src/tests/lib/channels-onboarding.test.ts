import { describe, it, expect, vi } from "vitest";
import { saveOnboarding, markOnboardingComplete } from "@/lib/supabase/repositories/channels";

/** Minimal chainable mock: .from(table).update(payload).eq(col,val) → { error: null }.
 * Records the table + payload + eq args so we can assert on them. */
function mockClient() {
  const calls: { table: string; payload?: Record<string, unknown>; eq?: [string, unknown] } = { table: "" };
  const client = {
    from(table: string) {
      calls.table = table;
      return {
        update(payload: Record<string, unknown>) {
          calls.payload = payload;
          return {
            async eq(col: string, val: unknown) {
              calls.eq = [col, val];
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

describe("channels onboarding repo", () => {
  it("saveOnboarding updates goals + interests on the channel id", async () => {
    const { client, calls } = mockClient();
    await saveOnboarding(client as never, {
      channelId: "ch-1",
      creatorGoals: "monetize",
      interests: ["ai", "productivity"],
    });
    expect(calls.table).toBe("channels");
    expect(calls.payload).toMatchObject({ creator_goals: "monetize", interests: ["ai", "productivity"] });
    expect(calls.eq).toEqual(["id", "ch-1"]);
  });

  it("saveOnboarding writes creator_goals: null when no goal is provided", async () => {
    const { client, calls } = mockClient();
    await saveOnboarding(client as never, { channelId: "ch-1", interests: ["ai"] });
    expect(calls.payload).toMatchObject({ creator_goals: null, interests: ["ai"] });
    expect(calls.eq).toEqual(["id", "ch-1"]);
  });

  it("markOnboardingComplete stamps onboarding_completed_at on the channel id", async () => {
    const { client, calls } = mockClient();
    await markOnboardingComplete(client as never, "ch-2");
    expect(calls.table).toBe("channels");
    expect(typeof (calls.payload as { onboarding_completed_at: string }).onboarding_completed_at).toBe("string");
    expect(calls.eq).toEqual(["id", "ch-2"]);
  });
});
