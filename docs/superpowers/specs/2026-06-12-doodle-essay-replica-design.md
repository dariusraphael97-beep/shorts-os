# Design — Doodle-essay replica: "Three Meals a Day Is Invented"

**Date:** 2026-06-12. **Owner:** Darius. **Status:** awaiting approval.
**Reference:** https://www.youtube.com/watch?v=st_Ah6Ykbh4 (Zenn crude-doodle sleep essay, ~8.5 min).
**Handoff:** `docs/superpowers/handoffs/2026-06-12-doodle-essay-replica-handoff.md` (full production spec — that doc is the source of truth for the style/pacing/sound bar; this design covers what we BUILD to hit it).

## Goal

One original ~8.5–9-min 1080p doodle-essay video — topic: **the lost history of eating / "three meals a day is invented"** — that matches the reference's look, cut-rhythm, sound, and quality bar to the tea, produced through the Shorts OS longform pipeline. Side effect: the `stick-figure-animated` preset and pipeline upgrades are banked as product capability, not a one-off.

**Topic rationale (Darius approved 2026-06-12):** strongest hook in the dominatable family ("breakfast was invented to sell cereal"), dated-evidence stack rivaling the reference's (Roman cena → medieval two-meal pattern → factory schedules → Kellogg 1898 → 1920s Bernays bacon campaign, a perfect red-circle callout beat), clean mechanism payoff (circadian metabolism / time-restricted eating), built-in reframe (intermittent fasting = the old default reasserting), and zero subject overlap with the reference — no rehash optics on a new channel.

## Current state (verified in code)

The preset already exists and was twice iterated against this exact reference (commits `5fea291`→`7480fac`, on main):

- `stick-figure-animated` in `src/lib/longform/style-presets.ts:94` — gpt_image_2, 2.5s/beat, kenBurnsZoom 0, captions baked in-image.
- Beat planner has **no beat cap**; 8.5 min at 2.5s → ~204 beats naturally.
- `onScreenText` baked via `assembleImagePrompt` ("render the caption reading exactly …") with word-level TTS sync.
- Plan-only mode (free) via `POST /api/lab/longform/dispatch { planOnly: true }`.
- Music bed already disabled (`MUSIC_BED_ENABLED` unset); SFX layer exists at vol 0.18.
- Voice hardcoded to ElevenLabs "George" (British) at `orchestrator.ts:15` — wrong for this reference.

## What we build (7 pieces)

### A. Preset v3 — crude felt-tip look
Rewrite the `stick-figure-animated` positivePrefix to the handoff's spec: *crude hand-drawn felt-tip-marker doodle, single-weight wobbly black outlines, flat MS-Paint solid color fills, no shading/gradients, stick figures with round white heads + dot eyes + expressive eyebrows, solid color background, childlike but clean*. v1 over-cooked crude, v2 over-corrected to clean; v3 = wobbly drawing, crisp execution ("crude ≠ low quality"). Also: `musicMood` → soft ambient pad (bed stays off regardless), `soundEffectsEnabled: true`.

### B. `backgroundMood` beat field
New optional beat field so backgrounds color-key to scene mood. Beat planner picks from the reference's palette — `white` (diagram/fact), `navy` (night/contemplation), `sunrise` (orange+blue), `dark-navy` (night bedroom), `outdoors` (brown+green) — plus topic-appropriate variants (warm kitchen, factory grey). `assembleImagePrompt` appends "solid {mood} background". Planner guidance: vary it across the video; never all-white.

### C. Sparse caption mode + evidence labels + red callouts
New `onScreenTextMode: "sparse"`: ALL-CAPS hand-lettered caption (≤4 words) on **emphasis beats only** (~10–15% of beats); small lowercase object labels on evidence beats (`cookbook, 1500s.`); red circle / red arrow callout instructions in the imagePrompt on 2–4 "look here" beats. Beat-planner prompt + prompt-assembly changes, both tested.

### D. Voice swap (per-run override)
Add optional `voiceId` to dispatch args; default unchanged (George) for other presets. Audition 3–4 calm warm-neutral **American** male ElevenLabs voices against the reference by ear (~140–150 wpm, no hype); pick the closest. Non-ElevenLabs only if nothing lands — deliverable is tone match.

### E. `scriptOverride` dispatch arg
Optional verbatim narration that skips the Writer agent (beat planner still runs). The script for this video is hand-written in-chat in the 7-beat arc (below), with every dated claim **web-verified first**; the verified facts also go in as `trustedFacts` so beat captions can't invent numbers. Additive + back-compat — Writer path untouched.

### F. Audio confirmation by ear
Run the `watch` skill on the reference **with audio** before finalizing sound (prior analysis was frames+captions only). Expected per handoff: no/minimal bed, sparse diegetic SFX. Adjust SFX cue list to whatever the ear-check says; cap at ~6–8 cues, vol 0.18.

### G. Ken-Burns test
Reference has subtle push-ins; preset is static (zoompan jitter on line art). Test `kenBurnsZoom: 0.04` on real doodle frames; keep if smooth, revert to 0 if jittery. Static is an acceptable match (reference drawings are "mostly static").

## Script design (original, 7-beat arc, ~1,200–1,350 words ≈ 8.3–9.4 min @ 144 wpm)

1. **Cold open:** present-tense "you" + huge timescale — *you eat three meals at fixed clock times; for ~300,000 years no human ever did.* No intro.
2. **Thesis of loss:** the schedule isn't biology, it's an invention — open loop: what did we replace?
3. **Evidence stack (dated):** Roman one-meal *cena*; medieval two-meal day (dinner mid-morning, supper); 16th-c. moralists on breakfast; Industrial Revolution factory bells fixing mealtimes; Kellogg 1898; the 1920s Beech-Nut bacon-and-eggs campaign (Bernays, "4,500 physicians") — **red-circle callout beat**.
4. **Warm reconstruction:** eating by hunger, sun, and season; one shared table; the fire and the pot.
5. **Mechanism:** circadian metabolism in short cause→effect lines — morning insulin sensitivity, late eating vs melatonin, time-restricted-eating findings.
6. **Reframe:** "skipping breakfast" guilt and intermittent fasting aren't a fad — the old design reasserting itself.
7. **Quiet close:** *the most important meal of the day was a slogan; the schedule was a factory's; your body still keeps the older time.* Fade, no CTA.

Every dated/numeric claim verified via web research during execution; anything unverifiable is cut or softened — accuracy gate covers captions too.

## Execution flow

1. `watch` skill on reference (audio by ear) → lock sound design.
2. Branch `feat/doodle-essay-preset` off **main** in a worktree (current niche branch untouched). Subagent-driven development + TDD for A–E.
3. Fact research → script draft → trustedFacts list.
4. **Image bake-off (~8cr):** 3–4 test prompts × {gpt_image_2, nano_banana_2} — judge crude-doodle fidelity, ALL-CAPS lettering legibility, red-callout capability. Winner becomes the preset model. (Full-video cost: ~162cr gpt vs ~432cr nano at ~216 beats — check Higgsfield balance before bake-off AND before render.)
5. **Plan-only run (free):** verify ~190–220 beats, caption sparsity, backgroundMood variety, arc integrity, estimated duration.
6. Credits check (Higgsfield + ElevenLabs) → approve ONE render via render-worker (budget extra wall-clock: estimateRender undercounts the ffmpeg tail at high beat counts).
7. QC vs handoff §5 checklist: watch every frame end-to-end (credit-out renders "succeed" blank), side-by-side vs reference, audio level check.

## Error handling / fallbacks

- zoompan jitter → static (kenBurnsZoom 0).
- gpt_image_2 won't do crude or legible captions → nano_banana_2 (accept 432cr) → if balance short, ask Darius before topping up.
- Voice: no American EL voice matches → audition one non-EL TTS before escalating.
- Render fails mid-run → render_jobs are resumable via worker; never deliver without the frame watch.

## Testing

- Unit (TDD): preset v3 fields; beat schema accepts `backgroundMood` (+ planner emits it); sparse-mode prompt assembly (caption only when set, lowercase labels, red callout text); `scriptOverride` skips Writer in orchestrator; `voiceId` override plumbing. Update `style-picker-policy` test if assertions reference old prefix text.
- Integration: plan-only output manually inspected against handoff §5 before any credits spent.

## Out of scope

Channel setup/branding, title+thumbnail generators (separate playbook item), multi-video automation of this format, music bed sourcing.
