# Image-model bake-off verdict — doodle-essay preset

**Date:** 2026-06-12. **Probes:** 4 prompts (a: emphasis ALL-CAPS caption + yellow kitchen, b: cookbook + red circle + lowercase label, c: night navy no-text, d: sunrise no-text) × 2 models (gpt_image_2 quality=low resolution=2k vs nano_banana_2 resolution=2k), assembled through the real `assembleImagePrompt` + `stick-figure-animated` preset. Judged side-by-side against reference frames (`/tmp/doodle-ref-audio/frames/`).

## Winner: **gpt_image_2 (quality: low)** — preset stays as committed, no code change.

- **ALL-CAPS caption (a):** gpt rendered "EVERY SINGLE MEAL" bold, crisp, and **top-of-frame as prompted**; nano put it at the bottom (placement miss) with weaker letterforms. The reference's hand-lettered boxes (frame_0003) are bold and confident — gpt matches.
- **Red callout + lowercase label (b):** both drew the red circle correctly and rendered the label. gpt invented pseudo-recipe text on the cookbook page — which is actually *faithful*: the reference fills prop pages with scrawl/pseudo-text too (frame_0007's fake-Greek page). Not a defect for this style.
- **Background obedience (c, d):** both obeyed navy/sunrise moods. gpt's fills are **confident and flat** like the reference; nano's sunrise sky is streaky marker fill with white gaps — crude in the wrong way (sloppy, not confident-crude).
- **Crude-wobbly fidelity:** nano has marginally more hand-wobble (its night scene is charmingly lopsided), but gpt still reads unmistakably as doodle — it does NOT beautify into illustration. And gpt is **consistent** across all four probes; nano's style drifts (soft → sketchy → marker-streak).
- **quality:"low" crispness:** at 2k source → 1080p delivery, gpt lines are clean with no artifacts. No need for higher quality tier (~0.75 cr/img stands).

Files: `{gpt,nano}_{a-emphasis-caption,b-evidence-label-redcircle,c-night-notext,d-sunrise-notext}.png`. Sunrise pair initially failed on a transient Higgsfield HTTP 502 (both models); succeeded on retry.
