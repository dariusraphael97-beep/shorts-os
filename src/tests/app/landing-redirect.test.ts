import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }) }));

import HomePage from "@/app/page";

describe("/ landing", () => {
  it("redirects to /niches", () => {
    expect(() => HomePage()).toThrow("REDIRECT:/niches");
  });
});
