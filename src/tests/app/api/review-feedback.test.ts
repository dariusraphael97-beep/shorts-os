import { describe, it, expect } from "vitest";
import { FeedbackBody } from "@/app/api/lab/[videoId]/review/feedback/route";

describe("FeedbackBody schema", () => {
  it("accepts a valid body", () => {
    const result = FeedbackBody.safeParse({
      videoReviewId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      suggestionIndex: 0,
      actionTaken: "accepted",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid actionTaken value", () => {
    const result = FeedbackBody.safeParse({
      videoReviewId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      suggestionIndex: 1,
      actionTaken: "skipped",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative suggestionIndex", () => {
    const result = FeedbackBody.safeParse({
      videoReviewId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      suggestionIndex: -1,
      actionTaken: "ignored",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid videoReviewId", () => {
    const result = FeedbackBody.safeParse({
      videoReviewId: "not-a-uuid",
      suggestionIndex: 0,
      actionTaken: "partial",
    });
    expect(result.success).toBe(false);
  });
});
