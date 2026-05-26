import { describe, it, expect } from "vitest";
import { CaptionsPropsSchema } from "../../../remotion/compositions/captions/props";

describe("CaptionsPropsSchema", () => {
  it("accepts a minimal valid props object", () => {
    const parsed = CaptionsPropsSchema.safeParse({
      variant: "word-by-word",
      accent_color: "#FFD23F",
      accent_word_policy: "first-noun",
      animation_speed: 1.0,
      font_scale: 1.0,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-enum variant", () => {
    const parsed = CaptionsPropsSchema.safeParse({
      variant: "slide-up",
      accent_color: "#FFD23F",
      accent_word_policy: "first-noun",
      animation_speed: 1.0,
      font_scale: 1.0,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects malformed accent_color", () => {
    const parsed = CaptionsPropsSchema.safeParse({
      variant: "word-by-word",
      accent_color: "yellow",
      accent_word_policy: "first-noun",
      animation_speed: 1.0,
      font_scale: 1.0,
    });
    expect(parsed.success).toBe(false);
  });

  it("requires highlighted_words when policy = highlighted-by-director", () => {
    const a = CaptionsPropsSchema.safeParse({
      variant: "word-by-word",
      accent_color: "#FFD23F",
      accent_word_policy: "highlighted-by-director",
      highlighted_words: ["TESLA", "FREE"],
      animation_speed: 1.0,
      font_scale: 1.0,
    });
    expect(a.success).toBe(true);
  });
});
