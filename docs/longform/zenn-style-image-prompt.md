# Zenn stick-figure image prompt + model (source of truth)

Captured verbatim from the "recreate Zenn" tutorial (YouTube `WODnqHPLR38`, by "Danny"),
which is the playbook for the crude hand-drawn stick-figure look of YouTuber **Zenn (@Zenn0009)**.

## Model (verified 2026-06-02)
- **Use `gpt_image_2` (GPT Image 2)**, 16:9. NOT Soul V2 — Soul V2 is photoreal-tuned and produces
  messy/broken stick figures even with this exact prompt (tested side-by-side and rejected).
- Cost surface @16:9: low/1k 0.5cr, **low/2k 0.75cr (production sweet spot — flat line art needs no
  more)**, medium/2k 3cr, high/2k 7cr. A full ~8-min video ≈ 70-110 imgs ≈ **~50-80 credits**.
- `higgsfield.ts` is currently hardcoded to Soul V2 — the stick-figure preset must parameterize the
  model/quality/resolution per style preset.

## The prompt (Danny's, ~verbatim — drives one image per script timestamp)

> You are going to generate images for a YouTube script, one image for every timestamp in the script.
>
> Your job is to read the script carefully and create a separate image for each timestamp. If the script
> has timestamps like 0:00, 0:03, 0:07, 0:10, 0:12, and 0:20, then you must generate one image for each
> of those timestamps.
>
> Each image must visually illustrate what the narrator is saying at that exact moment. The image should
> make sense with the story, the emotion, and the idea being explained. Do not create random images.
> Every image should feel like a simple visual explanation of the current line in the script.
>
> The images must be generated using ChatGPT Image 2.
>
> **STYLE REQUIREMENTS:**
>
> The image style must look like extremely simple beginner drawings made in MS Paint. It should look like
> someone who is not good at drawing created it quickly by hand.
>
> Use a very simple stickman / childish drawing style:
> - White background
> - Thick, uneven black outlines
> - Wobbly hand-drawn lines
> - Stick figure humans with round heads and line bodies
> - Simple dot eyes or circle eyes
> - Very basic facial expressions
> - Flat colors only
> - No realistic shading
> - No 3D
> - No cinematic lighting
> - No realistic cartoon style
> - No Disney style
> - No anime style
> - _[a few more "No …" bullets here were obscured in the source video — redundant negatives; recover from the kept tutorial if ever needed]_
> - Keep compositions clear and simple
>
> **FORMAT REQUIREMENTS:**
>
> Every image must be horizontal 16:9 for YouTube video format.
>
> Generate each image as a wide YouTube frame, not vertical, not square.
>
> The image must be clean, readable, and centered. Do not crop important objects. Leave enough space
> around the characters and objects. Avoid glitches, broken anatomy, unreadable text, messy overlapping
> objects, or weird extra details.
>
> **IMPORTANT:**
>
> For every timestamp, create a different image that matches the script at that moment. The images should
> feel like they belong in the same video and same drawing style.
>
> Do not make the drawings look too good. Do not make them polished. Do not make them professional. The
> entire point is that they look like simple, funny, beginner MS Paint drawings.
>
> Here is the script with timestamps. Generate one image for each timestamp:
> [PASTE SCRIPT HERE]

## How this maps to our generator
The whole tutorial method (transcribe → timestamp → one image per timestamp → place on timeline) IS the
longform pipeline, automated. For the `stick-figure-animated` preset: Style-picker selects it; Beat-planner
emits one simple literal scene per beat and prepends the STYLE REQUIREMENTS block; render uses `gpt_image_2`
low/2k. A single test of this exact prompt on GPT Image 2 reproduced the Zenn look cleanly (2am-in-bed scene).
