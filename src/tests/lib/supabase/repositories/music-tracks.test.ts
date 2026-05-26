import { describe, it, expect, vi } from "vitest";
import { pickAmbientCinematicTrack } from "@/lib/supabase/repositories/music-tracks";

describe("pickAmbientCinematicTrack", () => {
  it("queries music_tracks with the spec filters and returns first row", async () => {
    const single = vi.fn(async () => ({ data: { id: "mt1", title: "Calm Drive", artist: null, local_path: "https://blob/x.mp3", duration_seconds: 120, genre: "ambient", energy_level: 2 }, error: null }));
    const limit = vi.fn(() => ({ single }));
    const order = vi.fn(() => ({ limit }));
    const inFn = vi.fn(() => ({ order }));
    const eq = vi.fn(() => ({ in: inFn }));
    const inOuter = vi.fn(() => ({ eq }));
    const select = vi.fn(() => ({ in: inOuter }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as never;

    const row = await pickAmbientCinematicTrack(supabase);
    expect(from).toHaveBeenCalledWith("music_tracks");
    expect(inOuter).toHaveBeenCalledWith("genre", ["ambient", "cinematic"]);
    expect(eq).toHaveBeenCalledWith("requires_attribution", false);
    expect(inFn).toHaveBeenCalledWith("energy_level", [2, 3]);
    expect(row?.id).toBe("mt1");
  });

  it("returns null when no row matches (table empty)", async () => {
    const single = vi.fn(async () => ({ data: null, error: { code: "PGRST116" } }));
    const stub = () => ({ single });
    const supabase = {
      from: () => ({ select: () => ({ in: () => ({ eq: () => ({ in: () => ({ order: () => ({ limit: stub }) }) }) }) }) })
    } as never;
    const row = await pickAmbientCinematicTrack(supabase);
    expect(row).toBeNull();
  });
});
