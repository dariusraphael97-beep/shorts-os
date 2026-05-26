# Plan #4 Phase 2.5 — Remotion caption overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 2's flat SRT caption burn-in with a Remotion-rendered word-by-word kinetic-typography overlay (Montserrat ExtraBold, accent-word emphasis, bounce animation) composited onto the b-roll base.

**Architecture:** Two-pass pipeline. (1) ffmpeg builds `base.mp4` (b-roll concat + voice + music, no captions). (2) Remotion renders `captions.mov` as ProRes 4444 with alpha. (3) ffmpeg composites overlay onto base. Director picks per-video `caption_props` (variant + accent color + emphasis policy + animation speed + font scale).

**Tech Stack:** Remotion 4.x (`@remotion/cli` + `@remotion/renderer` with bundled Chromium), React 19, `@fontsource/montserrat` (weight 800), existing ffmpeg-static / @ffprobe-installer / @vercel/sandbox / Phase 2 worker infra. No new external services.

**Acceptance gates:**
1. **Cold-start ≤ 120s** (hard gate at Task 2; if exceeded, stop and escalate)
2. **Glyph-hash check passes** (Task 3; catches font fallback definitively)
3. **End-to-end render ≤ 240s** wall-clock
4. **Operator 6-item visual checklist** all green

---

## Pre-flight

```bash
# From the parent project's working dir, set up an isolated worktree if not already created
cd /Users/darius/Downloads/shorts-os
git worktree list | grep plan-4-phase-2-5 || git worktree add ../shorts-os-phase-2-5 plan-4-phase-2-5

# Work from the worktree
cd /Users/darius/Downloads/shorts-os-phase-2-5
git status         # expect clean on plan-4-phase-2-5
git log -1 --oneline  # expect 788edb9 docs(plan-4): Phase 2.5 spec edits

# Read the spec ONCE before starting — every task references back to it
cat docs/superpowers/specs/2026-05-26-shorts-os-plan-4-phase-2-5-remotion-overlay-design.md | head -120
```

All subsequent file paths are relative to `/Users/darius/Downloads/shorts-os-phase-2-5/`.

---

## Task 1: Add Remotion deps to worker package (NO code yet)

**Files:**
- Modify: `scripts/render-worker/package.json`

This is a tiny task on its own — but its purpose is to set up Task 2's cold-start measurement. We need the deps in `package.json` before the Sandbox does `npm ci`, but we don't write any worker code that imports them yet (so the existing pipeline keeps working through this commit).

- [ ] **Step 1.1: Open `scripts/render-worker/package.json` and add 5 new deps**

```json
{
  "name": "shorts-os-render-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "run": "node --import tsx run.ts"
  },
  "dependencies": {
    "@ffprobe-installer/ffprobe": "^2.1.2",
    "@fontsource/montserrat": "^5.1.1",
    "@remotion/cli": "^4.0.0",
    "@remotion/renderer": "^4.0.0",
    "@supabase/supabase-js": "^2.106.1",
    "@vercel/blob": "^1.0.0",
    "ffmpeg-static": "^5.2.0",
    "fluent-ffmpeg": "^2.1.3",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "remotion": "^4.0.0",
    "tsx": "^4.20.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/fluent-ffmpeg": "^2.1.27",
    "@types/node": "^20.19.41",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5"
  }
}
```

The added entries: `@fontsource/montserrat`, `@remotion/cli`, `@remotion/renderer`, `react`, `react-dom`, `remotion`, plus `@types/react` and `@types/react-dom` in devDeps.

The `remotion` top-level package re-exports React helpers (`Composition`, `Sequence`, `useCurrentFrame`, etc.) used by composition source files. `@remotion/cli` provides the `npx remotion render` CLI. `@remotion/renderer` is the programmatic render API + bundled Chromium.

- [ ] **Step 1.2: Run `npm install` in the worker package locally to populate package-lock.json**

```bash
cd scripts/render-worker
npm install
cd ../..
```

Expected: install completes without error. New entries appear in `scripts/render-worker/package-lock.json`. May download ~150-300 MB into `scripts/render-worker/node_modules/` (gitignored). Don't commit node_modules.

- [ ] **Step 1.3: Run the root test suite — should be unchanged**

```bash
npm test 2>&1 | tail -5
```
Expected: 167 passed / 11 failed (same Phase 2 baseline). The worker's `package.json` change doesn't touch any Next.js code paths.

- [ ] **Step 1.4: Commit**

```bash
git add scripts/render-worker/package.json scripts/render-worker/package-lock.json
git commit -m "$(cat <<'EOF'
chore(worker): add Remotion + React + Montserrat deps for Phase 2.5

No worker code imports these yet; this commit only seeds package.json
so Task 2's Sandbox cold-start probe can measure npm ci with the
full Phase 2.5 dep footprint.

Deps added: @remotion/cli, @remotion/renderer, remotion, react,
react-dom, @fontsource/montserrat (font weight 800 imported by the
composition module in Task 4).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Cold-start hard gate (`/api/render/debug-2-5` probe)

**Files:**
- Create: `src/app/api/render/debug-2-5/route.ts` (temporary; deleted at end of Phase 2.5)
- Create: `docs/superpowers/notes/2026-05-26-plan-4-phase-2-5-cold-start-benchmark.md`

This task is the **hard gate**. If cold-start > 120s, STOP — surface to operator + evaluate pre-baked image or Remotion Lambda before continuing.

The probe creates a Sandbox using the same code path as the production dispatcher (`VercelSandboxRenderWorker`), runs `npm ci` + `npx remotion --version`, captures per-step timing, and returns it. CRON_SECRET-auth'd, manually triggered via curl.

- [ ] **Step 2.1: Write the probe route**

```ts
// src/app/api/render/debug-2-5/route.ts
//
// Phase 2.5 cold-start probe. Spins up a Sandbox, runs npm ci in the
// worker package, then `npx remotion --version`. Captures per-step timing.
// CRON_SECRET-auth'd; called manually with curl during plan execution.
// DELETE this route at the end of Phase 2.5.
import 'server-only';
import { NextResponse } from 'next/server';
import { Sandbox } from '@vercel/sandbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function getGitSource(): { url: string; ref: string; username?: string; password?: string } {
  const url =
    process.env.SANDBOX_GIT_URL ??
    (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? `https://github.com/${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}.git`
      : undefined);
  const ref = process.env.SANDBOX_GIT_REF ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (!url || !ref) throw new Error('Cannot determine git source for sandbox probe');
  return {
    url,
    ref,
    username: process.env.SANDBOX_GIT_USERNAME,
    password: process.env.SANDBOX_GIT_PASSWORD,
  };
}

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { url: repoUrl, ref, username, password } = getGitSource();
  const t0 = Date.now();
  const stages: Record<string, number> = {};

  const sandbox = await Sandbox.create({
    name: `phase-2-5-coldstart-${Date.now()}`,
    runtime: 'node24',
    timeout: 5 * 60 * 1000,
    source: username && password
      ? { type: 'git', url: repoUrl, revision: ref, username, password }
      : { type: 'git', url: repoUrl, revision: ref },
  });
  stages.sandbox_create_ms = Date.now() - t0;

  const tInstall = Date.now();
  const npmCi = await sandbox.runCommand({
    cmd: 'npm',
    args: ['ci', '--prefix', 'scripts/render-worker'],
  });
  stages.npm_ci_ms = Date.now() - tInstall;
  stages.npm_ci_exit = npmCi.exitCode ?? -1;

  const tVersion = Date.now();
  const versionCmd = await sandbox.runCommand({
    cmd: 'npx',
    args: ['remotion', '--version'],
    cwd: '/vercel/sandbox/scripts/render-worker',
  });
  stages.remotion_version_ms = Date.now() - tVersion;
  stages.remotion_version_exit = versionCmd.exitCode ?? -1;
  stages.remotion_version_stdout = (await versionCmd.stdout()).trim();

  const total = Date.now() - t0;
  const pass = total <= 120_000;

  return NextResponse.json({
    pass,
    total_ms: total,
    gate_ms: 120_000,
    stages,
    sandbox_name: sandbox.name,
  });
}
```

- [ ] **Step 2.2: Verify tsc + build**

```bash
npx tsc --noEmit 2>&1 | head -10
```
Expected: only the pre-existing `src/tests/lib/auth/session.test.ts:32` error from prior phases. No new errors.

- [ ] **Step 2.3: Whitelist `/api/render/debug-2-5` in proxy (it's CRON_SECRET-auth'd, not cockpit)**

`/api/render` is already in `PUBLIC_PATH_PREFIXES` at `src/proxy.ts:8`. No change needed — the debug route inherits.

- [ ] **Step 2.4: Add the new route's path to a temp curl helper for the operator**

Write `scripts/probe-coldstart.sh` (gitignored — will not be committed):

```bash
#!/usr/bin/env bash
# Manual cold-start probe runner. Pulls CRON_SECRET from local env or .env.local.
set -eo pipefail
CRON_SECRET=${CRON_SECRET:-$(grep '^CRON_SECRET=' .env.local 2>/dev/null | sed 's/^CRON_SECRET=//' | tr -d '"')}
if [ -z "$CRON_SECRET" ]; then echo "Set CRON_SECRET env or .env.local" >&2; exit 1; fi
URL=${URL:-https://shorts-os-roan.vercel.app}
curl -sS -H "Authorization: Bearer $CRON_SECRET" "$URL/api/render/debug-2-5" | jq
```

Add to `.gitignore`:
```bash
echo "scripts/probe-coldstart.sh" >> .gitignore
git add .gitignore
```

- [ ] **Step 2.5: Commit the probe route**

```bash
git add src/app/api/render/debug-2-5/route.ts .gitignore
git commit -m "$(cat <<'EOF'
feat(debug): /api/render/debug-2-5 cold-start probe (temporary)

Spins up a Sandbox, runs npm ci + npx remotion --version, returns
per-stage timing JSON. CRON_SECRET-auth. Used to measure the Phase 2.5
cold-start budget before any worker code that imports Remotion lands.

DELETE this route at the end of Phase 2.5 (Task 14).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2.6: Push branch + open draft PR (Vercel auto-deploys preview)**

```bash
git push -u origin plan-4-phase-2-5  # already pushed once; this is a force-push of new commits
gh pr create --draft --title "Plan #4 Phase 2.5: Remotion caption overlay" \
  --body "$(cat <<'EOF'
WIP. Adds Remotion-rendered word-by-word kinetic-typography captions.

Hard gate at Task 2: Sandbox cold-start ≤ 120s with Remotion deps.
If gated, escalate before continuing.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" 2>&1 | tail -3
```

If the PR already exists from a prior session, `gh pr create` will fail — that's fine, just push and the existing PR picks up the commits.

- [ ] **Step 2.7: Add the CARTESIA / PEXELS / GROQ env vars to the preview branch (carried over from Phase 2's setup)**

```bash
# These probably already exist in Preview for this branch; verify before adding
vercel env ls | grep -E "PEXELS|GROQ|CARTESIA" | grep plan-4-phase-2-5
```

If any are missing on `plan-4-phase-2-5`, copy from Production:
```bash
# Repeat per key. Get the value from Production via dashboard or vercel env pull.
vercel env add CARTESIA_API_KEY preview plan-4-phase-2-5 --value <value> --yes --non-interactive
```

The probe route itself doesn't NEED these (it just runs `npx remotion --version`), but the actual render later does. Setting them now saves time at Task 12.

- [ ] **Step 2.8: Wait for preview deploy to land, then hit the probe**

```bash
# Watch the deploy:
until vercel ls 2>&1 | awk '/Preview/' | head -1 | grep -qE "● Ready"; do sleep 20; done
vercel ls | head -5 | tail -1
# Now run the probe:
bash scripts/probe-coldstart.sh
```

Expected JSON (the values that matter):
```json
{
  "pass": true,
  "total_ms": <number>,
  "gate_ms": 120000,
  "stages": {
    "sandbox_create_ms": <~4000-8000>,
    "npm_ci_ms": <~30000-90000>,
    "remotion_version_ms": <~500-3000>,
    "remotion_version_exit": 0,
    "remotion_version_stdout": "4.x.x"
  }
}
```

- [ ] **Step 2.9: Document the result**

Create `docs/superpowers/notes/2026-05-26-plan-4-phase-2-5-cold-start-benchmark.md` filled with the probe output:

```markdown
# Plan #4 Phase 2.5 — Cold-start gate measurement

**Date:** 2026-05-26 (UTC)
**Result:** PASS / FAIL — total <total_ms>ms (gate 120000ms)

## Per-stage timing

| Stage | ms | Notes |
|---|---|---|
| Sandbox.create() return | <sandbox_create_ms> | git clone + microVM boot |
| `npm ci --prefix scripts/render-worker` | <npm_ci_ms> | downloads ~200-400 MB |
| `npx remotion --version` | <remotion_version_ms> | confirms binary on PATH |
| **Total** | <total_ms> | gate: 120000 |

## Reported Remotion version

`<remotion_version_stdout>`

## Decision

- PASS → proceed to Task 3
- FAIL → STOP. Surface to operator. Discuss pre-baked Sandbox image OR Remotion Lambda.
```

Fill in the actual numbers from the probe.

- [ ] **Step 2.10: Commit the benchmark + gate decision**

```bash
git add docs/superpowers/notes/2026-05-26-plan-4-phase-2-5-cold-start-benchmark.md
git commit -m "$(cat <<'EOF'
docs(plan-4): Phase 2.5 cold-start gate — PASS / FAIL at <total_ms>ms

Replace <total_ms> with the actual measured total from the probe.
Gate is 120000ms. If failed, this commit ALSO updates the spec's §6
risk #2 to reflect the discovery and the operator's chosen remediation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push
```

**If FAILED: stop here, escalate to operator. Do NOT proceed to Task 3.**

---

## Task 3: Font glyph-hash check (Stage 3a of Gate 3)

**Files:**
- Create: `src/remotion/index.tsx` (minimal — only the probe composition initially)
- Create: `src/remotion/compositions/probe/font-probe.tsx`
- Create: `src/remotion/lib/fonts.ts`
- Create: `src/remotion/lib/font-fingerprint.json` (committed)
- Create: `src/remotion/tsconfig.json`
- Create: `scripts/render-worker/lib/glyph-hash.ts`
- Create: `scripts/probe-font-hash.sh` (gitignored helper)
- Modify: `src/app/api/render/debug-2-5/route.ts` (add a `?step=font-probe` mode)

The Stage 3a check renders one frame of a known test string in Montserrat ExtraBold, hashes 4 distinctive glyph rectangles, and compares them to expected hashes committed to the repo. Mismatch = font fallback occurred = stop.

### Step 3.1: Create `src/remotion/tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "allowImportingTsExtensions": true
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

### Step 3.2: Create `src/remotion/lib/fonts.ts`

```ts
// src/remotion/lib/fonts.ts
//
// Loads Montserrat ExtraBold (weight 800) for use in compositions. Wraps
// Remotion's delayRender/continueRender so frames don't render before the
// font is available — that's the silent-fallback hazard the Stage 3a
// glyph-hash check catches.

import { continueRender, delayRender } from 'remotion';
import { loadFont } from '@fontsource/montserrat/800.css';

let started: Promise<void> | null = null;

export function loadCaptionFont(): Promise<void> {
  if (started) return started;
  const handle = delayRender('loading Montserrat ExtraBold (800)');
  started = (loadFont as unknown as () => Promise<void>)().then(() => {
    continueRender(handle);
  });
  return started;
}
```

Note: `@fontsource/montserrat/800.css` exports a CSS file that registers `@font-face` rules. The `loadFont` named export is provided by recent fontsource versions; if your installed version exports a default, adjust the import. The hack `as unknown as () => Promise<void>` is required because fontsource's typing is loose. Implementer should verify against the installed version.

### Step 3.3: Create `src/remotion/compositions/probe/font-probe.tsx`

```tsx
// src/remotion/compositions/probe/font-probe.tsx
//
// One-frame composition for the Stage 3a glyph-hash check. Renders the
// pangram "Sphinx of black quartz, judge my vow" in Montserrat ExtraBold
// 80px white-on-black at 1080x1920. The Sandbox-side hash code crops
// specific glyph rectangles and compares against committed fingerprints.

import React from 'react';
import { AbsoluteFill, Composition } from 'remotion';
import { loadCaptionFont } from '../../lib/fonts';

const TEST_STRING = 'Sphinx of black quartz, judge my vow';

const FontProbe: React.FC = () => {
  React.useEffect(() => { void loadCaptionFont(); }, []);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          fontFamily: 'Montserrat',
          fontWeight: 800,
          fontSize: 80,
          color: '#FFFFFF',
          textAlign: 'center',
          padding: '0 60px',
          lineHeight: 1.1,
        }}
      >
        {TEST_STRING}
      </div>
    </AbsoluteFill>
  );
};

// Exposed so src/remotion/index.tsx can mount it
export const FontProbeComposition: React.FC = () => (
  <Composition
    id="font-probe"
    component={FontProbe}
    durationInFrames={1}
    fps={30}
    width={1080}
    height={1920}
  />
);
```

### Step 3.4: Create `src/remotion/index.tsx`

```tsx
// src/remotion/index.tsx
//
// Remotion root. registerRoot() is the entry the CLI invokes via
// `npx remotion render src/remotion/index.tsx <composition-id> ...`.
// Phase 2.5 ships two compositions: the font-probe (Stage 3a) and
// the word-by-word captions (Tasks 5-7).

import React from 'react';
import { registerRoot } from 'remotion';
import { FontProbeComposition } from './compositions/probe/font-probe';
// Word-by-word composition is added in Task 5.

const Root: React.FC = () => (
  <>
    <FontProbeComposition />
  </>
);

registerRoot(Root);
```

### Step 3.5: Create `scripts/render-worker/lib/glyph-hash.ts` (Sandbox-side)

```ts
// scripts/render-worker/lib/glyph-hash.ts
//
// Loads a PNG (the font-probe frame) and computes deterministic hashes
// over four glyph rectangles (g, Q, R, z). Uses the `sharp` library only
// if installed; otherwise falls back to a pure-pixel md5 over fixed
// regions of the raw PNG via the built-in zlib/crypto modules.
//
// We avoid adding `sharp` as a dep (250+ MB) and instead implement a
// minimal PNG-decode-by-zlib + md5 directly.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inflate } from 'node:zlib';
import { promisify } from 'node:util';

const inflateP = promisify(inflate);

// Hardcoded crop rectangles for the test string "Sphinx of black quartz, judge my vow"
// rendered at 1080x1920 with the layout in font-probe.tsx. Updated if layout changes.
// Pixel-perfect positions are calibrated AFTER rendering once locally; the operator
// commits the resulting rectangles + hashes to font-fingerprint.json.
//
// Each rectangle has shape: [x, y, w, h] in pixel coordinates.

export interface GlyphRect { name: string; x: number; y: number; w: number; h: number; }
export interface FontFingerprint { generated_at: string; rects: GlyphRect[]; hashes: Record<string, string>; }

interface PngDecoded { width: number; height: number; rgba: Buffer; }

async function decodePng(buf: Buffer): Promise<PngDecoded> {
  // Minimal PNG decoder: parses IHDR + IDAT only. Assumes 8-bit RGBA (color type 6, bit depth 8).
  // ffmpeg's PNG output from libx264-encoded-decoded paths uses this format by default.
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a PNG');
  let pos = 8;
  let width = 0, height = 0;
  const idatChunks: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); pos += 4;
    const type = buf.slice(pos, pos + 4).toString('ascii'); pos += 4;
    const data = buf.slice(pos, pos + len); pos += len;
    pos += 4; // CRC
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data.readUInt8(8);
      const colorType = data.readUInt8(9);
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`unsupported PNG bit_depth=${bitDepth} color_type=${colorType}`);
      }
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') break;
  }
  const compressed = Buffer.concat(idatChunks);
  const decompressed = await inflateP(compressed);
  // Strip PNG filter bytes (1 byte per scanline) — assumes filter type 0 (none) for simplicity.
  // If ffmpeg encodes with non-trivial filters we'd need full filter handling; for our generated
  // frame this is acceptable.
  const channels = 4; // assume RGBA; matches font-probe.tsx black bg + white text
  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    const srcRow = decompressed.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    srcRow.copy(rgba, y * stride);
  }
  return { width, height, rgba };
}

function hashRect(decoded: PngDecoded, rect: GlyphRect): string {
  const hash = createHash('md5');
  const stride = decoded.width * 4;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    const start = y * stride + rect.x * 4;
    hash.update(decoded.rgba.slice(start, start + rect.w * 4));
  }
  return hash.digest('hex');
}

export async function computeFingerprint(pngPath: string, rects: GlyphRect[]): Promise<Record<string, string>> {
  const buf = await readFile(pngPath);
  const decoded = await decodePng(buf);
  const hashes: Record<string, string> = {};
  for (const r of rects) hashes[r.name] = hashRect(decoded, r);
  return hashes;
}

export async function verifyFingerprint(pngPath: string, expected: FontFingerprint): Promise<{ ok: boolean; actual: Record<string, string>; mismatches: string[] }> {
  const actual = await computeFingerprint(pngPath, expected.rects);
  const mismatches: string[] = [];
  for (const r of expected.rects) {
    if (actual[r.name] !== expected.hashes[r.name]) mismatches.push(r.name);
  }
  return { ok: mismatches.length === 0, actual, mismatches };
}
```

### Step 3.6: Generate the expected fingerprint LOCALLY (before committing)

The implementer runs this once on their local machine where Montserrat ExtraBold is known-correct (Remotion's bundled Chromium uses the @fontsource file regardless of OS fonts):

```bash
# In the worktree:
cd scripts/render-worker
npm install   # if not already
cd /Users/darius/Downloads/shorts-os-phase-2-5
npx --prefix scripts/render-worker remotion render \
  src/remotion/index.tsx \
  font-probe \
  /tmp/font-probe.png \
  --image-format=png \
  --frames=0
```

Then write a one-off node script `scripts/gen-font-fingerprint.mjs` (gitignored):

```js
// scripts/gen-font-fingerprint.mjs
import { computeFingerprint } from '/Users/darius/Downloads/shorts-os-phase-2-5/scripts/render-worker/lib/glyph-hash.ts';
import { writeFile } from 'node:fs/promises';

// Calibrate these by visually inspecting /tmp/font-probe.png and picking
// 4 rectangles around the distinctive glyphs. Approximate starting values:
const rects = [
  { name: 'g_lower', x: 160, y: 950, w: 60, h: 80 },   // lowercase 'g' in 'judge'
  { name: 'Q_upper', x: 480, y: 950, w: 80, h: 80 },   // capital 'Q' in 'quartz'
  { name: 'R_upper', x: 940, y: 950, w: 60, h: 80 },   // (capital R doesn't appear in pangram; pick different glyph)
  { name: 'z_lower', x: 640, y: 950, w: 50, h: 80 },   // lowercase 'z' in 'quartz'
];
// Note: actual rects MUST be tuned by the implementer to the real pixel positions.
// The 4 rects above are starting estimates.

const { computeFingerprint } = await import('./scripts/render-worker/lib/glyph-hash.ts');
const hashes = await computeFingerprint('/tmp/font-probe.png', rects);

const fingerprint = {
  generated_at: new Date().toISOString(),
  rects,
  hashes,
};

await writeFile('src/remotion/lib/font-fingerprint.json', JSON.stringify(fingerprint, null, 2));
console.log('wrote fingerprint:', fingerprint);
```

Run:
```bash
node scripts/gen-font-fingerprint.mjs
```

Open `src/remotion/lib/font-fingerprint.json` and verify it has 4 entries.

**Calibration note for the implementer:** the `rects` starting values are estimates. Look at `/tmp/font-probe.png` in an image viewer; pick rectangles tightly around the 4 distinctive glyphs (`g`, `Q`, `z`, and a 4th — maybe `S` from "Sphinx"). The rects should be small enough to make the hash sensitive to font differences but not so small that anti-aliasing noise dominates.

### Step 3.7: Extend `/api/render/debug-2-5` with a `?step=font-probe` mode

Modify `src/app/api/render/debug-2-5/route.ts` to handle a `step` query param. When `step=font-probe`, the route:
1. Boots a Sandbox (same shape as cold-start probe)
2. Runs `npm ci` in the worker package
3. Runs `npx remotion render src/remotion/index.tsx font-probe /tmp/font-probe.png --frames=0 --image-format=png`
4. Reads `/tmp/font-probe.png` from the Sandbox via `sandbox.fs.readFile`
5. Writes the PNG to local /tmp and runs `verifyFingerprint` against the committed expected.

Add this after the existing `GET` handler:

```ts
// (append to src/app/api/render/debug-2-5/route.ts)
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import expectedFingerprint from '@/../src/remotion/lib/font-fingerprint.json';
import { verifyFingerprint } from '../../../../scripts/render-worker/lib/glyph-hash';

async function runFontProbe(): Promise<Response> {
  const { url: repoUrl, ref, username, password } = getGitSource();
  const t0 = Date.now();
  const sandbox = await Sandbox.create({
    name: `phase-2-5-fontprobe-${Date.now()}`,
    runtime: 'node24',
    timeout: 5 * 60 * 1000,
    source: username && password
      ? { type: 'git', url: repoUrl, revision: ref, username, password }
      : { type: 'git', url: repoUrl, revision: ref },
  });

  const npmCi = await sandbox.runCommand({
    cmd: 'npm', args: ['ci', '--prefix', 'scripts/render-worker'],
  });
  if (npmCi.exitCode !== 0) {
    return NextResponse.json({ stage: 'npm_ci', error: 'failed' }, { status: 500 });
  }

  const render = await sandbox.runCommand({
    cmd: 'npx',
    args: [
      'remotion', 'render',
      '/vercel/sandbox/src/remotion/index.tsx',
      'font-probe',
      '/tmp/font-probe.png',
      '--frames=0',
      '--image-format=png',
    ],
    cwd: '/vercel/sandbox/scripts/render-worker',
  });
  if (render.exitCode !== 0) {
    const err = await render.stderr();
    return NextResponse.json({ stage: 'remotion_render', exit: render.exitCode, stderr: err.slice(-2000) }, { status: 500 });
  }

  const pngBuf = await sandbox.fs.readFile('/tmp/font-probe.png');
  const localPath = `/tmp/font-probe-from-sandbox-${Date.now()}.png`;
  await writeFile(localPath, pngBuf);

  const result = await verifyFingerprint(localPath, expectedFingerprint as never);

  return NextResponse.json({
    pass: result.ok,
    duration_ms: Date.now() - t0,
    mismatches: result.mismatches,
    actual: result.actual,
    expected: (expectedFingerprint as { hashes: Record<string, string> }).hashes,
    png_at: localPath,
  });
}

// In the existing GET handler, before the cold-start probe code:
const url = new URL(req.url);
if (url.searchParams.get('step') === 'font-probe') {
  return runFontProbe();
}
// (existing cold-start probe code follows)
```

### Step 3.8: Verify the import paths resolve

The Next.js side imports the worker-side glyph-hash module via relative path `../../../../scripts/render-worker/lib/glyph-hash`. This works because `tsconfig.json` already excludes `scripts/render-worker/` but the file itself has no module-load side effects that would break tsc.

If `tsc --noEmit` errors on the import, the implementer falls back to duplicating the glyph-hash code into a Next.js-side file `src/lib/render/glyph-hash.ts` and importing that. The duplication is small (~80 lines) and well-defined.

```bash
npx tsc --noEmit 2>&1 | head -10
```
Expected: only the pre-existing session.test.ts error.

### Step 3.9: Commit + push + run the font probe

```bash
git add src/remotion/ scripts/render-worker/lib/glyph-hash.ts src/app/api/render/debug-2-5/route.ts
git commit -m "$(cat <<'EOF'
feat(remotion): font glyph-hash probe (Gate 3 Stage 3a)

Adds a minimal Remotion composition (font-probe) that renders one
1080x1920 frame of "Sphinx of black quartz, judge my vow" in Montserrat
ExtraBold. The /api/render/debug-2-5?step=font-probe route runs this
in a Sandbox, downloads the PNG, and verifies 4 distinctive glyph
hashes against src/remotion/lib/font-fingerprint.json (committed
by the implementer after generating locally).

If hashes mismatch, font fallback occurred — STOP and fix font
loading before continuing. The full caption composition (Tasks 5+)
is not yet built; this commit only proves the font loads correctly.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push
```

### Step 3.10: Wait for deploy, run the font probe, document the result

```bash
# Wait:
until vercel ls 2>&1 | awk '/Preview/' | head -1 | grep -qE "● Ready"; do sleep 20; done

# Run:
CRON_SECRET=$(grep '^CRON_SECRET=' .env.local | sed 's/^CRON_SECRET=//' | tr -d '"')
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://shorts-os-git-plan-4-phase-2-5-dariusraphael97-beeps-projects.vercel.app/api/render/debug-2-5?step=font-probe" | jq
```

Expected JSON:
```json
{
  "pass": true,
  "duration_ms": <30000-90000>,
  "mismatches": [],
  "actual": { "g_lower": "<md5>", "Q_upper": "<md5>", ... },
  "expected": { "g_lower": "<same md5>", ... }
}
```

If `pass: false`, the mismatches array lists which glyphs differ. Most likely causes:
- Font didn't load (DejaVu fallback) → all 4 hashes differ
- Rect calibration is off → some hashes match, others don't → re-tune rects in font-probe.tsx and regenerate fingerprint

**Gate decision:**
- `pass: true` → continue to Task 4
- `pass: false` after one rect-recalibration attempt → STOP, escalate to operator, investigate Remotion font-loading API

Append result to `docs/superpowers/notes/2026-05-26-plan-4-phase-2-5-cold-start-benchmark.md`:

```markdown
## Gate 3 Stage 3a — Font fingerprint check

**Date:** <UTC>
**Result:** PASS / FAIL
**Sandbox duration:** <duration_ms>ms

Expected hashes (from local generation):
- g_lower: <md5>
- Q_upper: <md5>
- z_lower: <md5>
- (4th): <md5>

Sandbox hashes:
- (paste from probe response)

Decision:
- PASS → font loads correctly in the Sandbox, full caption composition can be built (Task 4+)
- FAIL → STOP. Likely causes documented above.
```

Commit the update:
```bash
git add docs/superpowers/notes/2026-05-26-plan-4-phase-2-5-cold-start-benchmark.md
git commit -m "docs(plan-4): Phase 2.5 Gate 3 Stage 3a font-hash check — PASS"
git push
```

---

## Task 4: CaptionsPropsSchema + Director output schema update

**Files:**
- Create: `src/remotion/compositions/captions/props.ts`
- Create: `src/tests/lib/remotion/caption-props.test.ts`
- Modify: `src/lib/agents/director.ts`
- Modify: `src/tests/lib/agents/director.test.ts`

This task adds the Zod schemas (defined identically on the Next.js side and the Remotion side — duplicated because Remotion can't import from `src/lib/agents/` cleanly) + extends the Director's output schema + updates the Director prompt to include the variant decision matrix and accent-word policy guidance.

### Step 4.1: Write the failing test for CaptionsPropsSchema

```ts
// src/tests/lib/remotion/caption-props.test.ts
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
```

### Step 4.2: Run test, confirm failure

```bash
npm test -- src/tests/lib/remotion/caption-props.test.ts
```
Expected: FAIL — module not found.

### Step 4.3: Implement `src/remotion/compositions/captions/props.ts`

```ts
// src/remotion/compositions/captions/props.ts
import { z } from "zod";

export const TimedWordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});
export type TimedWord = z.infer<typeof TimedWordSchema>;

export const CaptionsPropsSchema = z.object({
  variant: z.enum(["word-by-word", "two-words-at-a-time", "rolling-line"]),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be #RRGGBB hex"),
  accent_word_policy: z.enum(["first-noun", "highlighted-by-director", "none"]),
  highlighted_words: z.array(z.string()).default([]),
  animation_speed: z.number().min(0.5).max(2.0).default(1.0),
  font_scale: z.number().min(0.7).max(1.5).default(1.0),
  // Runtime-only (not from the Director; filled in by the worker before render)
  words: z.array(TimedWordSchema).default([]),
  durationSeconds: z.number().default(0),
});
export type CaptionsProps = z.infer<typeof CaptionsPropsSchema>;
```

### Step 4.4: Run test, confirm pass

```bash
npm test -- src/tests/lib/remotion/caption-props.test.ts
```
Expected: PASS (4 tests).

### Step 4.5: Modify `src/lib/agents/director.ts` — add caption_props to Director output

Open `src/lib/agents/director.ts`. After the existing `ShotListEntrySchema`, add an inline copy of the props schema (without `words` / `durationSeconds` since the Director doesn't populate those):

```ts
// src/lib/agents/director.ts (additions)
export const DirectorCaptionsPropsSchema = z.object({
  variant: z.enum(["word-by-word", "two-words-at-a-time", "rolling-line"]),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be #RRGGBB hex"),
  accent_word_policy: z.enum(["first-noun", "highlighted-by-director", "none"]),
  highlighted_words: z.array(z.string()).default([]),
  animation_speed: z.number().min(0.5).max(2.0).default(1.0),
  font_scale: z.number().min(0.7).max(1.5).default(1.0),
});

// Replace the existing DirectorOutputSchema:
export const DirectorOutputSchema = z.object({
  visual_treatment: z.enum([...VISUAL_TREATMENTS]),
  music_mood: z.string().min(3).max(100),
  shot_list: z.array(ShotListEntrySchema).min(4).max(12),
  caption_props: DirectorCaptionsPropsSchema,    // NEW
  rationale: z.string().min(20).max(600),
});
```

### Step 4.6: Update the Director prompt

In the same file, replace the prompt-builder's body with the version that includes the caption decision matrix and the "Use Remotion best practices" directive:

```ts
function buildPrompt(ctx: DirectorRunContext): string {
  const treatments = VISUAL_TREATMENTS.map(
    (t) => `- ${t}: ${VISUAL_TREATMENT_DESCRIPTIONS[t]}`,
  ).join("\n");
  return `You are The Director. Pick ONE visual_treatment from the enum, decide a music mood, produce a shot_list of 4–12 segments covering the full script, and pick caption_props for the kinetic-typography caption layer.

Script:
${ctx.previousOutputs.writer.script}

Voice: ${ctx.previousOutputs.voiceCoach.voice_id} (use to inform pacing of cuts)
Channel persona:
${JSON.stringify(ctx.channel.persona, null, 2)}

Available visual treatments (pick exactly one):
${treatments}

Rules for shot_list:
- Aim for 1 visual change every 3-5 seconds. Sum of duration_seconds should roughly match the script length (${ctx.previousOutputs.writer.estimated_duration_seconds.toFixed(0)}s).
- Each shot_list entry needs a broll_search_query of 3-6 words usable against Pexels/Storyblocks.
- segment_text should be the chunk of the script that plays during this shot.

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

OTHER caption_props fields:
- accent_color: hex like "#FFD23F" (default warm yellow). Pick a color that
  contrasts with the b-roll palette implied by your shot_list.
- animation_speed: 0.5-2.0 (default 1.0). Slower for somber, faster for hype.
- font_scale: 0.7-1.5 (default 1.0). Larger for hook moments.

Always use Remotion best practices for caption motion design.

Explain your treatment choice + caption_props rationale in 1-3 sentences combined.`;
}
```

### Step 4.7: Update director.test.ts mocks to include caption_props

Open `src/tests/lib/agents/director.test.ts`. The two passing-path mocks currently return `{ visual_treatment, music_mood, shot_list, rationale }`. Add `caption_props` to each:

```ts
// In both "returns a valid treatment + shot list" and any other test that
// mocks a passing generateObject result, add caption_props to the object:
caption_props: {
  variant: "word-by-word",
  accent_color: "#FFD23F",
  accent_word_policy: "first-noun",
  highlighted_words: [],
  animation_speed: 1.0,
  font_scale: 1.0,
},
```

The two negative-path tests ("throws on out-of-enum treatment", "throws on shot_list with fewer than 4 entries") don't need updating — they're testing schema failures and the absence of caption_props will just make them fail differently, but they still throw. To be conservative, add caption_props to them too so the only schema violation is the intended one.

### Step 4.8: Run all director + caption-props tests

```bash
npm test -- src/tests/lib/agents/director.test.ts src/tests/lib/remotion/caption-props.test.ts
```
Expected: all pass.

### Step 4.9: Full suite check

```bash
npm test 2>&1 | tail -5
```
Expected: 171 passed / 11 failed (4 new caption_props tests; director tests still pass).

### Step 4.10: Commit

```bash
git add src/remotion/compositions/captions/props.ts \
        src/lib/agents/director.ts \
        src/tests/lib/remotion/caption-props.test.ts \
        src/tests/lib/agents/director.test.ts
git commit -m "$(cat <<'EOF'
feat(director): add caption_props to output + decision-matrix prompt

Director now picks caption_props (variant + accent_color +
accent_word_policy + highlighted_words + animation_speed + font_scale)
per video. Phase 2.5 ships only word-by-word; prompt documents
two-words-at-a-time and rolling-line as scaffolded-not-yet-rendered.

Prompt ends with "Always use Remotion best practices for caption motion
design" per Remotion docs guidance (single phrase that improves caption
output quality).

4 new schema tests; existing director tests updated to include
caption_props in mocked outputs.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: word-by-word composition

**Files:**
- Create: `src/remotion/compositions/captions/word-by-word.tsx`
- Create: `src/remotion/lib/timing.ts`
- Modify: `src/remotion/index.tsx` (mount the new composition)

The actual visual code. Per the operator checklist, this must:
1. Font: Montserrat ExtraBold (geometric, NOT system default)
2. Animate word-by-word with bounce
3. Sync within ~50ms of spoken word
4. Emphasis words tint #FFD23F and scale up briefly
5. Drop shadow + black stroke visible on any b-roll
6. Bottom-third positioning

### Step 5.1: Create `src/remotion/lib/timing.ts`

```ts
// src/remotion/lib/timing.ts
//
// Convert Whisper word timings (seconds) to Remotion frame numbers.

export interface TimedWord { word: string; start: number; end: number; }
export interface FramedWord { word: string; startFrame: number; endFrame: number; }

export function wordsToFrames(words: TimedWord[], fps: number, speedMultiplier = 1): FramedWord[] {
  return words.map((w) => ({
    word: w.word.trim(),
    startFrame: Math.round((w.start / speedMultiplier) * fps),
    endFrame: Math.round((w.end / speedMultiplier) * fps),
  }));
}

export function isFirstNoun(word: string, index: number, allWords: string[]): boolean {
  // Heuristic: first 4+ letter word that's not a common stopword in each "cue".
  // Cues are computed elsewhere; this just helps the composition decide which
  // word to emphasize when accent_word_policy = 'first-noun'.
  const stopwords = new Set(['this', 'that', 'with', 'from', 'have', 'will', 'what', 'when', 'where', 'about', 'their', 'they', 'them', 'there', 'these', 'those', 'into', 'over', 'than', 'just']);
  return word.length >= 4 && !stopwords.has(word.toLowerCase());
}
```

### Step 5.2: Create `src/remotion/compositions/captions/word-by-word.tsx`

```tsx
// src/remotion/compositions/captions/word-by-word.tsx
//
// Word-by-word kinetic-typography caption composition for Phase 2.5.
//
// Design (per operator's 6-item checklist):
//   1. Montserrat ExtraBold (weight 800), 80px base * font_scale
//   2. Words enter one at a time with a spring-bounce animation
//   3. Each word appears at its Whisper-aligned startFrame (~50ms accuracy)
//   4. Accent words tint accent_color (default #FFD23F) and scale 1.0 → 1.15 briefly
//   5. White fill + 4px black stroke + drop shadow → readable on any b-roll
//   6. Bottom-third positioning (vertical offset from top ~ 65% of 1920 = 1248px)

import React from 'react';
import { AbsoluteFill, Composition, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionsProps } from './props';
import { loadCaptionFont } from '../../lib/fonts';
import { wordsToFrames, isFirstNoun, type FramedWord } from '../../lib/timing';

const BASE_FONT_SIZE_PX = 80;
const STROKE_WIDTH_PX = 4;
const ENTER_DURATION_FRAMES = 6;        // ~200ms at 30fps
const EMPHASIS_PULSE_FRAMES = 12;       // ~400ms at 30fps
const WORDS_PER_CUE = 3;                // up to 3 words visible at once

interface WordBoxProps {
  word: FramedWord;
  index: number;
  cueStartFrame: number;
  accentColor: string;
  isAccent: boolean;
  fontScale: number;
}

const WordBox: React.FC<WordBoxProps> = ({ word, index, cueStartFrame, accentColor, isAccent, fontScale }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - word.startFrame;

  if (localFrame < 0) return null;
  if (frame > word.endFrame + EMPHASIS_PULSE_FRAMES + ENTER_DURATION_FRAMES) return null;

  // Bounce on entry (spring config: tight bounce, settles in ~200ms)
  const enterScale = spring({
    frame: localFrame,
    fps,
    config: { damping: 8, stiffness: 200, mass: 0.4 },
    durationInFrames: ENTER_DURATION_FRAMES,
  });

  // Accent pulse — scale 1.0 → 1.15 → 1.0 over EMPHASIS_PULSE_FRAMES
  let accentScale = 1;
  if (isAccent) {
    const halfP = EMPHASIS_PULSE_FRAMES / 2;
    if (localFrame < halfP) accentScale = 1 + (0.15 * localFrame / halfP);
    else if (localFrame < EMPHASIS_PULSE_FRAMES) accentScale = 1.15 - (0.15 * (localFrame - halfP) / halfP);
  }

  const scale = enterScale * accentScale;
  const color = isAccent ? accentColor : '#FFFFFF';

  return (
    <span
      style={{
        display: 'inline-block',
        margin: '0 12px',
        transform: `scale(${scale})`,
        color,
        fontFamily: 'Montserrat',
        fontWeight: 800,
        fontSize: BASE_FONT_SIZE_PX * fontScale,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
        WebkitTextStroke: `${STROKE_WIDTH_PX}px #000000`,
        textShadow:
          '0px 4px 12px rgba(0,0,0,0.65), 0px 0px 2px rgba(0,0,0,0.9)',
        // Force the stroke to render BEHIND the fill (Webkit-specific)
        paintOrder: 'stroke fill',
      }}
    >
      {word.word}
    </span>
  );
};

const WordByWord: React.FC<CaptionsProps> = (props) => {
  React.useEffect(() => { void loadCaptionFont(); }, []);

  const { fps } = useVideoConfig();
  const framedWords = React.useMemo(
    () => wordsToFrames(props.words, fps, props.animation_speed),
    [props.words, fps, props.animation_speed],
  );

  // Build cues (rolling windows of up to WORDS_PER_CUE words)
  const cues: FramedWord[][] = React.useMemo(() => {
    const out: FramedWord[][] = [];
    for (let i = 0; i < framedWords.length; i += WORDS_PER_CUE) {
      out.push(framedWords.slice(i, i + WORDS_PER_CUE));
    }
    return out;
  }, [framedWords]);

  const frame = useCurrentFrame();
  // Pick the currently-visible cue (the one whose first word has started but
  // whose last word's endFrame + buffer hasn't passed)
  const activeCue = cues.find(
    (c) => frame >= c[0].startFrame && frame < c[c.length - 1].endFrame + ENTER_DURATION_FRAMES + 4,
  );

  if (!activeCue) return <AbsoluteFill />;

  const allWordStrings = framedWords.map((w) => w.word);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          // Bottom-third: vertical center of the caption block ~ 73% down the 1920px tall frame
          top: '63%',
          textAlign: 'center',
          padding: '0 60px',
          lineHeight: 1.05,
        }}
      >
        {activeCue.map((w) => {
          const globalIndex = framedWords.indexOf(w);
          let isAccent = false;
          if (props.accent_word_policy === 'highlighted-by-director') {
            isAccent = props.highlighted_words
              .map((s) => s.toLowerCase())
              .includes(w.word.toLowerCase());
          } else if (props.accent_word_policy === 'first-noun') {
            // First emphasizable word in the cue
            const firstAccent = activeCue.find((cw) => isFirstNoun(cw.word, framedWords.indexOf(cw), allWordStrings));
            isAccent = firstAccent === w;
          }
          // 'none' policy leaves all isAccent = false

          return (
            <WordBox
              key={`${w.word}-${w.startFrame}`}
              word={w}
              index={globalIndex}
              cueStartFrame={activeCue[0].startFrame}
              accentColor={props.accent_color}
              isAccent={isAccent}
              fontScale={props.font_scale}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const WordByWordComposition: React.FC = () => (
  <Composition
    id="captions-word-by-word"
    component={WordByWord}
    durationInFrames={1800}      // 60s at 30fps; overridden per-render via --frames or --duration
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{
      variant: 'word-by-word',
      accent_color: '#FFD23F',
      accent_word_policy: 'first-noun',
      highlighted_words: [],
      animation_speed: 1.0,
      font_scale: 1.0,
      words: [],
      durationSeconds: 0,
    } satisfies CaptionsProps}
  />
);
```

### Step 5.3: Modify `src/remotion/index.tsx` to mount the new composition

```tsx
// src/remotion/index.tsx
import React from 'react';
import { registerRoot } from 'remotion';
import { FontProbeComposition } from './compositions/probe/font-probe';
import { WordByWordComposition } from './compositions/captions/word-by-word';

const Root: React.FC = () => (
  <>
    <FontProbeComposition />
    <WordByWordComposition />
  </>
);

registerRoot(Root);
```

### Step 5.4: Create scaffold READMEs for the 5 other composition categories (per spec §1)

These are committable placeholders so future phases can drop compositions in without restructuring. Each is a 1-paragraph file:

```bash
mkdir -p src/remotion/compositions/{transitions,callouts,lower-thirds,title-cards,lottie}
cat > src/remotion/compositions/transitions/README.md <<'EOF'
# transitions/

Scaffold directory for Remotion transition compositions (glitch, swipe, whip-pan
between b-roll shots). Empty in Phase 2.5. Future phases (3+) populate.
EOF

cat > src/remotion/compositions/callouts/README.md <<'EOF'
# callouts/

Scaffold directory for Remotion callout compositions (WAIT FOR IT banners,
arrows pointing at b-roll subjects, emoji bounces). Empty in Phase 2.5. Future
phases (3+) populate.
EOF

cat > src/remotion/compositions/lower-thirds/README.md <<'EOF'
# lower-thirds/

Scaffold directory for source-credit lower-thirds (Reddit author handle,
subreddit attribution). Empty in Phase 2.5. Populated by Phase 4 (Format 2)
when compilation videos need to credit clip sources.
EOF

cat > src/remotion/compositions/title-cards/README.md <<'EOF'
# title-cards/

Scaffold directory for numbered intro title cards (#5, #4, #3 ... countdown
style for Top-5 compilations). Empty in Phase 2.5. Populated by Phase 4
(Format 2).
EOF

cat > src/remotion/compositions/lottie/README.md <<'EOF'
# lottie/

Scaffold directory for Lottie-based compositions. The plan calls for an ingest
helper that lets the operator drop .lottie files into a folder; an indexer
uploads to Vercel Blob + tags via Claude Haiku, and the Director picks Lottie
assets from the indexed library when relevant. Empty in Phase 2.5; ingest
helper + first compositions land in Phase 3+ or later.
EOF
```

These dirs become git-trackable because of the README files (git doesn't track empty dirs).

### Step 5.6: Local preview (optional, no commit required)

```bash
cd /Users/darius/Downloads/shorts-os-phase-2-5
npx --prefix scripts/render-worker remotion studio src/remotion/index.tsx
```

Opens Remotion Studio in a browser. Operator can preview the `captions-word-by-word` composition with `defaultProps` to sanity-check the layout before the full pipeline is wired.

### Step 5.7: Commit

```bash
git add src/remotion/
git commit -m "$(cat <<'EOF'
feat(remotion): word-by-word kinetic-typography caption composition

Renders Montserrat ExtraBold 80px*font_scale captions in cues of up
to 3 words at the bottom-third of a 1080x1920 canvas. Each word
springs in on its Whisper-aligned startFrame. Accent words tint
accent_color and pulse 1.0 → 1.15 → 1.0 over ~400ms.

4px black stroke + drop shadow renders the captions over any b-roll
palette. paint-order: stroke fill ensures the stroke sits behind the
fill (Webkit-specific; Remotion's Chromium honors it).

defaultProps lets `npx remotion studio` preview the layout without
running the full pipeline.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Worker-side `remotion.ts` wrapper

**Files:**
- Create: `scripts/render-worker/lib/remotion.ts`
- Create: `src/tests/lib/worker/remotion.test.ts` (argv-level tests; no actual Remotion run)

### Step 6.1: Test the argv builder

```ts
// src/tests/lib/worker/remotion.test.ts
import { describe, it, expect } from "vitest";
import { buildRemotionRenderArgs } from "../../../../scripts/render-worker/lib/remotion";

describe("buildRemotionRenderArgs", () => {
  it("constructs the npx remotion render argv with composition + props", () => {
    const argv = buildRemotionRenderArgs({
      compositionId: "captions-word-by-word",
      props: { variant: "word-by-word", words: [], durationSeconds: 60 },
      outputPath: "/tmp/captions.mov",
      durationInFrames: 1800,
    });

    expect(argv).toEqual([
      "remotion",
      "render",
      "/vercel/sandbox/src/remotion/index.tsx",
      "captions-word-by-word",
      "/tmp/captions.mov",
      "--codec=prores",
      "--prores-profile=4444",
      "--pixel-format=yuva444p10le",
      "--frames=0-1799",
      `--props=${JSON.stringify({ variant: "word-by-word", words: [], durationSeconds: 60 })}`,
      "--log=warn",
    ]);
  });
});
```

### Step 6.2: Run test, confirm failure

```bash
npm test -- src/tests/lib/worker/remotion.test.ts
```
Expected: FAIL — module not found.

### Step 6.3: Implement `scripts/render-worker/lib/remotion.ts`

```ts
// scripts/render-worker/lib/remotion.ts
//
// Worker-side wrapper around `npx remotion render`. Returns the argv array
// from a pure builder (testable) and exposes `renderRemotionOverlay()` that
// spawns the CLI with timeout + stderr capture.

import { spawn } from 'node:child_process';

export interface RemotionRenderArgs {
  compositionId: string;
  props: Record<string, unknown>;
  outputPath: string;
  durationInFrames: number;
}

export function buildRemotionRenderArgs(args: RemotionRenderArgs): string[] {
  return [
    'remotion',
    'render',
    '/vercel/sandbox/src/remotion/index.tsx',
    args.compositionId,
    args.outputPath,
    '--codec=prores',
    '--prores-profile=4444',
    '--pixel-format=yuva444p10le',
    `--frames=0-${args.durationInFrames - 1}`,
    `--props=${JSON.stringify(args.props)}`,
    '--log=warn',
  ];
}

export interface RenderResult { stdout: string; stderr: string; exitCode: number; }

export function renderRemotionOverlay(args: RemotionRenderArgs): Promise<RenderResult> {
  const argv = buildRemotionRenderArgs(args);
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', argv, {
      cwd: '/vercel/sandbox',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,                 // 180s ceiling on the Remotion step
    });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', reject);
    proc.on('close', (code) => {
      resolve({ stdout: out, stderr: err, exitCode: code ?? -1 });
    });
  });
}
```

### Step 6.4: Run test, confirm pass

```bash
npm test -- src/tests/lib/worker/remotion.test.ts
```
Expected: PASS (1 test).

### Step 6.5: Commit

```bash
git add scripts/render-worker/lib/remotion.ts src/tests/lib/worker/remotion.test.ts
git commit -m "$(cat <<'EOF'
feat(worker): remotion CLI wrapper with argv builder + 180s timeout

buildRemotionRenderArgs returns the argv for `npx remotion render`
emitting transparent ProRes 4444 (yuva444p10le pixel format). 180s
ceiling on the subprocess prevents hangs from blocking the render
job indefinitely.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: ffmpeg composite helper

**Files:**
- Modify: `scripts/render-worker/lib/ffmpeg-commands.ts`
- Modify: `src/tests/lib/worker/ffmpeg-commands.test.ts`

Adds `buildCompositeArgs` + `compositeBaseAndOverlay` (overlay the transparent Remotion .mov onto the base .mp4) and renames the existing `buildFinalComposeArgs` → `buildBaseComposeArgs` (it no longer takes a `subtitlesPath` because captions are now done via overlay).

### Step 7.1: Update test file to cover the rename + new composite function

Open `src/tests/lib/worker/ffmpeg-commands.test.ts`. Replace the existing `buildFinalComposeArgs` tests with:

```ts
// Replace the three buildFinalComposeArgs tests with these:

describe("buildBaseComposeArgs", () => {
  it("uses concat demuxer + amix(0.25 music)", () => {
    const argv = buildBaseComposeArgs({
      concatListPath: "/tmp/list.txt",
      voicePath: "/tmp/voice.wav",
      musicPath: "/tmp/music.mp3",
      outputPath: "/tmp/base.mp4",
    });
    expect(argv).toContain("-f");
    expect(argv).toContain("concat");
    expect(argv).toContain("/tmp/list.txt");
    expect(argv.join(" ")).toContain("[2:a]volume=0.25[m]");
    expect(argv.join(" ")).toContain("[1:a][m]amix=inputs=2:duration=first[a]");
    // Subtitles filter is NO LONGER in this pass — captions moved to overlay
    expect(argv.join(" ")).not.toContain("subtitles=");
    expect(argv).toContain("/tmp/base.mp4");
  });

  it("omits music branch when musicPath is null", () => {
    const argv = buildBaseComposeArgs({
      concatListPath: "/tmp/list.txt",
      voicePath: "/tmp/voice.wav",
      musicPath: null,
      outputPath: "/tmp/base.mp4",
    });
    expect(argv.join(" ")).not.toContain("amix");
    expect(argv.join(" ")).not.toContain("volume=0.25");
  });
});

describe("buildCompositeArgs", () => {
  it("overlays the transparent overlay video onto the base video", () => {
    const argv = buildCompositeArgs({
      basePath: "/tmp/base.mp4",
      overlayPath: "/tmp/captions.mov",
      outputPath: "/tmp/out.mp4",
    });
    expect(argv).toContain("-i");
    expect(argv).toContain("/tmp/base.mp4");
    expect(argv).toContain("/tmp/captions.mov");
    expect(argv.join(" ")).toContain("[0:v][1:v]overlay=format=auto[v]");
    expect(argv).toContain("/tmp/out.mp4");
  });
});
```

And update the imports at the top:
```ts
import {
  buildNormalizeShotArgs,
  buildBaseComposeArgs,   // renamed
  buildCompositeArgs,     // new
} from "../../../../scripts/render-worker/lib/ffmpeg-commands";
```

### Step 7.2: Run test, confirm failure (rename not yet done)

```bash
npm test -- src/tests/lib/worker/ffmpeg-commands.test.ts
```
Expected: FAIL — `buildBaseComposeArgs` and `buildCompositeArgs` not exported.

### Step 7.3: Modify `scripts/render-worker/lib/ffmpeg-commands.ts`

- Rename `buildFinalComposeArgs` → `buildBaseComposeArgs`, remove the `subtitlesPath` parameter, drop the subtitles filter logic.
- Add `buildCompositeArgs` + `compositeBaseAndOverlay` runner.

Full updated relevant sections (REPLACE the existing `SRT_FORCE_STYLE`, `buildFinalComposeArgs`, and `finalCompose`):

```ts
// Remove SRT_FORCE_STYLE constant entirely — no longer used.

export function buildBaseComposeArgs(args: {
  concatListPath: string;
  voicePath: string;
  musicPath: string | null;
  outputPath: string;
}): string[] {
  const inputs: string[] = [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', args.concatListPath,  // input 0: video concat
    '-i', args.voicePath,                                      // input 1: voice
  ];
  if (args.musicPath) inputs.push('-i', args.musicPath);       // input 2: music (optional)

  let audioFilter: string;
  let audioStream: string;
  if (args.musicPath) {
    audioFilter = '[2:a]volume=0.25[m];[1:a][m]amix=inputs=2:duration=first[a]';
    audioStream = '[a]';
  } else {
    audioFilter = '';
    audioStream = '1:a';
  }

  return [
    ...inputs,
    ...(audioFilter ? ['-filter_complex', audioFilter] : []),
    '-map', '0:v',
    '-map', audioStream,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    '-movflags', '+faststart',
    args.outputPath,
  ];
}

export async function composeBase(args: {
  concatListPath: string;
  voicePath: string;
  musicPath: string | null;
  outputPath: string;
}): Promise<void> {
  await runFfmpeg(buildBaseComposeArgs(args));
}

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
    '-map', '0:a',                    // base audio passes through unchanged
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

// Keep the existing finalCompose export as a deprecated alias to ease the
// transition; remove in Task 9 once render-f1.ts is updated.
export const finalCompose = composeBase;
```

Leave `buildNormalizeShotArgs`, `normalizeShot`, `renderColoredBackground`, `writeConcatList`, `renderBlackBackgroundWithAudio`, `runFfmpeg` unchanged.

### Step 7.4: Run test, confirm pass

```bash
npm test -- src/tests/lib/worker/ffmpeg-commands.test.ts
```
Expected: PASS.

### Step 7.5: Full suite check

```bash
npm test 2>&1 | tail -5
```
Expected: 172/11 (one new buildCompositeArgs test added; the renamed tests still count the same). If the count looks off by one in either direction, inspect — the prior test file had 4 tests on the (now-removed) subtitles filter behavior; check that the rename covered all of them.

### Step 7.6: Commit

```bash
git add scripts/render-worker/lib/ffmpeg-commands.ts src/tests/lib/worker/ffmpeg-commands.test.ts
git commit -m "$(cat <<'EOF'
refactor(worker): split ffmpeg into base + composite passes

buildFinalComposeArgs → buildBaseComposeArgs (no subtitlesPath; the
final compose no longer burns captions because they're now rendered
by Remotion in Task 5+ and composited in this commit).

Adds buildCompositeArgs + compositeBaseAndOverlay: overlays a
transparent ProRes 4444 .mov onto the base .mp4 via filter_complex
[0:v][1:v]overlay. Base audio passes through with -c:a copy.

`finalCompose` kept as deprecated alias; removed when render-f1
handler is updated in Task 9.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Pipe Director's caption_props through to your_videos

**Files:**
- Modify: `src/lib/agents/orchestrator.ts` (record caption_props in decisions; pass through if needed)
- Modify: `src/lib/supabase/repositories/your-videos.ts` (add a column accessor)
- Create: SQL migration `supabase/migrations/20260526000001_your_videos_caption_props.sql`

The Director's `caption_props` need to land somewhere the worker can read. The cleanest hop: store on `your_videos` as a JSONB column. The worker's existing `fetchShotList` already reads the latest director decision, so we could also read from there — but a dedicated column makes the worker's contract simpler and survives any future schema reorganization of decisions.

### Step 8.1: Write the migration

```sql
-- supabase/migrations/20260526000001_your_videos_caption_props.sql
alter table public.your_videos
add column if not exists caption_props jsonb;

comment on column public.your_videos.caption_props is
  'Phase 2.5 Director-picked CaptionsPropsSchema for the Remotion overlay render.';
```

Apply via Supabase MCP or `supabase db push`.

### Step 8.2: Add caption_props to YourVideo type

Open `src/lib/supabase/repositories/your-videos.ts`. Add `caption_props?: Record<string, unknown> | null;` to the `YourVideo` type. No type-narrowing needed at this layer — the worker enforces `CaptionsPropsSchema.parse()` before render.

### Step 8.3: Modify orchestrator's `createVideoDraft` call to include caption_props

In `src/lib/agents/orchestrator.ts`, find the `createVideoDraft` call near the end (around line 198-207). Add `captionProps: directorOut.caption_props` to the args.

```ts
const draft = await createVideoDraft(supabase, {
  channelId: channel.id,
  topicQueueId: topic.id,
  title: topic.title,
  script: writerOut.script,
  voiceProvider: voiceCoachOut.provider,
  voiceId: voiceCoachOut.voice_id,
  visualTreatment: directorOut.visual_treatment,
  durationSeconds: writerOut.estimated_duration_seconds,
  captionProps: directorOut.caption_props,        // NEW
});
```

### Step 8.4: Update `createVideoDraft` to accept + persist captionProps

In `src/lib/supabase/repositories/your-videos.ts`, modify `createVideoDraft`:

```ts
export async function createVideoDraft(
  supabase: SupabaseClient,
  args: {
    channelId: string;
    topicQueueId: string;
    title: string;
    script: string;
    voiceProvider: string;
    voiceId: string;
    visualTreatment: string;
    durationSeconds: number;
    captionProps: Record<string, unknown>;     // NEW
  },
): Promise<YourVideo> {
  const { data, error } = await supabase
    .from("your_videos")
    .insert({
      channel_id: args.channelId,
      topic_queue_id: args.topicQueueId,
      title: args.title,
      script: args.script,
      voice_provider: args.voiceProvider,
      voice_id: args.voiceId,
      visual_treatment: args.visualTreatment,
      duration_seconds: args.durationSeconds,
      caption_props: args.captionProps,         // NEW
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw new Error(`createVideoDraft: ${error.message}`);
  return data as YourVideo;
}
```

### Step 8.5: Verify tests still pass

```bash
npm test 2>&1 | tail -5
```
Expected: 172/11. The existing orchestrator tests mock `createVideoDraft`; if any of them call it directly, they need the new `captionProps` arg added.

If the test fails: open the failing test and add `captionProps: { variant: 'word-by-word', accent_color: '#FFD23F', accent_word_policy: 'first-noun', highlighted_words: [], animation_speed: 1.0, font_scale: 1.0 }` to the args.

### Step 8.6: Commit

```bash
git add supabase/migrations/20260526000001_your_videos_caption_props.sql \
        src/lib/supabase/repositories/your-videos.ts \
        src/lib/agents/orchestrator.ts \
        src/tests/   # if any tests needed updating
git commit -m "$(cat <<'EOF'
feat(schema): your_videos.caption_props jsonb column

Director's caption_props travel from the orchestrator → createVideoDraft
→ your_videos.caption_props. The worker reads it before render.

Migration is additive + nullable; existing rows have caption_props=null
and the worker treats null as 'use Phase 2.5 defaults' (variant=word-by-word,
accent=#FFD23F, policy=first-noun, scale=1.0, speed=1.0).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: render-f1 handler pipeline restructure

**Files:**
- Modify: `scripts/render-worker/handlers/render-f1.ts`

The render-f1 handler now does base + captions overlay + composite instead of single-pass subtitles.

### Step 9.1: Read the existing handler

```bash
wc -l scripts/render-worker/handlers/render-f1.ts
```
Expected: ~190 lines (Phase 2 + the debug-trace from the post-mortem).

### Step 9.2: Modify the pipeline

Replace the existing `// ─── Final compose ───` section (around lines 145-160) with:

```ts
// ─── Whisper forced-alignment ───
let words: { word: string; start: number; end: number }[] = [];
try {
  const transcription = await transcribeWavWithWordTimestamps(voicePath);
  words = transcription.words;
  log(`whisper got ${words.length} words`);
} catch (err) {
  log(`whisper failed: ${(err as Error).message} (rendering without captions)`);
}

// ─── Music bed (best-effort) — unchanged ───
let musicPath: string | null = null;
try {
  const music = await pickAndDownloadMusic({
    supabase,
    outputPath: join(workDir, 'music.mp3'),
  });
  if (music) {
    musicPath = music.outputPath;
    log(`music ready (track ${music.musicTrackId})`);
  } else {
    log('music skipped: no eligible tracks');
  }
} catch (err) {
  log(`music pick failed: ${(err as Error).message}`);
}

// ─── Base compose (b-roll + voice + music, NO captions) ───
const concatListPath = join(workDir, 'concat.txt');
await writeConcatList(normalizedPaths, concatListPath);
const basePath = join(workDir, 'base.mp4');
await composeBase({
  concatListPath,
  voicePath,
  musicPath,
  outputPath: basePath,
});
log('base compose done');

// ─── Remotion captions overlay ───
const captionsPath = join(workDir, 'captions.mov');
let captionsRendered = false;
if (words.length > 0) {
  const captionProps = (yv.caption_props as Record<string, unknown> | null) ?? {
    variant: 'word-by-word',
    accent_color: '#FFD23F',
    accent_word_policy: 'first-noun',
    highlighted_words: [],
    animation_speed: 1.0,
    font_scale: 1.0,
  };
  const durationInFrames = Math.ceil(durationSeconds * 30);
  const result = await renderRemotionOverlay({
    compositionId: 'captions-word-by-word',
    props: { ...captionProps, words, durationSeconds },
    outputPath: captionsPath,
    durationInFrames,
  });
  if (result.exitCode === 0) {
    captionsRendered = true;
    log('captions overlay rendered');
  } else {
    log(`remotion render failed exit=${result.exitCode}: ${result.stderr.slice(-500)} (continuing without overlay)`);
  }
} else {
  log('no whisper words — skipping captions overlay');
}

// ─── Final composite ───
const outPath = join(workDir, 'out.mp4');
if (captionsRendered) {
  await compositeBaseAndOverlay({
    basePath,
    overlayPath: captionsPath,
    outputPath: outPath,
  });
  log('composite done');
} else {
  // No overlay — copy base to out
  const { copyFile } = await import('node:fs/promises');
  await copyFile(basePath, outPath);
  log('no overlay; using base as final output');
}

const actualDuration = await probeDurationSeconds(outPath);

// ─── Blob upload (unchanged) ───
const blobUrl = await uploadMp4ToBlob(outPath, `renders/${payload.your_video_id}.mp4`);
log(`uploaded to ${blobUrl}`);
```

And update the imports at the top of the handler:
```ts
import {
  normalizeShot,
  renderColoredBackground,
  writeConcatList,
  composeBase,                  // renamed (was: finalCompose)
  compositeBaseAndOverlay,      // new
} from '../lib/ffmpeg-commands.ts';
import { renderRemotionOverlay } from '../lib/remotion.ts';
```

Also load `caption_props` in the initial your_videos query:
```ts
const { data: yv, error: yvErr } = await supabase
  .from('your_videos')
  .select('id, script, voice_id, channel_id, topic_queue_id, caption_props')   // added caption_props
  .eq('id', payload.your_video_id)
  .single();
```

### Step 9.3: Run tests — the existing handler integration test (none direct, but indirect via tsc)

```bash
npx tsc --noEmit 2>&1 | head -10
npm test 2>&1 | tail -5
```
Expected: same baselines, no regressions.

### Step 9.4: Commit

```bash
git add scripts/render-worker/handlers/render-f1.ts
git commit -m "$(cat <<'EOF'
feat(render): swap SRT burn-in for Remotion captions overlay

render-f1 pipeline now:
  TTS → Pexels+normalize → Whisper → base compose (NO captions)
  → Remotion captions overlay (transparent ProRes 4444)
  → ffmpeg composite (overlay onto base)
  → Blob upload

Falls back gracefully:
  - Whisper failure → no captions overlay; base.mp4 is the final
  - Remotion failure → same — base.mp4 is the final, error in trace
  - your_videos.caption_props NULL → use Phase 2.5 defaults

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: End-to-end smoke render through `/lab/drafts`

This task isn't a code change — it's the operator-driven validation that takes everything from Tasks 1-9 and runs it through the production cron path.

### Step 10.1: Merge plan-4-phase-2-5 to main

Phase 2's lesson #4 applies again: Vercel cron only fires on Production. The dispatcher cron picks up render_jobs rows and dispatches against the Production deploy's SHA. So to smoke-test the new pipeline, we have to merge to main.

```bash
gh pr view 2>&1 | head -3      # find the PR number for plan-4-phase-2-5
gh pr merge <PR#> --merge
```

Alternatively, locally:
```bash
cd /Users/darius/Downloads/shorts-os    # the main worktree, not phase-2-5
git checkout main
git pull
git merge plan-4-phase-2-5 --no-ff -m "Merge plan-4-phase-2-5 to main for smoke"
git push origin main
```

### Step 10.2: Wait for Production deploy

```bash
until vercel ls 2>&1 | awk '/Production/' | head -1 | grep -qE "● Ready"; do sleep 20; done
vercel ls 2>&1 | head -5 | tail -1
```

### Step 10.3: Reset the existing draft (or dispatch a new one)

Use the same draft from Phase 2's smoke (UUID `cbd632c6-12f5-47fa-9dd1-32e8df7fda72`), reset it to status='draft':

```sql
-- via Supabase MCP
update public.your_videos
set status='draft', render_artifact_url=null, caption_props=null, updated_at=now()
where id='cbd632c6-12f5-47fa-9dd1-32e8df7fda72';
```

The orchestrator's caption_props haven't been backfilled for this draft (the Phase 2 dispatch ran before this column existed). Setting `caption_props=null` is fine — the worker uses Phase 2.5 defaults when null.

Better: dispatch a fresh topic via /lab so the new Director run populates caption_props for real.

### Step 10.4: Navigate to `https://shorts-os-roan.vercel.app/lab/drafts?tab=draft` + click Render

Operator clicks Render on the chosen draft. The page should flip to "rendering…" and the dispatcher cron picks up within ~60s.

### Step 10.5: Watch progress

```bash
# In a separate terminal:
while true; do
  echo "$(date) — status:"
  curl -sS "https://shorts-os-roan.vercel.app/api/lab/jobs/active" | jq
  sleep 30
done
```

Or query directly:
```sql
select id, status, started_at, finished_at,
       extract(epoch from (now() - started_at)) as running_seconds,
       substring(last_error, 1, 500) as trace_head
from public.render_jobs
where your_video_id = (select id from public.your_videos order by created_at desc limit 1)
order by created_at desc limit 1;
```

### Step 10.6: Expected timing

Total wall-clock should land between 120s and 240s:
- Cold start (already paid): per Task 2 measurement
- TTS: ~10-15s
- Pexels × 10 + normalize × 10: ~50-70s
- Whisper: ~10-15s
- Base compose: ~10s
- Remotion render (60s of caption frames at 30fps with motion): ~30-60s
- Composite: ~5-10s
- Blob upload: ~3s

**Gate:** ≤ 240s wall-clock. If exceeded: stop, capture trace, surface to operator.

### Step 10.7: Open the rendered video at `/lab/drafts?tab=rendered`

The inline `<video>` plays the result. Run the 6-item operator checklist below.

---

## Task 11: Operator visual checklist (Gate 3 Stage 3b)

The operator marks each of these boxes after watching the rendered video at `/lab/drafts?tab=rendered`. Capture results in the benchmark doc (Task 13).

```
- [ ] Font is clearly Montserrat ExtraBold (bold, geometric, NOT system default)
- [ ] Captions animate word-by-word with the bounce (not all at once, not static)
- [ ] Captions appear within ~50ms of the spoken word (no visible lag)
- [ ] Emphasis words tint yellow (#FFD23F) and scale up briefly
- [ ] Drop shadow + black stroke are visible on captions over any b-roll color
- [ ] Bottom-third positioning (no captions cutting off bottom edge)
```

**Pass condition:** all 6 boxes checked.

**Fail handling (per item):**
- Font wrong → Stage 3a (Task 3) somehow passed but the live render is wrong. Re-investigate font loading; check Remotion bundling.
- No bounce → spring config in word-by-word.tsx is broken; adjust damping/stiffness.
- Sync lag → wordsToFrames or animation_speed math wrong; recheck.
- Emphasis missing → accent_word_policy may have been 'none'; check Director's caption_props in this draft. Also check the WordBox accentScale calculation.
- Stroke/shadow not visible → check `WebkitTextStroke` + `textShadow` + `paintOrder` actually applied; some Chromium versions need different CSS.
- Position wrong → adjust `top: 63%` in word-by-word.tsx.

---

## Task 12: Hard-rule audit + benchmark doc + cleanup

**Files:**
- Create: `docs/superpowers/notes/2026-05-26-plan-4-phase-2-5-end-to-end-benchmark.md`
- Delete: `src/app/api/render/debug-2-5/route.ts`

### Step 12.1: Audit hard rules

```bash
# 1. No @vercel/sandbox imports outside the allowed paths
grep -rln '@vercel/sandbox' src/ scripts/ | grep -v 'src/lib/render/workers/vercel-sandbox.ts' | grep -v 'scripts/render-worker/' | grep -v 'src/app/api/render/debug-2-5'

# 2. No secrets committed
grep -rln 'sk_car_\|sk_live\|csk_live\|gsk_\|bZPpDPq' src/ scripts/ docs/ supabase/ 2>/dev/null
# Expected: nothing. If hits, scrub and recommit.

# 3. server-only on secret-holding modules
grep -L 'server-only' src/lib/clients/*.ts
# Expected: all files in src/lib/clients/ should include 'server-only'.

# 4. No `any` in new code
grep -E ': any\b|<any>' src/remotion/ scripts/render-worker/lib/remotion.ts scripts/render-worker/lib/glyph-hash.ts 2>/dev/null
# Expected: no hits (or only `as unknown as ...` workarounds where typing libraries are loose).
```

If anything flags, fix in a follow-up commit before the merge.

### Step 12.2: Delete the debug-2-5 route

```bash
rm -rf src/app/api/render/debug-2-5
git add -A
git commit -m "$(cat <<'EOF'
chore(debug): remove debug-2-5 cold-start + font-probe routes

Phase 2.5 acceptance gates all passed. The debug routes were
diagnostic-only; CRON_SECRET auth alone isn't sufficient for a
production attack surface on a public repo.

Re-creatable from the plan if a future regression needs it.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Step 12.3: Write the benchmark doc

`docs/superpowers/notes/2026-05-26-plan-4-phase-2-5-end-to-end-benchmark.md`:

```markdown
# Plan #4 Phase 2.5 — End-to-end benchmark

**Date:** 2026-05-26 (UTC)
**Result:** PASS — wall-clock <N>s (gate 240s)

## Per-stage timing (job <render_job_id>)

| Stage | Elapsed | Notes |
|---|---|---|
| Dispatcher claim → Sandbox.create return | ~Xs | |
| Git clone + `npm ci` | ~Xs | Phase 2.5 cold-start measured separately (Task 2) |
| Cartesia TTS | ~Xs | duration: Ys of audio |
| Per-shot Pexels + normalize × N | ~Xs | |
| Whisper alignment | ~Xs | got K words |
| Base compose ffmpeg | ~Xs | concat + voice + music@0.25 |
| Remotion captions render | ~Xs | composition: captions-word-by-word, durationInFrames=F |
| ffmpeg composite | ~Xs | overlay onto base |
| Blob upload | ~Xs | |
| Callback + state transition | <1s | |
| **Total** | **<N>s** | gate 240s |

## Gate 3 Stage 3a — Font glyph-hash (from Task 3)

| Glyph | Expected | Actual | Match |
|---|---|---|---|
| g_lower | <md5> | <md5> | ✓ |
| Q_upper | <md5> | <md5> | ✓ |
| z_lower | <md5> | <md5> | ✓ |
| (4th)   | <md5> | <md5> | ✓ |

## Gate 3 Stage 3b — Operator visual checklist

- [✓] Font is clearly Montserrat ExtraBold (bold, geometric, NOT system default)
- [✓] Captions animate word-by-word with the bounce (not all at once, not static)
- [✓] Captions appear within ~50ms of the spoken word (no visible lag)
- [✓] Emphasis words tint yellow (#FFD23F) and scale up briefly
- [✓] Drop shadow + black stroke are visible on captions over any b-roll color
- [✓] Bottom-third positioning (no captions cutting off bottom edge)

## Adaptations from the plan that surfaced during execution

(list anything that needed adjustment — like Phase 1 + 2's adaptation notes)

## What this benchmark unlocks

Phase 2.5 acceptance gates passed. Phase 3 (Reddit clip ingest), Phase 4
(Format 2 + Composer), and Phase 5 (OAuth + analytics + scheduling) resume.
```

Fill in the actual numbers + checklist results.

### Step 12.4: Commit benchmark + finalize PR

```bash
git add docs/superpowers/notes/2026-05-26-plan-4-phase-2-5-end-to-end-benchmark.md
git commit -m "docs(plan-4): Phase 2.5 end-to-end benchmark — PASS at <N>s"
git push
gh pr ready <PR#>
gh pr merge <PR#> --merge
```

After merge, Production rebuilds. Verify the next render still works via /lab/drafts.

---

## Phase 2.5 exit checklist

- [ ] Task 1: Remotion deps added to worker package.json
- [ ] Task 2: Cold-start probe — gate PASSED at <120s
- [ ] Task 3: Font glyph-hash probe — gate PASSED (Stage 3a)
- [ ] Task 4: CaptionsPropsSchema + Director caption_props + prompt updates
- [ ] Task 5: word-by-word composition implemented
- [ ] Task 6: scripts/render-worker/lib/remotion.ts wrapper + test
- [ ] Task 7: ffmpeg compose split into base + composite
- [ ] Task 8: your_videos.caption_props column + repo plumbing
- [ ] Task 9: render-f1 handler restructured
- [ ] Task 10: End-to-end smoke through Production — gate PASSED at ≤240s
- [ ] Task 11: Operator 6-item checklist all checked (Stage 3b)
- [ ] Task 12: Audit clean, debug route deleted, benchmark doc committed
- [ ] PR merged to main; production stable
- [ ] Phases 3, 4, 5 resumed

---

## Coordination with parallel Phase 3 work

Phase 3 work happens on its own branch. Phase 2.5 work happens on `plan-4-phase-2-5`. Conflicts are likely small:
- `scripts/render-worker/package.json` — Phase 3 may add `yt-dlp-exec` or similar; merge order doesn't matter.
- `scripts/render-worker/handlers/` — Phase 2.5 modifies `render-f1.ts`, Phase 3 adds `clip-ingest.ts`.
- `src/lib/agents/director.ts` — Phase 2.5 modifies; Phase 3 doesn't touch.

Whichever PR merges second resolves any conflict. If non-trivial, prefer rebasing the later branch onto the merged one.
