# Plan #4 Phase 2.5 — Remotion caption overlay (design)

## TL;DR

Add a Remotion-rendered captions layer between Phase 2's b-roll concat and the final ffmpeg compose. Replaces the flat `subtitles=` SRT burn-in with a word-by-word kinetic-typography composition whose props the Director picks per-video. Ships only the `captions/` category for v1; the other 5 categories (transitions, callouts, lower-thirds, title-cards, lottie) get scaffolded as empty directories so Phase 3+/4+ can fill them in without restructuring.

**Phase 2.5 is a foundation phase** for what becomes the Shorts OS visual identity. The hard gate at Task 1 is the only place we'd back out and switch to Remotion Lambda. Phases 3, 4, 5 are paused while this ships.

**Acceptance gates:**
- **Hard gate (Task 1):** Sandbox cold-start + git clone + npm ci with Remotion deps ≤ 120s. If exceeded → stop, escalate to operator, evaluate Remotion Lambda or pre-baked Sandbox image before continuing.
- **Render gate:** total wall-clock per render ≤ 240s end-to-end (up from Phase 2's 120s gate to absorb the Remotion render step).
- **Visual gate:** rendered captions visually match a reference image — confirms Montserrat 900 is the actual font (not a silent fallback).

---

## What changes from current state (post Phase 2)

| Surface | Phase 2 today | Phase 2.5 |
|---|---|---|
| Worker handler | ffmpeg `subtitles=` filter burns SRT directly onto b-roll concat in the final compose pass | Two passes: ffmpeg builds base (b-roll concat + voice + music), Remotion renders captions overlay with alpha, ffmpeg composites overlay onto base |
| Caption appearance | White Arial bold over black outline via SRT `force_style` | Word-by-word reveal in Montserrat 900 with accent-word styling per Director props |
| Director output | `visual_treatment` + `music_mood` + `shot_list` | + `caption_props` (variant + accent color + accent-word policy + animation speed + font scale) |
| Worker deps | ffmpeg-static, @ffprobe-installer/ffprobe, @supabase/supabase-js, @vercel/blob, tsx, zod | + `@remotion/renderer`, `@remotion/cli`, `react`, `react-dom`, `@fontsource/montserrat` |
| New top-level dir | — | `src/remotion/` with compositions + props schemas |
| Cold-start budget | ~6s (Phase 1 benchmark) | ≤ 120s (hard gate; new ceiling because Remotion + Chrome inflate npm ci) |
| End-to-end render budget | ≤ 120s (Phase 2 gate, observed 90.5s) | ≤ 240s |

---

## Architecture overview

```
                         render_jobs (pending, render_f1)
                                  │ dispatcher claims
                                  ▼
  ┌──────────────────────────  Sandbox (Linux x64, node24)  ──────────────────────────┐
  │                                                                                    │
  │  1. git clone + npm ci (worker package) ─────────── HARD GATE: ≤ 120s              │
  │                                                                                    │
  │  2. Cartesia TTS  ───────────────────────────────────→ /tmp/voice.wav              │
  │                                                                                    │
  │  3. Per shot: Pexels search + download + normalize ─→ /tmp/norm_N.mp4 × 10         │
  │                                                                                    │
  │  4. Whisper word-level alignment ────────────────────→ words[] (in-memory)         │
  │                                                                                    │
  │  5. ffmpeg concat normalized shots + voice + music ──→ /tmp/base.mp4               │
  │     (NO subtitles filter this time)                                                │
  │                                                                                    │
  │  6. Build CaptionsProps:                                                           │
  │       { variant: 'word-by-word',                                                   │
  │         words: [...whisper words],                                                 │
  │         accent_color, accent_word_policy, animation_speed, font_scale }            │
  │                                                                                    │
  │  7. npx remotion render src/remotion/index.tsx captions-word-by-word               │
  │     --props=<JSON> --codec=prores --pixel-format=yuva444p10le                      │
  │     ─────────────────────────────────────────────→ /tmp/captions.mov               │
  │     (transparent ProRes 4444 with alpha; bundled Chromium drives the render)       │
  │                                                                                    │
  │  8. ffmpeg overlay base + captions ──────────────────→ /tmp/out.mp4                │
  │     -filter_complex "[0:v][1:v]overlay[v]"                                         │
  │                                                                                    │
  │  9. Blob upload, callback                                                          │
  │                                                                                    │
  └────────────────────────────────────────────────────────────────────────────────────┘
```

Steps 1-5 and 8-9 are existing Phase 2 work (renamed/refactored). Steps 6 and 7 are new.

---

## §1 — Composition library structure

```
src/remotion/
├── index.tsx              # registerRoot() — lists all compositions
├── tsconfig.json          # Remotion-side tsconfig (separate from root)
├── compositions/
│   ├── captions/
│   │   ├── word-by-word.tsx     # ✓ ships in Phase 2.5
│   │   ├── props.ts             # Zod CaptionsPropsSchema (variants discriminated)
│   │   └── README.md            # describes the variants + when each is appropriate
│   ├── transitions/
│   │   └── README.md            # scaffold only; "Phase 3+ adds compositions here"
│   ├── callouts/
│   │   └── README.md            # scaffold only
│   ├── lower-thirds/
│   │   └── README.md            # scaffold only
│   ├── title-cards/
│   │   └── README.md            # scaffold only (Format 2 only — Phase 4)
│   └── lottie/
│       └── README.md            # scaffold only (operator-uploaded Lottie assets)
└── lib/
    ├── fonts.ts                 # loadFont() — wraps @fontsource/montserrat/900
    └── timing.ts                # word→frame helpers (consume Whisper TimedWord[])
```

The five scaffold directories each contain a one-line README that lists which Phase adds compositions there. Empty dirs aren't checked in by git; the README enforces commit-ability.

---

## §2 — Worker dependencies + Chrome strategy

**Required additions to `scripts/render-worker/package.json`:**

```json
{
  "dependencies": {
    "@remotion/cli": "^4.x",
    "@remotion/renderer": "^4.x",
    "@fontsource/montserrat": "^5.x",
    "react": "^19.x",
    "react-dom": "^19.x"
    // ... existing Phase 2 deps unchanged
  }
}
```

**Chrome:** `@remotion/renderer` v4+ bundles its own Chromium via `@remotion/chromium-tools`. **DO NOT** use `@sparticuz/chromium` — that's targeted at AWS Lambda's specific runtime constraints and is the wrong call here. Task 1's probe confirms the bundled Chromium works inside Vercel Sandbox before any other worker code lands.

**Font:** Montserrat 900 is the design choice (heavy black sans-serif, the standard "shorts caption" look). Imported in `src/remotion/lib/fonts.ts`:

```ts
import { continueRender, delayRender } from 'remotion';
import { loadFont as loadMontserrat } from '@fontsource/montserrat/900.css';

export async function loadCaptionFont() {
  const handle = delayRender('loading Montserrat 900');
  await loadMontserrat();
  continueRender(handle);
}
```

The composition's `<Composition>` component calls `loadCaptionFont()` in a `useEffect`. **Without explicit font loading the Linux Sandbox will silently fall back to a default font** (likely DejaVu Sans) and captions will look basic — which is the silent-failure mode the visual acceptance gate is designed to catch.

---

## §3 — Director output schema additions

Director's `DirectorOutputSchema` (`src/lib/agents/director.ts`) gains a `caption_props` field. The existing fields are unchanged.

```ts
export const CaptionsPropsSchema = z.object({
  variant: z.enum(['word-by-word', 'two-words-at-a-time', 'rolling-line']),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent_word_policy: z.enum(['first-noun', 'highlighted-by-director', 'none']),
  highlighted_words: z.array(z.string()).optional(), // populated when policy = 'highlighted-by-director'
  animation_speed: z.number().min(0.5).max(2.0).default(1.0),
  font_scale: z.number().min(0.7).max(1.5).default(1.0),
});

export const DirectorOutputSchema = z.object({
  visual_treatment: z.enum([...VISUAL_TREATMENTS]),
  music_mood: z.string().min(3).max(100),
  shot_list: z.array(ShotListEntrySchema).min(4).max(12),
  caption_props: CaptionsPropsSchema,          // NEW
  rationale: z.string().min(20).max(600),
});
```

**Director prompt addition (decision matrix):**

The Director prompt now includes the following block. This bakes in guidance for all three variants even though only `word-by-word` is renderable in Phase 2.5 — when Phase 3 or Phase 4 ships the other variants, no re-prompting is needed.

```
CAPTION VARIANT GUIDANCE — pick ONE for caption_props.variant:

- 'word-by-word' (Phase 2.5 default): high-energy narration, hooks, dramatic
  moments, action sequences, surprise reveals. Words appear one at a time
  in sync with the voice. PHASE 2.5 ALWAYS PICKS THIS — the other two
  variants are scaffolded for future phases. If you're tempted to pick
  another, pick this and explain in rationale.

- 'two-words-at-a-time': conversational explainer pacing, mid-energy how-to
  content, comparison/contrast scripts. Lighter cognitive load than
  word-by-word; reads more naturally for instructional content.
  [SCAFFOLDED, not yet rendered]

- 'rolling-line': slower educational deep-dives, longer phrases that don't
  fragment well (technical terminology, quoted dialogue). A full line stays
  on screen and slides up as the next line arrives.
  [SCAFFOLDED, not yet rendered]

ACCENT-WORD POLICY — pick ONE for caption_props.accent_word_policy:

- 'first-noun': highlight the first concrete noun in each cue. Default for
  generic explainer content.
- 'highlighted-by-director': you explicitly name which words pop. Use when
  the script has obvious emphasis words ("FREE", "SHOCKING", "TESLA").
  Populate caption_props.highlighted_words with the words.
- 'none': no per-word emphasis; all words equal. Use for sober/serious
  topics (disaster, retrospective, memorial).

Always use Remotion best practices for caption motion design.
```

(That last sentence is requirement #2 from the brief — the literal phrase that improves Remotion-related Claude output per the Remotion docs.)

**Channel-level accent_color seed:** if the Director doesn't pick a color, fall back to `channel.persona.accent_color` (existing field), or `#FFE600` (Shorts-OS-yellow) if the channel hasn't set one.

---

## §4 — Render pipeline pseudocode

`scripts/render-worker/handlers/render-f1.ts` (modified):

```ts
// ... existing imports + setup ...
import { renderCaptionsOverlay } from '../lib/remotion.ts';
import { compositeBaseAndOverlay } from '../lib/ffmpeg-commands.ts';

// existing: TTS, per-shot Pexels + normalize, Whisper alignment

// NEW: base render (b-roll concat + audio, NO captions burned in)
const basePath = join(workDir, 'base.mp4');
await composeBase({
  concatListPath,
  voicePath,
  musicPath,
  outputPath: basePath,    // <-- no subtitlesPath argument
});
log('base compose done (no captions yet)');

// NEW: Remotion captions overlay
const captionsPath = join(workDir, 'captions.mov');
await renderCaptionsOverlay({
  compositionId: 'captions-word-by-word',  // selected by caption_props.variant
  props: {
    words: whisperWords,
    accent_color: directorOut.caption_props.accent_color,
    accent_word_policy: directorOut.caption_props.accent_word_policy,
    highlighted_words: directorOut.caption_props.highlighted_words ?? [],
    animation_speed: directorOut.caption_props.animation_speed,
    font_scale: directorOut.caption_props.font_scale,
    durationSeconds: ttsResult.durationSeconds,
  },
  outputPath: captionsPath,
});
log('captions overlay rendered');

// NEW: composite
const outPath = join(workDir, 'out.mp4');
await compositeBaseAndOverlay({
  basePath,
  overlayPath: captionsPath,
  outputPath: outPath,
});
log('composite done');

// existing: probe duration, Blob upload, callback
```

`scripts/render-worker/lib/remotion.ts` (new):

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);

export async function renderCaptionsOverlay(args: {
  compositionId: string;
  props: Record<string, unknown>;
  outputPath: string;
}): Promise<void> {
  // Invokes `npx remotion render` with the props JSON inlined.
  // Output codec: prores, pixel format yuva444p10le → transparent ProRes 4444 .mov
  const propsJson = JSON.stringify(args.props);
  await execFileP('npx', [
    'remotion', 'render',
    'src/remotion/index.tsx',
    args.compositionId,
    args.outputPath,
    '--codec=prores',
    '--pixel-format=yuva444p10le',
    `--props=${propsJson}`,
    '--log=warn',
  ], {
    cwd: '/vercel/sandbox',           // Remotion's entry is in src/, not in scripts/render-worker
    timeout: 180_000,                 // 180s ceiling on the Remotion step itself
  });
}
```

`scripts/render-worker/lib/ffmpeg-commands.ts` (extended):

```ts
export function buildCompositeArgs(args: {
  basePath: string;
  overlayPath: string;
  outputPath: string;
}): string[] {
  return [
    '-y',
    '-i', args.basePath,
    '-i', args.overlayPath,
    '-filter_complex', '[0:v][1:v]overlay=format=auto[v]',
    '-map', '[v]',
    '-map', '0:a',                    // keep base audio
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-c:a', 'copy',                   // re-mux audio without re-encoding
    '-movflags', '+faststart',
    args.outputPath,
  ];
}

export async function compositeBaseAndOverlay(args: {
  basePath: string;
  overlayPath: string;
  outputPath: string;
}): Promise<void> {
  await runFfmpeg(buildCompositeArgs(args));
}
```

The existing `buildFinalComposeArgs` is renamed `buildBaseComposeArgs` and loses the `subtitlesPath` parameter — captions are no longer part of this pass.

---

## §5 — Acceptance gates

**Three gates, in order of when they're checked:**

### Gate 1: Cold-start budget (TASK 1 — hard gate)

Task 1 is a minimal Sandbox probe before any other Phase 2.5 work lands:

1. Add Remotion deps to `scripts/render-worker/package.json` (but don't yet write any worker code that uses them).
2. Push to a `plan-4-phase-2-5` branch.
3. Trigger a Sandbox manually (a one-off `/api/render/debug-2-5` route that just runs `npm ci` + `npx remotion --version`).
4. Measure: time from `Sandbox.create` return to `npx remotion --version` exiting 0.

**Pass condition:** ≤ 120s.

**Fail condition:** > 120s. STOP. Surface to operator. Options:
- Pre-bake a Sandbox image with Remotion deps pre-installed (Vercel Sandbox supports snapshots).
- Switch architecture to Remotion Lambda (paid service, ~$0.01/render).
- Reduce worker package surface (drop unused Phase 1 deps).

The hard gate exists because Phase 2 already burns ~6s on `npm ci` for a simple worker. Adding Remotion + React + Chromium could easily push that to 60-120s, and beyond 120s the operator wants to evaluate alternatives before paying the cost in every render.

### Gate 2: End-to-end render budget

Once the worker code lands, run a full smoke render through the same `/lab → /lab/drafts → Render` flow Phase 2 used. Capture per-stage timing from `render_jobs.last_error` (the existing debug trace from Phase 2).

**Pass condition:** total wall-clock from `claimed_at` to `finished_at` ≤ 240s.

This is 2× Phase 2's gate, intentionally generous to absorb the Remotion render step (estimated 30-90s for a 60-90s video at 30fps with caption motion).

### Gate 3: Visual correctness (font verification)

The silent-failure mode for Remotion-on-Linux-Sandbox is the font silently falling back to a system default. The rendered captions LOOK fine but aren't actually Montserrat 900.

**Test:**
- Render a fixed test video (script: lorem-ipsum, 30s, voice: Corey, 3 shots).
- Extract a single frame at t=10s where a caption is visible.
- Visually diff against a reference frame committed to `docs/superpowers/notes/phase-2-5-reference-frame.png`.
- The frame must show:
  - Montserrat 900 (heavy weight) — distinguishable from Arial/Helvetica/DejaVu by letter shape (especially the lowercase `g` and capital `R`)
  - Accent color matching `caption_props.accent_color`
  - Correct word currently emphasized per the timing data

**Pass condition:** operator visually approves the frame matches the reference (subjective but binary).

---

## §6 — Open risks / caveats

1. **Chromium-in-Sandbox is unverified.** Task 1 confirms feasibility. If `@remotion/renderer`'s bundled Chromium can't launch in the Sandbox (sandboxing-within-sandbox issues, missing system libs), Gate 1 fails and we pivot.

2. **Cold-start cliff.** Even if Gate 1 passes at 119s, every render still pays that 119s. Over 100 renders/month that's 198 extra minutes of Sandbox compute. Pre-baked image probably worth it as a Phase 2.5.x optimization regardless.

3. **Remotion bundling on every render.** `npx remotion render` bundles the composition with esbuild each time. Adds ~5-15s per render. Pre-bundling at deploy time (Remotion's `bundle()` API) would amortize this — explicit Phase 2.5.x follow-up.

4. **Font loading async hazard.** `loadFont()` returns a promise. If the composition starts rendering frames before the font finishes loading, frames 0-N would have the fallback font. Remotion's `delayRender()` + `continueRender()` API handles this — must be used correctly in `fonts.ts`.

5. **The `npx remotion render` CLI is the worker's pipe to the outside world.** If it exits non-zero with no useful stderr, debugging is hard. Worker wraps the call with stderr capture and includes in the failure trace.

6. **Worker bundle size.** ~Phase 2 worker `npm ci` installs ~30MB of deps. Remotion + React + Chromium pushes that to ~200-400MB. `git clone` is unaffected (deps come from npm, not git), but `npm ci` time scales linearly with download volume. This is the dominant cold-start risk.

7. **Visual diff is subjective.** Operator approval is the v1 gate. A future improvement: pixel-diff against the reference frame with a tolerance (e.g., SSIM > 0.95).

---

## §7 — Coordination with parallel Phase 3 work

Another Claude session is currently working on Phase 3 (Reddit clip ingest + `/clips` Inbox). Phase 2.5 and Phase 3 both touch:

- `scripts/render-worker/package.json` (different deps, no conflict expected)
- `scripts/render-worker/handlers/` (different new file — Phase 3 adds `clip-ingest.ts`, Phase 2.5 modifies `render-f1.ts`)
- `src/lib/agents/director.ts` (Phase 2.5 modifies; Phase 3 doesn't touch)

**Branching strategy:**
- Phase 2.5 work happens on branch `plan-4-phase-2-5`.
- Phase 3 work happens on its own branch (the other Claude owns).
- Whichever PR merges to `main` second resolves any conflicts (small if any).
- Coordinate via the operator at merge time. If conflicts are non-trivial, prefer rebasing the later branch onto the merged one.

**Production deploys:** every Phase 2.5 push goes to its branch's Preview. Production stays on `main` (which still has Phase 2's flat captions) until Phase 2.5 acceptance gates all pass and we merge. This means the running system keeps working while Phase 2.5 is in development.

---

## §8 — Out of scope (deferred)

- **Other 5 composition categories** (transitions, callouts, lower-thirds, title-cards, lottie). Scaffold dirs only. Future phases populate.
- **Lottie ingest helper.** Requirement #3 from the brief is deferred to Phase 2.5.x or a later phase — captions don't need Lottie. The `lottie/` scaffold dir signals where it lands.
- **@react-three/fiber 3D moments.** Requirement #5 from the brief is explicitly deferred ("Defer if scope tight" — scope is tight).
- **`two-words-at-a-time` and `rolling-line` variants.** Director prompts already account for them; the compositions ship in a later phase.
- **Pre-bundling at deploy time.** Phase 2.5 uses CLI-based bundling per render. Optimization deferred.
- **Pre-baked Sandbox image.** Only triggered if Task 1 fails Gate 1; otherwise deferred.
- **Format 2 captions.** Compilation videos (Phase 4) get the same composition module but the Composer rather than the Director writes the props. Phase 2.5 doesn't pre-build that integration; the module is structured so the Composer can drop in cleanly later.

---

## Appendix: file inventory

**New files (Phase 2.5 ships):**
- `src/remotion/index.tsx`
- `src/remotion/tsconfig.json`
- `src/remotion/lib/fonts.ts`
- `src/remotion/lib/timing.ts`
- `src/remotion/compositions/captions/word-by-word.tsx`
- `src/remotion/compositions/captions/props.ts`
- `src/remotion/compositions/captions/README.md`
- `src/remotion/compositions/transitions/README.md`
- `src/remotion/compositions/callouts/README.md`
- `src/remotion/compositions/lower-thirds/README.md`
- `src/remotion/compositions/title-cards/README.md`
- `src/remotion/compositions/lottie/README.md`
- `scripts/render-worker/lib/remotion.ts`
- `docs/superpowers/notes/phase-2-5-reference-frame.png` (committed binary, ~50KB)
- `docs/superpowers/notes/2026-05-26-plan-4-phase-2-5-cold-start-benchmark.md` (filled in at Task 1 completion)
- `docs/superpowers/notes/2026-05-26-plan-4-phase-2-5-end-to-end-benchmark.md` (filled in at acceptance gate)

**Modified files:**
- `scripts/render-worker/package.json` (new deps)
- `scripts/render-worker/handlers/render-f1.ts` (pipeline restructure)
- `scripts/render-worker/lib/ffmpeg-commands.ts` (renames + new composite function)
- `src/lib/agents/director.ts` (caption_props in output, prompt update)
- `src/lib/agents/constants.ts` (optional: caption variant enums)
- `tsconfig.json` (verify `src/remotion/` is included)

**Hard-rule audit before merge to main:**
- [ ] No `@vercel/sandbox` imports outside `src/lib/render/workers/vercel-sandbox.ts` + `scripts/render-worker/`
- [ ] All 3 acceptance gates passed (cold-start, render time, visual)
- [ ] Production cron still claims jobs (Phase 3 may or may not be merged at the time)
- [ ] No secrets committed
- [ ] Conventional Commits format on every commit
