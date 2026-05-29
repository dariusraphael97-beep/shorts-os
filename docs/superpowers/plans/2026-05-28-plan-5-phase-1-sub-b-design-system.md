# Plan #5 Phase 1 Sub-phase B — Design System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task (one implementer subagent per task on sonnet; spec-review + quality-review on haiku between tasks). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the tokenized, motion-aware, premium (9/10) design system foundation that every Plan #5 UI surface — and every rebuild of the existing `/lab`, `/clips`, cockpit pages — will consume, so later sub-phases inherit zero design rework.

**Architecture:** A CSS-variable token layer (Tailwind v4 CSS-first, `globals.css`) defines the Apple-system + Notion-calm palette (dark default, system-blue accent), typography scale, spacing, radii, elevation, translucency, and motion tokens. shadcn/ui `base-nova` primitives (Base UI under the hood) are already partly installed; we install the remainder via the CLI and they inherit our look automatically by consuming the remapped semantic tokens. On top sit three layers the product actually uses: **layout primitives** (translucent collapsible sidebar, no-top-bar AppShell, Cmd+K command palette), **motion primitives** (Framer Motion page/hover/modal transitions wired to motion tokens), and **product compositions** (NicheCard, AssistantCard, ReviewScorecard, badges, sparkline, EmptyState, MissionControlGrid). All deterministic logic (sparkline math, badge mapping, number formatting, motion constants) is pure, lives in `src/lib/design/`, and is unit-tested; visual rendering is verified via typecheck + build + a throwaway `/sandbox/components` demo route + the per-task quality review.

**Tech Stack:** Next.js 16.2.6 (App Router) · React 19.2.4 · Tailwind CSS v4 (CSS-first `@theme`, no `tailwind.config`) · shadcn `base-nova` style on `@base-ui/react` · `motion` v12 (`motion/react`) · `next-themes` · `next/font/google` (Inter Variable + Geist Mono) · `lucide-react` · `sonner` · `@tanstack/react-table` · `cmdk`/`react-day-picker` (pulled by shadcn CLI) · vitest (node env) for logic tests.

---

## Key decisions (read before starting)

1. **Component naming: `Assistant*`, not `Agent*`.** The kickoff prompt for this sub-phase explicitly names `AssistantCard` / `AssistantStatusDot`. We follow it because (a) Sub-phase A renamed the DB tables + repository helpers to `assistants` to avoid colliding with Plan #4's pipeline-`agents` table, and (b) an existing `src/components/cockpit/agent-card.tsx` would clash. **The user-facing *display text* still reads "Agent"** per the product vision — only the code identifier is `Assistant*`. (See the Sub-phase A handoff naming decision.)

2. **TDD applies to logic, not pixels.** This repo's vitest setup is node-environment only (`src/tests/**/*.test.ts`, no jsdom/testing-library). We do **not** add component render-test tooling in this sub-phase. So: pure logic modules (`src/lib/design/*`, `src/lib/motion.ts`) get full TDD (failing test → implement → pass). Visual components are gated by `tsc --noEmit` + `npm run build` + appearing correctly in `/sandbox/components` + the haiku quality review. This is the honest decomposition — don't fake render tests in node.

3. **Don't hand-author throwaway TSX for the visual layer — invoke the design skills.** Every task that builds a visual primitive or composition MUST have the implementer invoke `vercel:shadcn` (for CLI/primitive conventions), `frontend-design`, and `ui-ux-pro-max`. The plan specifies the exact file, props interface, tokens, states, and motion to use; the implementer produces the markup *through those skills*. "We used shadcn" is not the bar — see `feedback_shadcn_is_the_floor.md`. Default-shadcn-looking output is a review failure.

4. **Old pages must keep building.** `/`, `/lab`, `/clips`, `/login` and the `cockpit`/`lab`/`clips` components are NOT rebuilt here (that's Sub-phases C–J). Remapping the shadcn semantic tokens will *restyle* them (acceptable visual drift — they're slated for rebuild), but they must still compile and render without errors. The legacy custom tokens (`--bg-app`, `--accent-electric`, …) and the aceternity keyframes (marquee/shimmer/border-beam/spin-around) that those components import are **preserved** in a clearly-marked legacy block in `globals.css`. Do not delete them in this sub-phase.

5. **Read the Next 16 docs before writing Next code.** Per `AGENTS.md`: this is not the Next.js in your training data. Before Task 2 read `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md` and `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md`.

6. **Running the dev server from a Claude Code shell:** add `-u ANTHROPIC_BASE_URL` to the env unset list (per `feedback_anthropic_base_url_local.md`) or AI SDK calls 404. Only relevant for the Task 14 visual smoke (`npm run dev`).

7. **TS strict, no `any`.** Design-layer prop types own their own narrowed unions (e.g. `DiscoveryState = "discovered" | "emerging" | "validated" | "saturated"`); Sub-A's generated types expose these columns as `string`, so consuming sub-phases adapt DB rows → these unions. That adapting is NOT in scope here.

---

## Pre-flight (do once, before Task 1)

- [ ] Confirm on branch `plan-5-phase-1-sub-b` (already created off `main` @ `a745c4c`, which includes the merged PR #13).
- [ ] Re-read spec §4.7 (`docs/superpowers/specs/2026-05-28-plan-5-creator-copilot-design.md:329-384`) and §4.8 (`:386-419`) for the AssistantCard / MissionControlGrid context.
- [ ] Confirm current frontend state matches assumptions: `components.json` style is `base-nova`; `src/app/globals.css` has the legacy neon token set; `src/app/layout.tsx` has no fonts/ThemeProvider; primitives present = button, card, input, label, badge, dialog, dropdown-menu, scroll-area, sheet, tabs, tooltip, sonner.

---

## File structure map

**Created:**
- `src/lib/motion.ts` — motion token constants + reusable Framer variants (durations, eases, springs, `fadeRise`, `hoverLift`, `modalScale`).
- `src/lib/design/badges.ts` — pure mapping fns: discovery-state / proven-band / production-fit / outlier-tier / assistant-status → `{ label, tone, icon? }`.
- `src/lib/design/format.ts` — `formatCompactNumber`, `formatVelocity`, `formatShortcut`.
- `src/lib/design/sparkline.ts` — `buildSparklinePath(values, w, h)` + `sparklineTrend(values)`.
- `src/components/motion/page-transition.tsx`, `hover-lift.tsx`, `tappable.tsx`, `modal-motion.tsx`, plus `index.ts` barrel. Each respects `prefers-reduced-motion`.
- `src/components/layout/app-shell.tsx`, `sidebar.tsx`, `page-header.tsx`, `theme-toggle.tsx`, `command-palette.tsx`, plus `index.ts` barrel.
- `src/components/compositions/` — `assistant-status-dot.tsx`, `outlier-badge.tsx`, `discovery-state-badge.tsx`, `production-fit-badge.tsx`, `proven-band-badge.tsx`, `keyboard-shortcut-hint.tsx`, `velocity-sparkline.tsx`, `niche-card.tsx`, `assistant-card.tsx`, `review-scorecard.tsx`, `review-suggestion-item.tsx`, `empty-state.tsx`, `mission-control-grid.tsx`, plus `index.ts` barrel.
- `src/components/ui/*` — new shadcn primitives from the CLI: `textarea`, `select`, `combobox`, `command`, `popover`, `avatar`, `progress`, `skeleton`, `separator`, `accordion`, `radio-group`, `switch`, `slider`, `calendar`, `table` + `src/components/ui/data-table.tsx` (TanStack wrapper).
- `src/app/sandbox/components/page.tsx` (+ `layout.tsx` if needed) — throwaway showcase route. **Delete in Sub-phase J.**
- Tests under `src/tests/lib/`: `motion.test.ts`, `design/badges.test.ts`, `design/format.test.ts`, `design/sparkline.test.ts`, `design/tokens.test.ts`.

**Modified:**
- `src/app/globals.css` — full token rewrite (dark default), legacy block preserved.
- `src/app/layout.tsx` — fonts, ThemeProvider, Toaster, font CSS vars.
- `src/components/ui/sonner.tsx` — re-theme against our tokens (keep next-themes wiring).
- `package.json` / lockfile — new deps from CLI + `@tanstack/react-table`.

---

### Task 1: Design tokens — rewrite `globals.css` (dark default, Apple-system palette)

**Files:**
- Modify: `src/app/globals.css`
- Test: `src/tests/lib/design/tokens.test.ts`

**Context:** Light values live in `:root`; dark values override in `.dark`. `next-themes` (Task 2) sets `defaultTheme="dark"`, so `.dark` is the effective default — this matches the existing file structure and the `@custom-variant dark (&:is(.dark *))` already in the file. Theme-independent tokens (type scale, spacing, radii, motion, blur) live once in `:root`. Preserve the legacy block verbatim so old pages keep compiling.

- [ ] **Step 1: Write the token-contract test (failing).** This guards the non-negotiable token values so a future edit can't silently revert the palette.

```ts
// src/tests/lib/design/tokens.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const css = readFileSync(resolve(__dirname, "../../../app/globals.css"), "utf8");

describe("design tokens", () => {
  it("uses the Apple system-blue accent (not legacy neon green)", () => {
    expect(css).toMatch(/--accent:\s*#0a84ff/);
    expect(css).not.toMatch(/--accent:\s*#00ff88/); // legacy neon must not be the accent
  });
  it("defines the dark surface ramp from the spec", () => {
    expect(css).toMatch(/--bg:\s*#0a0a0b/);
    expect(css).toMatch(/--surface-1:\s*#131315/);
    expect(css).toMatch(/--surface-2:\s*#1b1b1e/);
  });
  it("defines the full type scale", () => {
    for (const t of ["--text-xs", "--text-sm", "--text-base", "--text-lg", "--text-xl", "--text-2xl", "--text-3xl", "--text-4xl"]) {
      expect(css).toContain(t);
    }
  });
  it("defines spec radii (6/10/16/24)", () => {
    expect(css).toMatch(/--radius-sm:\s*6px/);
    expect(css).toMatch(/--radius-md:\s*10px/);
    expect(css).toMatch(/--radius-lg:\s*16px/);
    expect(css).toMatch(/--radius-xl:\s*24px/);
  });
  it("defines motion duration + translucency tokens", () => {
    expect(css).toMatch(/--duration-instant:\s*100ms/);
    expect(css).toMatch(/--duration-smooth:\s*320ms/);
    expect(css).toContain("blur(20px) saturate(180%)");
  });
  it("preserves legacy tokens so old pages still build", () => {
    expect(css).toContain("--accent-electric");
    expect(css).toContain("@keyframes marquee");
  });
});
```

- [ ] **Step 2: Run it to verify it fails.** `npx vitest run src/tests/lib/design/tokens.test.ts` → FAIL (legacy `--accent: ...` not present / new tokens missing).

- [ ] **Step 3: Rewrite `globals.css`.** Replace lines 7–225 (the `=== Shorts OS design tokens ===` block through the end) with the structure below; keep the first 5 lines (`@import` + `@custom-variant`) intact. Brand color tokens go in `:root` (light) and are overridden in `.dark`. Theme-independent tokens go in `:root` only. Map shadcn semantic tokens to the brand tokens. Then the `@theme inline` block exposes everything to Tailwind utilities. End with a clearly-fenced **LEGACY** block carrying the old custom vars + aceternity keyframes unchanged.

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

/* ============================================================
   Shorts OS Design System — Plan #5 (spec §4.7)
   Apple-system + Notion-calm. Dark is the default theme
   (next-themes defaultTheme="dark" applies `.dark` on <html>).
   ============================================================ */

:root {
  /* --- theme-independent: typography scale (rem, 1.25 ratio) --- */
  --text-xs: 0.75rem;   /* 12 */
  --text-sm: 0.875rem;  /* 14 */
  --text-base: 1rem;    /* 16 */
  --text-lg: 1.25rem;   /* 20 */
  --text-xl: 1.5rem;    /* 24 */
  --text-2xl: 2rem;     /* 32 */
  --text-3xl: 3rem;     /* 48 */
  --text-4xl: 4rem;     /* 64 */
  --leading-body: 1.55;
  --leading-display: 1.2;
  --leading-controls: 1.4;

  /* --- theme-independent: radii --- */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius: var(--radius-md); /* shadcn base */

  /* --- theme-independent: motion --- */
  --duration-instant: 100ms;
  --duration-quick: 200ms;
  --duration-smooth: 320ms;
  --duration-slow: 500ms;
  --ease-entry: cubic-bezier(0, 0, 0.2, 1);
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);

  /* --- theme-independent: translucency --- */
  --glass-blur: blur(20px) saturate(180%);

  /* --- LIGHT brand colors (Notion-calm mirror) --- */
  --bg: #ffffff;
  --surface-1: #fafafa;
  --surface-2: #f4f4f5;
  --surface-overlay: rgba(255, 255, 255, 0.72);
  --border-subtle: #e5e5e7;
  --border-strong: #d4d4d8;
  --text-primary: #1c1c1e;
  --text-secondary: #6e6e73;
  --text-tertiary: #a8a8ad;
  --accent: #007aff;
  --accent-hover: #0a84ff;
  --accent-muted: rgba(0, 122, 255, 0.12);
  --accent-foreground: #ffffff;
  --success: #30c14e;
  --warning: #e6a700;
  --danger: #ff3b30;

  /* --- LIGHT elevation --- */
  --elev-1: 0 0 0 1px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
  --elev-2: 0 0 0 1px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.08);
  --elev-3: 0 0 0 1px rgba(0,0,0,0.06), 0 24px 64px rgba(0,0,0,0.12);

  /* --- shadcn semantic tokens mapped to brand (LIGHT) --- */
  --background: var(--bg);
  --foreground: var(--text-primary);
  --card: var(--surface-1);
  --card-foreground: var(--text-primary);
  --popover: var(--surface-1);
  --popover-foreground: var(--text-primary);
  --primary: var(--accent);
  --primary-foreground: var(--accent-foreground);
  --secondary: var(--surface-2);
  --secondary-foreground: var(--text-primary);
  --muted: var(--surface-2);
  --muted-foreground: var(--text-secondary);
  --accent-bg: var(--surface-2); /* shadcn hover surface; aliased below */
  --destructive: var(--danger);
  --border: var(--border-subtle);
  --input: var(--border-subtle);
  --ring: var(--accent);
  --chart-1: var(--accent);
  --chart-2: var(--success);
  --chart-3: var(--warning);
  --chart-4: var(--danger);
  --chart-5: var(--text-secondary);
  --sidebar: var(--surface-overlay);
  --sidebar-foreground: var(--text-primary);
  --sidebar-primary: var(--accent);
  --sidebar-primary-foreground: var(--accent-foreground);
  --sidebar-accent: var(--surface-2);
  --sidebar-accent-foreground: var(--text-primary);
  --sidebar-border: var(--border-subtle);
  --sidebar-ring: var(--accent);
}

.dark {
  /* --- DARK brand colors (spec §4.7 primary set) --- */
  --bg: #0a0a0b;
  --surface-1: #131315;
  --surface-2: #1b1b1e;
  --surface-overlay: rgba(28, 28, 32, 0.7);
  --border-subtle: #26262a;
  --border-strong: #3a3a3f;
  --text-primary: #f5f5f7;
  --text-secondary: #a8a8ad;
  --text-tertiary: #6e6e73;
  --accent: #0a84ff;
  --accent-hover: #1c95ff;
  --accent-muted: rgba(10, 132, 255, 0.15);
  --accent-foreground: #ffffff;
  --success: #30d158;
  --warning: #ffd60a;
  --danger: #ff453a;

  --elev-1: 0 0 0 1px rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.4);
  --elev-2: 0 0 0 1px rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.5);
  --elev-3: 0 0 0 1px rgba(255,255,255,0.08), 0 24px 64px rgba(0,0,0,0.7);

  /* shadcn semantic tokens re-resolve from the brand vars above
     because they were declared with var() references in :root.
     Re-declare the few that need a different dark treatment: */
  --card: var(--surface-1);
  --popover: var(--surface-2);
  --secondary: var(--surface-2);
  --muted: var(--surface-2);
  --accent-bg: var(--surface-2);
  --sidebar: var(--surface-overlay);
}

@theme inline {
  /* fonts (vars provided by next/font in layout.tsx — Task 2) */
  --font-sans: var(--font-inter), system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, "SF Mono", monospace;

  /* type scale → Tailwind text-* utilities */
  --text-xs: var(--text-xs);
  --text-sm: var(--text-sm);
  --text-base: var(--text-base);
  --text-lg: var(--text-lg);
  --text-xl: var(--text-xl);
  --text-2xl: var(--text-2xl);
  --text-3xl: var(--text-3xl);
  --text-4xl: var(--text-4xl);

  /* brand colors → Tailwind bg-*/text-*/border-* utilities */
  --color-bg: var(--bg);
  --color-surface-1: var(--surface-1);
  --color-surface-2: var(--surface-2);
  --color-border-subtle: var(--border-subtle);
  --color-border-strong: var(--border-strong);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-tertiary: var(--text-tertiary);
  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-accent-muted: var(--accent-muted);
  --color-accent-foreground: var(--accent-foreground);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-danger: var(--danger);

  /* shadcn semantic → Tailwind */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent-bg: var(--accent-bg);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  /* radii → Tailwind rounded-* */
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
  --radius-xl: var(--radius-xl);

  /* elevation → Tailwind shadow-elev-* */
  --shadow-elev-1: var(--elev-1);
  --shadow-elev-2: var(--elev-2);
  --shadow-elev-3: var(--elev-3);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-sans);
    line-height: var(--leading-body);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  html { @apply font-sans; }
  ::selection { background: var(--accent-muted); }
}

/* subtle scrollbars */
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 4px; }
*::-webkit-scrollbar-thumb:hover { background: var(--border-strong); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* ============================================================
   LEGACY — Plan #4 cockpit/lab/clips tokens + aceternity
   keyframes. DO NOT use in new code. Removed when those pages
   are rebuilt against this design system (Sub-phases C–J).
   ============================================================ */
:root {
  --bg-app: #0a0a0a;
  --bg-surface: #141414;
  --bg-elevated: #1c1c1c;
  --bg-hover: #252525;
  --accent-electric: #00ff88;
  --accent-amber: #ffa500;
  --accent-orange: #ff7043;
  --accent-red: #ff4444;
  --text-muted: #666666;
}
@property --angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
@keyframes border-beam-spin { to { --angle: 360deg; } }
@theme inline {
  --animate-marquee: marquee var(--duration) infinite linear;
  --animate-marquee-vertical: marquee-vertical var(--duration) linear infinite;
  @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(calc(-100% - var(--gap))); } }
  @keyframes marquee-vertical { from { transform: translateY(0); } to { transform: translateY(calc(-100% - var(--gap))); } }
  --animate-shimmer-slide: shimmer-slide var(--speed) ease-in-out infinite alternate;
  --animate-spin-around: spin-around calc(var(--speed) * 2) infinite linear;
  @keyframes shimmer-slide { to { transform: translate(calc(100cqw - 100%), 0); } }
  @keyframes spin-around {
    0% { transform: translateZ(0) rotate(0); }
    15%, 35% { transform: translateZ(0) rotate(90deg); }
    65%, 85% { transform: translateZ(0) rotate(270deg); }
    100% { transform: translateZ(0) rotate(360deg); }
  }
}
```

> Note for implementer: `--accent-bg` is the neutral hover surface that shadcn `base-nova` ghost/dropdown variants reference via `--accent`. If the installed primitives reference the literal `--accent`/`--accent-foreground` shadcn names for *hover surfaces* (not the brand blue), reconcile by checking `src/components/ui/button.tsx` (ghost variant uses `bg-muted` for hover — good, so brand `--accent` = blue is safe). Verify no primitive turns its hover state blue; if one does, point it at `--accent-bg`/`muted` instead. Confirm via the sandbox in Task 14.

- [ ] **Step 4: Run the contract test → PASS.** `npx vitest run src/tests/lib/design/tokens.test.ts`.

- [ ] **Step 5: Verify the app still builds.** `npm run build` (or `npx tsc --noEmit` if build is slow) → no errors. Old pages restyle but must compile.

- [ ] **Step 6: Commit.** `git add src/app/globals.css src/tests/lib/design/tokens.test.ts && git commit -m "feat(plan-5): design-system token layer (dark-default Apple-system palette)"`

---

### Task 2: Fonts + ThemeProvider + Toaster in root layout

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/components/ui/sonner.tsx`
- Read first: `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`

**Context:** Wire `next/font/google` for Inter (variable) + Geist Mono, exposing `--font-inter` / `--font-geist-mono` (the names referenced in Task 1's `@theme`). Add `next-themes` `ThemeProvider` with `attribute="class"`, `defaultTheme="dark"`, `enableSystem`, `disableTransitionOnChange`, so `.dark` is applied by default and a toggle can switch to light. Mount the Sonner `<Toaster>`. Keep the existing `TooltipProvider`.

- [ ] **Step 1: Read the Next 16 fonts doc** to confirm the `next/font/google` API for this version (variable fonts, `variable` option, `display`).

- [ ] **Step 2: Rewrite `src/app/layout.tsx`.**

```tsx
import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Shorts OS",
  description: "Creator co-pilot — from trending niche to publish-ready video.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${geistMono.variable}`}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <TooltipProvider delay={300}>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Re-theme `src/components/ui/sonner.tsx`** so toasts use our tokens (translucent surface, `--elev-2`, brand accent on action). Keep the `useTheme()` wiring. Set toast options via `toastOptions` / CSS vars: background `var(--surface-overlay)` with `backdrop-filter: var(--glass-blur)`, border `var(--border-subtle)`, text `var(--text-primary)`, radius `var(--radius-md)`, shadow `var(--elev-2)`. Invoke `vercel:shadcn` for the Sonner theming pattern.

- [ ] **Step 4: Verify.** `npm run build` → no errors. (Visual confirmation of fonts/theme happens in Task 14's sandbox.)

- [ ] **Step 5: Commit.** `git add src/app/layout.tsx src/components/ui/sonner.tsx && git commit -m "feat(plan-5): wire Inter+Geist Mono fonts, dark-default ThemeProvider, themed Toaster"`

---

### Task 3: Motion token module + base motion primitives

**Files:**
- Create: `src/lib/motion.ts`
- Test: `src/tests/lib/motion.test.ts`
- Create: `src/components/motion/page-transition.tsx`, `hover-lift.tsx`, `tappable.tsx`, `modal-motion.tsx`, `index.ts`

**Context:** One source of truth for motion, consumed by all components. Durations in **seconds** (Framer's unit). Spec: instant 0.1 / quick 0.2 / smooth 0.32 / slow 0.5; entry `ease-out`, state-change `cubic-bezier(0.4,0,0.2,1)`, delight spring `stiffness 400 damping 30`. Import Framer as `import { motion } from "motion/react"`.

- [ ] **Step 1: Write the failing test.**

```ts
// src/tests/lib/motion.test.ts
import { describe, it, expect } from "vitest";
import { DURATION, EASE, SPRING, fadeRise, modalScale } from "@/lib/motion";

describe("motion tokens", () => {
  it("exposes spec durations in seconds", () => {
    expect(DURATION.instant).toBe(0.1);
    expect(DURATION.quick).toBe(0.2);
    expect(DURATION.smooth).toBe(0.32);
    expect(DURATION.slow).toBe(0.5);
  });
  it("exposes the standard state-change cubic-bezier", () => {
    expect(EASE.standard).toEqual([0.4, 0, 0.2, 1]);
  });
  it("exposes the delight spring", () => {
    expect(SPRING).toMatchObject({ type: "spring", stiffness: 400, damping: 30 });
  });
  it("fadeRise animates opacity + small y with the smooth duration", () => {
    expect(fadeRise.initial).toEqual({ opacity: 0, y: 8 });
    expect(fadeRise.animate).toMatchObject({ opacity: 1, y: 0 });
  });
  it("modalScale uses scale+opacity for dialog content", () => {
    expect(modalScale.initial).toMatchObject({ opacity: 0, scale: 0.96 });
  });
});
```

- [ ] **Step 2: Run → FAIL** (`@/lib/motion` not found). `npx vitest run src/tests/lib/motion.test.ts`.

- [ ] **Step 3: Implement `src/lib/motion.ts`.**

```ts
import type { Transition, Variants } from "motion/react";

export const DURATION = {
  instant: 0.1,
  quick: 0.2,
  smooth: 0.32,
  slow: 0.5,
} as const;

export const EASE = {
  entry: [0, 0, 0.2, 1],
  standard: [0.4, 0, 0.2, 1],
} as const;

export const SPRING: Transition = { type: "spring", stiffness: 400, damping: 30 };

export const fadeRise = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.smooth, ease: EASE.entry } },
  exit: { opacity: 0, y: 8, transition: { duration: DURATION.quick, ease: EASE.standard } },
} satisfies Variants;

export const modalScale = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: DURATION.quick, ease: EASE.standard } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: DURATION.instant, ease: EASE.standard } },
} satisfies Variants;

export const hoverLift = {
  rest: { y: 0, boxShadow: "var(--elev-1)" },
  hover: { y: -2, boxShadow: "var(--elev-2)", transition: { duration: DURATION.quick, ease: EASE.standard } },
} satisfies Variants;
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Build the motion primitives** (invoke `frontend-design` + `ui-ux-pro-max`). All must read `prefers-reduced-motion` via Framer's `useReducedMotion()` and render statically when reduced. No bounce on incidental mount (`feedback_shadcn_is_the_floor.md` §6).
  - `page-transition.tsx` — `"use client"`; wraps children in `motion.div` with `fadeRise`; reduced-motion → plain `<div>`.
  - `hover-lift.tsx` — `motion.div` with `variants={hoverLift}` `initial="rest"` `whileHover="hover"`; `asChild`-style passthrough of className.
  - `tappable.tsx` — `whileTap={{ scale: 0.97 }}` press feedback wrapper (reduced-motion → no scale).
  - `modal-motion.tsx` — `motion.div` with `modalScale` + a backdrop variant fading a `backdrop-blur` overlay; intended to wrap shadcn Dialog/Sheet content.
  - `index.ts` — barrel export.

- [ ] **Step 6: Typecheck.** `npx tsc --noEmit` → no errors.

- [ ] **Step 7: Commit.** `git add src/lib/motion.ts src/tests/lib/motion.test.ts src/components/motion && git commit -m "feat(plan-5): motion tokens + base motion primitives (reduced-motion aware)"`

---

### Task 4: Install missing shadcn primitives + TanStack data-table

**Files:**
- Create (via CLI): `src/components/ui/{textarea,select,combobox,command,popover,avatar,progress,skeleton,separator,accordion,radio-group,switch,slider,calendar,table}.tsx`
- Create: `src/components/ui/data-table.tsx`
- Modify: `package.json` + lockfile

**Context:** Operator-gated installs — the implementer drives the CLI via Bash. `base-nova` style pulls Base UI / cmdk / react-day-picker as needed. Primitives inherit our look automatically (they consume the semantic tokens remapped in Task 1). Invoke `vercel:shadcn` for the current CLI invocation + data-table pattern.

- [ ] **Step 1: Install primitives.** Run (one component per add is safest with base-nova; or batch):

```bash
npx shadcn@latest add textarea select combobox command popover avatar progress skeleton separator accordion radio-group switch slider calendar table
```

Accept any peer-dep installs it proposes (cmdk, react-day-picker). If it prompts to overwrite an existing file, **decline** for already-customized files.

- [ ] **Step 2: Install TanStack Table.** `npm install @tanstack/react-table`.

- [ ] **Step 3: Build `src/components/ui/data-table.tsx`** — a generic, typed wrapper over `@tanstack/react-table` + the shadcn `table` primitive. Signature:

```ts
export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyState?: React.ReactNode; // defaults to <EmptyState> once Task 12 lands; for now a tokenized placeholder
}
export function DataTable<TData, TValue>(props: DataTableProps<TData, TValue>): React.JSX.Element;
```

Use `useReactTable` + `getCoreRowModel`. Header/row styling via our tokens (subtle borders, `surface-1` header, hover `muted`). No `any` — generics throughout. (Empty-state wiring to the `EmptyState` composition is finalized in Task 12; for now render a minimal tokenized "No rows" placeholder so this compiles standalone.)

- [ ] **Step 4: Verify each file exists + typechecks.** `ls src/components/ui` shows all 15 + `data-table.tsx`; `npx tsc --noEmit` clean.

- [ ] **Step 5: Verify nothing regressed.** `npm run build`.

- [ ] **Step 6: Commit.** `git add src/components/ui package.json package-lock.json && git commit -m "feat(plan-5): install remaining shadcn primitives + TanStack DataTable wrapper"`

---

### Task 5: Badge logic + state-badge compositions

**Files:**
- Create: `src/lib/design/badges.ts`
- Test: `src/tests/lib/design/badges.test.ts`
- Create: `src/components/compositions/{assistant-status-dot,outlier-badge,discovery-state-badge,production-fit-badge,proven-band-badge,keyboard-shortcut-hint}.tsx`

**Context:** All five badges + the status dot are thin views over pure mapping functions. Test the mappings; render via shadcn `Badge`. Design-layer unions are owned here (Sub-A columns are `string`).

- [ ] **Step 1: Write failing tests** for the mapping module.

```ts
// src/tests/lib/design/badges.test.ts
import { describe, it, expect } from "vitest";
import {
  discoveryStateBadge, provenBandBadge, productionFitBadge,
  outlierTier, assistantStatusTone,
} from "@/lib/design/badges";

describe("discoveryStateBadge", () => {
  it("maps each known state to a tone + label", () => {
    expect(discoveryStateBadge("discovered")).toEqual({ label: "Discovered", tone: "accent" });
    expect(discoveryStateBadge("emerging")).toEqual({ label: "Emerging", tone: "warning" });
    expect(discoveryStateBadge("validated")).toEqual({ label: "Validated", tone: "success" });
    expect(discoveryStateBadge("saturated")).toEqual({ label: "Saturated", tone: "muted" });
  });
  it("falls back gracefully for unknown strings", () => {
    expect(discoveryStateBadge("???")).toEqual({ label: "Unknown", tone: "muted" });
  });
});

describe("provenBandBadge", () => {
  it("labels proven bands", () => {
    expect(provenBandBadge("proven").label).toBe("Proven");
    expect(provenBandBadge("first_mover").label).toBe("First-mover");
  });
});

describe("productionFitBadge", () => {
  it("maps fit categories to tone", () => {
    expect(productionFitBadge("high").tone).toBe("success");
    expect(productionFitBadge("medium").tone).toBe("warning");
    expect(productionFitBadge("low").tone).toBe("danger");
  });
});

describe("outlierTier", () => {
  it("buckets an outlier multiplier into a tier", () => {
    expect(outlierTier(1.2)).toBe("none");
    expect(outlierTier(3)).toBe("strong");
    expect(outlierTier(10)).toBe("extreme");
  });
});

describe("assistantStatusTone", () => {
  it("maps status to a tone", () => {
    expect(assistantStatusTone("idle")).toBe("muted");
    expect(assistantStatusTone("working")).toBe("accent");
    expect(assistantStatusTone("waiting")).toBe("warning");
    expect(assistantStatusTone("errored")).toBe("danger");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `src/lib/design/badges.ts`.**

```ts
export type Tone = "accent" | "success" | "warning" | "danger" | "muted";
export interface BadgeSpec { label: string; tone: Tone; }

export type DiscoveryState = "discovered" | "emerging" | "validated" | "saturated";
const DISCOVERY: Record<DiscoveryState, BadgeSpec> = {
  discovered: { label: "Discovered", tone: "accent" },
  emerging: { label: "Emerging", tone: "warning" },
  validated: { label: "Validated", tone: "success" },
  saturated: { label: "Saturated", tone: "muted" },
};
export function discoveryStateBadge(state: string): BadgeSpec {
  return DISCOVERY[state as DiscoveryState] ?? { label: "Unknown", tone: "muted" };
}

export type ProvenBand = "proven" | "first_mover" | "mixed";
const PROVEN: Record<ProvenBand, BadgeSpec> = {
  proven: { label: "Proven", tone: "success" },
  first_mover: { label: "First-mover", tone: "accent" },
  mixed: { label: "Mixed", tone: "muted" },
};
export function provenBandBadge(band: string): BadgeSpec {
  return PROVEN[band as ProvenBand] ?? { label: "Unknown", tone: "muted" };
}

export type ProductionFit = "high" | "medium" | "low";
const FIT: Record<ProductionFit, BadgeSpec> = {
  high: { label: "High fit", tone: "success" },
  medium: { label: "Medium fit", tone: "warning" },
  low: { label: "Low fit", tone: "danger" },
};
export function productionFitBadge(fit: string): BadgeSpec {
  return FIT[fit as ProductionFit] ?? { label: "Unknown fit", tone: "muted" };
}

export type OutlierTier = "none" | "mild" | "strong" | "extreme";
export function outlierTier(multiplier: number): OutlierTier {
  if (multiplier >= 5) return "extreme";
  if (multiplier >= 2.5) return "strong";
  if (multiplier >= 1.5) return "mild";
  return "none";
}

export type AssistantStatus = "idle" | "working" | "waiting" | "errored";
export function assistantStatusTone(status: AssistantStatus): Tone {
  const map: Record<AssistantStatus, Tone> = {
    idle: "muted", working: "accent", waiting: "warning", errored: "danger",
  };
  return map[status];
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Build the badge components** (invoke `frontend-design` + `ui-ux-pro-max`). Each consumes the mapping + renders shadcn `Badge` with a tokenized tone style (a small `tone → className` map: `accent → bg-accent-muted text-accent`, `success → bg-success/15 text-success`, etc.). Lucide icons (1.5px stroke) where the spec implies one.
  - `outlier-badge.tsx` — prop `multiplier: number`; shows e.g. "3.2× outlier" with tier color; `none` tier renders nothing.
  - `discovery-state-badge.tsx`, `production-fit-badge.tsx`, `proven-band-badge.tsx` — prop is the raw `string`; render `Badge` from the spec.
  - `assistant-status-dot.tsx` — prop `status: AssistantStatus`; a colored dot; `working` pulses (CSS `animate-pulse`, reduced-motion safe); optional label.
  - `keyboard-shortcut-hint.tsx` — prop `keys: string[]` (e.g. `["⌘","K"]`); renders `<kbd>` chips styled with `surface-2` + `border-subtle` + mono font + `text-tertiary`. Uses `formatShortcut` from Task 6 if helpful (or inline).

- [ ] **Step 6: Typecheck.** `npx tsc --noEmit`.

- [ ] **Step 7: Commit.** `git add src/lib/design/badges.ts src/tests/lib/design/badges.test.ts src/components/compositions && git commit -m "feat(plan-5): badge mapping logic + state-badge compositions"`

---

### Task 6: Number/shortcut formatting + sparkline math + VelocitySparkline

**Files:**
- Create: `src/lib/design/format.ts`, `src/lib/design/sparkline.ts`
- Test: `src/tests/lib/design/format.test.ts`, `src/tests/lib/design/sparkline.test.ts`
- Create: `src/components/compositions/velocity-sparkline.tsx`

- [ ] **Step 1: Write failing tests.**

```ts
// src/tests/lib/design/format.test.ts
import { describe, it, expect } from "vitest";
import { formatCompactNumber, formatVelocity, formatShortcut } from "@/lib/design/format";

describe("formatCompactNumber", () => {
  it("compacts thousands/millions", () => {
    expect(formatCompactNumber(950)).toBe("950");
    expect(formatCompactNumber(12345)).toBe("12.3K");
    expect(formatCompactNumber(1_500_000)).toBe("1.5M");
  });
  it("handles zero and negatives", () => {
    expect(formatCompactNumber(0)).toBe("0");
    expect(formatCompactNumber(-2400)).toBe("-2.4K");
  });
});

describe("formatVelocity", () => {
  it("appends a per-window unit", () => {
    expect(formatVelocity(12345, "24h")).toBe("12.3K / 24h");
  });
});

describe("formatShortcut", () => {
  it("joins keys with no separator (kbd chips render spacing)", () => {
    expect(formatShortcut(["⌘", "K"])).toBe("⌘K");
  });
});
```

```ts
// src/tests/lib/design/sparkline.test.ts
import { describe, it, expect } from "vitest";
import { buildSparklinePath, sparklineTrend } from "@/lib/design/sparkline";

describe("buildSparklinePath", () => {
  it("returns empty string for <2 points", () => {
    expect(buildSparklinePath([], 100, 24)).toBe("");
    expect(buildSparklinePath([5], 100, 24)).toBe("");
  });
  it("starts with a moveto and spans the width", () => {
    const d = buildSparklinePath([0, 5, 10], 100, 24);
    expect(d.startsWith("M0")).toBe(true);
    expect(d).toContain("L100"); // last x === width
  });
  it("flat series maps to the vertical midpoint", () => {
    const d = buildSparklinePath([4, 4, 4], 100, 24);
    expect(d).toContain("12"); // h/2
  });
});

describe("sparklineTrend", () => {
  it("classifies direction from first vs last", () => {
    expect(sparklineTrend([1, 2, 5])).toBe("up");
    expect(sparklineTrend([5, 2, 1])).toBe("down");
    expect(sparklineTrend([3, 3, 3])).toBe("flat");
  });
});
```

- [ ] **Step 2: Run both → FAIL.**

- [ ] **Step 3: Implement `format.ts` and `sparkline.ts`.**

```ts
// src/lib/design/format.ts
export function formatCompactNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
    .format(n)
    .replace(/ /g, ""); // strip narrow nbsp some ICU builds insert
}
export function formatVelocity(n: number, window: string): string {
  return `${formatCompactNumber(n)} / ${window}`;
}
export function formatShortcut(keys: string[]): string {
  return keys.join("");
}
```

```ts
// src/lib/design/sparkline.ts
export type Trend = "up" | "down" | "flat";

export function buildSparklinePath(values: number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  return values
    .map((v, i) => {
      const x = Math.round(i * stepX);
      const y = max === min ? height / 2 : Math.round(height - ((v - min) / range) * height);
      return `${i === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
}

export function sparklineTrend(values: number[]): Trend {
  if (values.length < 2) return "flat";
  const first = values[0];
  const last = values[values.length - 1];
  if (last > first) return "up";
  if (last < first) return "down";
  return "flat";
}
```

> Note: the flat-series test expects the substring `12` (h/2 for height 24). The `max === min` branch yields `height/2 = 12`. ✓

- [ ] **Step 4: Run both → PASS.**

- [ ] **Step 5: Build `velocity-sparkline.tsx`** (invoke `frontend-design`). Props: `values: number[]`, `width?` (default 96), `height?` (default 24), `showArea?`. Renders an inline `<svg>` with the path; stroke color from `sparklineTrend` (`up → success`, `down → danger`, `flat → text-tertiary`); optional faint area fill (`fill` with low-opacity currentColor). Pure SVG — no chart lib. Reduced-motion: no animated draw-in (or a one-shot `pathLength` reveal gated on motion-OK).

- [ ] **Step 6: Typecheck.** `npx tsc --noEmit`.

- [ ] **Step 7: Commit.** `git add src/lib/design/format.ts src/lib/design/sparkline.ts src/tests/lib/design/format.test.ts src/tests/lib/design/sparkline.test.ts src/components/compositions/velocity-sparkline.tsx && git commit -m "feat(plan-5): number/shortcut formatters + sparkline math + VelocitySparkline"`

---

### Task 7: Layout primitives — AppShell, translucent Sidebar, PageHeader, ThemeToggle

**Files:**
- Create: `src/components/layout/{app-shell,sidebar,page-header,theme-toggle,index}.tsx`

**Context:** The persistent shell every Plan #5 page renders inside. Spec §4.7: left sidebar 260px collapsible to 64px icon-only, translucent (`backdrop-filter: var(--glass-blur)`, `surface-overlay` bg); **no top bar**; content max-width 1280px, padding `8` (32px). Invoke `frontend-design` + `ui-ux-pro-max`.

- [ ] **Step 1: Build `sidebar.tsx`** (`"use client"`).
  - Width 260px expanded / 64px collapsed; collapse state persisted to `localStorage` (`shorts-os.sidebar.collapsed`), hydration-safe.
  - `surface-overlay` background + `var(--glass-blur)` + right `border-subtle`.
  - Props: `items: { href: string; label: string; icon: LucideIcon }[]`, `activeHref?: string`.
  - Active item: `accent-muted` bg + `accent` text + left accent bar. Hover: `muted`. Lucide icons 1.5px.
  - Collapse toggle button (chevron) at the bottom; tooltips (shadcn `Tooltip`) show labels when collapsed.
  - Width transition uses `--duration-quick` + `--ease-standard` (CSS), reduced-motion safe.
- [ ] **Step 2: Build `app-shell.tsx`** — flex row: `<Sidebar/>` + `<main>` with `max-w-[1280px] mx-auto px-8 py-8`. Accepts `sidebar` + `children`. No top bar.
- [ ] **Step 3: Build `page-header.tsx`** — in-content header: `title` (text-2xl/600), optional `description` (text-secondary), optional `breadcrumbs` + `actions` slot (right-aligned). Generous bottom margin (section gap).
- [ ] **Step 4: Build `theme-toggle.tsx`** (`"use client"`) — `useTheme()` from next-themes; icon button (Sun/Moon Lucide) toggling dark/light; mounted-guard to avoid hydration mismatch. Lives in the sidebar footer.
- [ ] **Step 5: `index.ts` barrel.**
- [ ] **Step 6: Typecheck + build.** `npx tsc --noEmit && npm run build`.
- [ ] **Step 7: Commit.** `git add src/components/layout && git commit -m "feat(plan-5): layout primitives — AppShell, translucent collapsible Sidebar, PageHeader, ThemeToggle"`

---

### Task 8: Command palette (Cmd+K)

**Files:**
- Create: `src/components/layout/command-palette.tsx`, `src/components/layout/use-command-palette.ts`
- Modify: `src/components/layout/index.ts`

**Context:** Global Cmd+K palette built on the shadcn `command` primitive (Task 4). Spec §4.7/§4.9: navigation + quick actions + search across niches/videos/channels/agents. In this sub-phase it's wired with a **static command registry passed as props** (real search is wired by consuming sub-phases). Invoke `vercel:shadcn` + `frontend-design`.

- [ ] **Step 1: Build `use-command-palette.ts`** (`"use client"`) — a hook that owns open state and registers a global `keydown` listener for `(meta|ctrl)+k` (preventDefault), plus `Escape` to close. Returns `{ open, setOpen, toggle }`. Clean up the listener on unmount.
- [ ] **Step 2: Build `command-palette.tsx`** (`"use client"`) — shadcn `CommandDialog` with translucent surface (`surface-overlay` + `var(--glass-blur)`) + `modalScale` motion (from Task 3). Props: `groups: { heading: string; items: { id: string; label: string; icon?: LucideIcon; shortcut?: string[]; onSelect: () => void }[] }[]`. Renders `CommandInput`, grouped `CommandItem`s, `KeyboardShortcutHint` per item, and an empty state ("No results").
- [ ] **Step 3: Export from barrel.**
- [ ] **Step 4: Typecheck + build.**
- [ ] **Step 5: Commit.** `git add src/components/layout && git commit -m "feat(plan-5): global Cmd+K command palette + use-command-palette hook"`

---

### Task 9: AssistantCard + AssistantStatusDot integration + MissionControlGrid

**Files:**
- Create: `src/components/compositions/{assistant-card,mission-control-grid}.tsx`
- Modify: `src/components/compositions/index.ts`

**Context:** Spec §4.8. `AssistantCard`: icon + display name + 1-line role (top); `AssistantStatusDot` + current-activity 1-line (middle); latest 3 activity-log entries truncated (bottom); disabled variant shows a "Coming in Phase N" pill. Code identifier `Assistant*`; **display text says "Agent"** per product vision. Invoke `frontend-design` + `ui-ux-pro-max`.

- [ ] **Step 1: Define the props interface** (design-layer, decoupled from DB):

```ts
import type { AssistantStatus } from "@/lib/design/badges";
import type { LucideIcon } from "lucide-react";

export interface AssistantCardProps {
  icon: LucideIcon;
  name: string;
  role: string;
  status: AssistantStatus;
  activitySummary?: string;
  recentActivity?: { id: string; summary: string; at: string }[]; // newest first, render up to 3
  disabled?: boolean;
  comingInPhase?: number; // shown when disabled
  onOpen?: () => void;
}
```

- [ ] **Step 2: Build `assistant-card.tsx`** — shadcn `Card` wrapped in `HoverLift` (enabled state). Header row: icon in an `accent-muted` rounded tile + name (text-base/600) + role (text-secondary, truncate). Middle: `AssistantStatusDot` + activity summary (truncate). Footer: up to 3 `recentActivity` entries (text-tertiary, truncate, mono timestamps via `Geist Mono`). Disabled: dimmed (`opacity-60`), no hover lift, a `Badge` "Coming in Phase {comingInPhase}". Whole card clickable (`onOpen`) when enabled — wrap interactive area in `Tappable`.
- [ ] **Step 3: Build `mission-control-grid.tsx`** — responsive grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` with `gap-6`; renders `children` (the 6 `AssistantCard`s). Just the layout wrapper (the Mission Control *page* is a later sub-phase).
- [ ] **Step 4: Export from barrel + typecheck.**
- [ ] **Step 5: Commit.** `git add src/components/compositions && git commit -m "feat(plan-5): AssistantCard + MissionControlGrid compositions"`

---

### Task 10: NicheCard

**Files:**
- Create: `src/components/compositions/niche-card.tsx`
- Modify: `src/components/compositions/index.ts`

**Context:** The flagship composition — proves the "composition layer is where the product lives" bar (`feedback_shadcn_is_the_floor.md` §4). Spec §4.7: Card + sparkline + outlier badge + discovery-state pill + production-fit chip. Invoke `frontend-design` + `ui-ux-pro-max`.

- [ ] **Step 1: Define props** (design-layer):

```ts
export interface NicheCardProps {
  title: string;
  summary?: string;
  velocityValues: number[];       // → VelocitySparkline
  velocityLabel?: string;         // e.g. formatVelocity(...)
  outlierMultiplier?: number;     // → OutlierBadge
  discoveryState: string;         // → DiscoveryStateBadge
  productionFit: string;          // → ProductionFitBadge
  provenBand?: string;            // → ProvenBandBadge
  onOpen?: () => void;
}
```

- [ ] **Step 2: Build `niche-card.tsx`** — `Card` in `HoverLift`. Top row: title (text-lg/600, truncate) + `ProvenBandBadge`. Summary line (text-secondary, 2-line clamp). A row of pills: `DiscoveryStateBadge` + `ProductionFitBadge` + `OutlierBadge`. Bottom: `VelocitySparkline` + `velocityLabel` (mono, text-tertiary). Clickable via `Tappable` when `onOpen`. All spacing/tokens from the system — no hardcoded hex.
- [ ] **Step 3: Export from barrel + typecheck.**
- [ ] **Step 4: Commit.** `git add src/components/compositions && git commit -m "feat(plan-5): NicheCard composition"`

---

### Task 11: ReviewScorecard + ReviewSuggestionItem

**Files:**
- Create: `src/components/compositions/{review-scorecard,review-suggestion-item}.tsx`
- Modify: `src/components/compositions/index.ts`

**Context:** Spec §4.7/§4.11. The pre-pub QA surface. `video_reviews` has per-dimension verdicts (`hook_verdict`, `title_verdict`, `thumbnail_verdict`, `pacing_verdict`, `audio_verdict`, `visual_verdict`, `description_seo_verdict`, `overall_verdict`) + `suggestions: Json`; `video_review_feedback` tracks accept/ignore per `suggestion_index`. Design-layer props own narrowed unions. Invoke `frontend-design` + `ui-ux-pro-max`.

- [ ] **Step 1: Define props** (design-layer):

```ts
export type Verdict = "pass" | "warn" | "fail";
export interface ReviewDimension { key: string; label: string; verdict: Verdict; note?: string; }
export interface ReviewScorecardProps {
  overallVerdict: Verdict;
  overallScore?: number;          // 0–100, optional ring
  dimensions: ReviewDimension[];
}
export type SuggestionStatus = "open" | "accepted" | "ignored";
export interface ReviewSuggestionItemProps {
  index: number;
  text: string;
  status: SuggestionStatus;
  onAccept?: (index: number) => void;
  onIgnore?: (index: number) => void;
}
```

- [ ] **Step 2: Build `review-scorecard.tsx`** — header with overall verdict pill (`pass→success`, `warn→warning`, `fail→danger`) + optional score ring (SVG circle, accent stroke). Per-dimension list: label + a verdict pill + optional `Progress` bar / note. Tokenized throughout.
- [ ] **Step 3: Build `review-suggestion-item.tsx`** — suggestion text + two `Button`s (Accept = `default`, Ignore = `ghost`) using `Tappable`; `accepted`/`ignored` states show a status `Badge` and dim the actions. Optimistic-friendly (callbacks only; no fetch here).
- [ ] **Step 4: Export from barrel + typecheck.**
- [ ] **Step 5: Commit.** `git add src/components/compositions && git commit -m "feat(plan-5): ReviewScorecard + ReviewSuggestionItem compositions"`

---

### Task 12: EmptyState + wire DataTable empty state

**Files:**
- Create: `src/components/compositions/empty-state.tsx`
- Modify: `src/components/compositions/index.ts`, `src/components/ui/data-table.tsx`

**Context:** Spec §4.7: every list/table/panel gets a designed empty state — line illustration + one-line copy + one primary CTA (`feedback_shadcn_is_the_floor.md` §5; product vision "no bare 0 results"). Invoke `frontend-design` + `ui-ux-pro-max`.

- [ ] **Step 1: Build `empty-state.tsx`** — centered column: an `icon: LucideIcon` (or `illustration?: ReactNode`) in a subtle `surface-2` circle, a `title`, a one-line `description` (text-secondary), and an optional primary CTA (`action?: { label: string; onClick: () => void }`). Generous vertical padding. Props:

```ts
export interface EmptyStateProps {
  icon?: LucideIcon;
  illustration?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}
```

- [ ] **Step 2: Wire it into `DataTable`** — replace the Task 4 placeholder so `emptyState` defaults to `<EmptyState title="No rows yet" .../>` and renders when `data.length === 0`.
- [ ] **Step 3: Export from barrel + typecheck + build.**
- [ ] **Step 4: Commit.** `git add src/components/compositions src/components/ui/data-table.tsx && git commit -m "feat(plan-5): EmptyState composition + DataTable empty-state wiring"`

---

### Task 13: Sandbox showcase route `/sandbox/components`

**Files:**
- Create: `src/app/sandbox/components/page.tsx` (+ `src/app/sandbox/components/sandbox-client.tsx` for the interactive bits)

**Context:** The single visual-review surface for this sub-phase — every primitive + composition in every state, with a dark/light toggle. **Throwaway: delete in Sub-phase J.** Mark it with a top-of-file comment. Wrap content in `AppShell` so the sidebar + Cmd+K palette are exercised too. Invoke `frontend-design` to lay it out cleanly (sectioned, labeled).

- [ ] **Step 1: Build the route.** Sections, each in a `PageHeader`-labeled block:
  1. **Tokens** — swatches for every brand color (light+dark via the toggle), type-scale specimens (xs→4xl), elevation cards (elev-1/2/3), radii samples.
  2. **Primitives** — Button (all variants/sizes incl. loading/disabled), Input/Textarea/Select/Combobox, Switch/RadioGroup/Slider, Tabs, Accordion, Dialog/Sheet/Popover/Tooltip/DropdownMenu (open them), Avatar, Badge, Progress, **Skeleton** (a shimmering card matching a real layout), Separator, ScrollArea, Calendar, **DataTable** (with rows + an empty-table example), Sonner (a "Show toast" button).
  3. **Motion** — buttons triggering `PageTransition`, `HoverLift` cards, `Tappable`, a `ModalMotion` dialog. A note that reduced-motion disables them.
  4. **Compositions** — `NicheCard` (×3 varied states), `AssistantCard` (enabled + working + errored + disabled "Coming in Phase 3"), `MissionControlGrid` of 6, `ReviewScorecard` + `ReviewSuggestionItem` list, all five badges + `AssistantStatusDot` + `KeyboardShortcutHint`, `VelocitySparkline` (up/down/flat), `EmptyState`.
  5. **Command palette** — a button to open it + the global Cmd+K hint.
- [ ] **Step 2: Typecheck + build.** `npx tsc --noEmit && npm run build`.
- [ ] **Step 3: Visual smoke (the real gate).** Start the dev server (per `feedback_anthropic_base_url_local.md`, ensure `ANTHROPIC_BASE_URL` is unset in the shell), open `/sandbox/components`, and verify against `feedback_shadcn_is_the_floor.md`: theming applied (no default-shadcn gray, system-blue accent present), motion calm (no incidental bounce), translucent sidebar + Cmd+K work, every composition uses the design tokens, dark↔light toggle is clean, skeletons (not spinners) for loading, every list has a designed empty state. Capture a screenshot for the PR.
- [ ] **Step 4: Commit.** `git add src/app/sandbox && git commit -m "feat(plan-5): /sandbox/components design-system showcase (throwaway — remove in Sub-phase J)"`

---

### Task 14: Full-suite green + PR

- [ ] **Step 1: Run the whole test suite.** `npm test` → all new logic tests pass; baseline 334 passing / 11 pre-existing env-dependent failures unchanged (no new failures).
- [ ] **Step 2: Typecheck + build clean.** `npx tsc --noEmit && npm run build`.
- [ ] **Step 3: Confirm old pages still render** (no crash) at `/`, `/lab`, `/clips` in the dev server — visual drift OK, errors not.
- [ ] **Step 4: Open the PR** against `main` with the screenshot, the token/skill summary, and a checklist mapping each spec §4.7 requirement to its task. Title: `Plan #5 Phase 1 Sub-phase B — Design System Foundation`.
- [ ] **Step 5: Write the Sub-phase C handoff note** at `docs/superpowers/notes/2026-05-28-plan-5-phase-1-sub-b-handoff.md` (what shipped, where components live, the `Assistant*`-vs-display-"Agent" naming, that `/sandbox/components` is throwaway, and the Sub-phase C kickoff prompt) — per `feedback_phase_boundary_handoff.md`.

---

## Self-Review (spec §4.7 coverage)

| Spec §4.7 requirement | Task |
|---|---|
| Typography (Inter var + Geist Mono, scale, weights, line-heights) | 1 (scale/line-heights), 2 (fonts) |
| Color dark default + light mirror | 1 |
| Spacing / radii / elevation / translucency | 1 |
| Motion (durations, curves, springs, Framer + reduced-motion) | 1 (tokens in CSS), 3 (JS tokens + primitives) |
| Skeleton loaders (no spinners) | 4 (primitive) + 13 (shimmer demo) |
| shadcn primitives installed + themed | 1 (theming via tokens), 4 (install) |
| Lucide icons | used throughout (5, 7, 9–13) |
| Data viz: custom SVG sparkline | 6 |
| Layout: translucent collapsible sidebar, no top bar, content max-w 1280 / pad 8 | 7 |
| Command palette (Cmd+K) | 8 |
| Empty states | 12 |
| Compositions: NicheCard | 10 |
| VelocitySparkline / OutlierBadge / DiscoveryStateBadge / ProductionFitBadge / ProvenBandBadge | 5, 6 |
| AssistantCard / AssistantStatusDot / MissionControlGrid | 5 (dot), 9 |
| ReviewScorecard / ReviewSuggestionItem | 11 |
| EmptyState / KeyboardShortcutHint | 5 (hint), 12 (empty) |
| Sonner toasts themed | 2 |
| Old pages keep building (legacy preserved) | 1, 14 |

**Out of scope (deferred to consuming sub-phases, per kickoff's reduced list):** `NicheDetailHeader`, `ChannelWatchListItem`, `AgentChatThread`, `DigestEmailPreview`, Recharts detail charts, real Cmd+K search data, the Mission Control *page*, and rebuilding `/lab`/`/clips`/cockpit.

**Naming note carried into every component task:** code identifier `Assistant*`; user-facing display text "Agent".
