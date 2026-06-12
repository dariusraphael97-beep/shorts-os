// src/tests/render-worker/find-photo.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the worker libs find-photo depends on. The specifiers resolve to the same
// absolute module files that find-photo imports via its own './image-search.ts' /
// './claude-vision.ts' relative paths, so the mocks are wired through.
vi.mock("../../../scripts/render-worker/lib/image-search.ts", () => ({
  searchImageCandidates: vi.fn(),
  downloadToFile: vi.fn(),
}));
vi.mock("../../../scripts/render-worker/lib/claude-vision.ts", () => ({
  vetPhoto: vi.fn(),
}));

import { findUsablePhoto } from "../../../scripts/render-worker/lib/find-photo";
import {
  searchImageCandidates,
  downloadToFile,
} from "../../../scripts/render-worker/lib/image-search";
import { vetPhoto } from "../../../scripts/render-worker/lib/claude-vision";

const mockSearch = vi.mocked(searchImageCandidates);
const mockDownload = vi.mocked(downloadToFile);
const mockVet = vi.mocked(vetPhoto);

const base = { subject: "BMW B58 engine", workDir: "/tmp/work", beatKey: "beat3" };

describe("render-worker findUsablePhoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the first downloaded candidate whose vetPhoto.usable is true", async () => {
    mockSearch.mockResolvedValue([
      "https://e.com/0.jpg",
      "https://e.com/1.jpg",
      "https://e.com/2.jpg",
    ]);
    mockDownload.mockResolvedValue(true);
    mockVet
      .mockResolvedValueOnce({ usable: false, reason: "illustration" })
      .mockResolvedValueOnce({ usable: true, reason: "clean photo" });

    const out = await findUsablePhoto({ ...base, query: "bmw b58 engine" });

    expect(out).toBe("/tmp/work/beat3_cand1.jpg");
    // Stopped vetting after the first usable hit (2 vet calls, not 3).
    expect(mockVet).toHaveBeenCalledTimes(2);
    expect(mockVet).toHaveBeenLastCalledWith({
      imagePath: "/tmp/work/beat3_cand1.jpg",
      subject: "BMW B58 engine",
    });
  });

  it("skips candidates that fail to download and does not vet them", async () => {
    mockSearch.mockResolvedValue(["https://e.com/0.jpg", "https://e.com/1.jpg"]);
    mockDownload
      .mockResolvedValueOnce(false) // cand0 download fails
      .mockResolvedValueOnce(true); // cand1 downloads
    mockVet.mockResolvedValue({ usable: true, reason: "ok" });

    const out = await findUsablePhoto({ ...base, query: "bmw b58 engine" });

    expect(out).toBe("/tmp/work/beat3_cand1.jpg");
    // vetPhoto only called for the candidate that actually downloaded.
    expect(mockVet).toHaveBeenCalledTimes(1);
    expect(mockVet).toHaveBeenCalledWith({
      imagePath: "/tmp/work/beat3_cand1.jpg",
      subject: "BMW B58 engine",
    });
  });

  it("returns null when no candidate passes vetting", async () => {
    mockSearch.mockResolvedValue(["https://e.com/0.jpg", "https://e.com/1.jpg"]);
    mockDownload.mockResolvedValue(true);
    mockVet.mockResolvedValue({ usable: false, reason: "diagram" });

    const out = await findUsablePhoto({ ...base, query: "bmw b58 engine" });
    expect(out).toBeNull();
  });

  it("returns null when search yields no candidates", async () => {
    mockSearch.mockResolvedValue([]);

    const out = await findUsablePhoto({ ...base, query: "bmw b58 engine" });
    expect(out).toBeNull();
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockVet).not.toHaveBeenCalled();
  });

  it("returns null for a blank query without searching", async () => {
    const out = await findUsablePhoto({ ...base, query: "   " });
    expect(out).toBeNull();
    expect(mockSearch).not.toHaveBeenCalled();
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockVet).not.toHaveBeenCalled();
  });

  it("limits work to maxCandidates even when more URLs are returned", async () => {
    mockSearch.mockResolvedValue([
      "https://e.com/0.jpg",
      "https://e.com/1.jpg",
      "https://e.com/2.jpg",
      "https://e.com/3.jpg",
      "https://e.com/4.jpg",
    ]);
    mockDownload.mockResolvedValue(true);
    mockVet.mockResolvedValue({ usable: false, reason: "no" });

    const out = await findUsablePhoto({ ...base, query: "bmw", maxCandidates: 2 });

    expect(out).toBeNull();
    // Only the first `maxCandidates` URLs are downloaded/vetted.
    expect(mockDownload).toHaveBeenCalledTimes(2);
    expect(mockVet).toHaveBeenCalledTimes(2);
    // Asks search for a few extra (max + 2) so download failures have headroom.
    expect(mockSearch).toHaveBeenCalledWith("bmw", 4);
  });

  it("requests maxCandidates+2 from search by default", async () => {
    mockSearch.mockResolvedValue([]);
    await findUsablePhoto({ ...base, query: "bmw" });
    // default max = 4 → asks for 6.
    expect(mockSearch).toHaveBeenCalledWith("bmw", 6);
  });
});
