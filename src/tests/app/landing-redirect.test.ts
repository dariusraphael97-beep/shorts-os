import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));
vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn(() => ({})) }));
const getDefaultChannel = vi.fn();
vi.mock("@/lib/supabase/repositories/channels", () => ({
  getDefaultChannel: (...a: Parameters<typeof getDefaultChannel>) => getDefaultChannel(...a),
}));

import HomePage from "@/app/page";

beforeEach(() => getDefaultChannel.mockReset());

describe("/ landing guard", () => {
  it("redirects to /onboarding when onboarding is not complete", async () => {
    getDefaultChannel.mockResolvedValue({ onboarding_completed_at: null });
    await expect(HomePage()).rejects.toThrow("REDIRECT:/onboarding");
  });
  it("redirects to /niches when onboarding is complete", async () => {
    getDefaultChannel.mockResolvedValue({ onboarding_completed_at: "2026-05-30T00:00:00Z" });
    await expect(HomePage()).rejects.toThrow("REDIRECT:/niches");
  });
});
