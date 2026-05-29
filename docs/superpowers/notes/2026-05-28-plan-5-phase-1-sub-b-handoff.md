# Plan #5 Phase 1 Sub-phase B — handoff (2026-05-28)

PR: https://github.com/dariusraphael97-beep/shorts-os/pull/14

Branch: `plan-5-phase-1-sub-b`. Foundation only — no product pages, nothing user-visible changes for end users after merge (the one route added is a throwaway showcase).

## What Sub-phase B ships

The premium design-system foundation that Sub-phases C–J consume. Apple-system + Notion-calm, **dark by default** with a light mirror, Apple system-blue accent (`#0a84ff` dark / `#007aff` light).

- **Tokens** — `src/app/globals.css`: typography scale, dark+light color sets, spacing/radii/elevation, motion durations+curves, translucency. All CSS vars.
- **Fonts + providers** — `src/app/layout.tsx`: Inter (var) + Geist Mono, `next-themes` dark-default `ThemeProvider`, global `TooltipProvider`, themed Sonner `Toaster`. (Consumers do NOT re-mount these.)
- **Motion** — `src/components/motion/`: `PageTransition`, `HoverLift`, `Tappable`, `ModalMotion`. Imported via `motion/react`. All `prefers-reduced-motion` aware. JS variants in `src/lib/motion.ts`.
- **shadcn primitives** (Base UI, **not** Radix) themed to tokens — `src/components/ui/`: accordion, avatar, calendar, combobox, command, popover, progress, radio-group, select, separator, skeleton, slider, switch, table, textarea, plus a TanStack-table `DataTable` wrapper. (button/card/dialog/sheet/badge/input/label/tabs/tooltip/dropdown-menu/scroll-area already existed.)
- **Layout** — `src/components/layout/`: `AppShell` (no top bar; content `mx-auto max-w-[1280px] px-8 py-8`), translucent collapsible `Sidebar` (localStorage-persisted, hydration-safe), `PageHeader`, `ThemeToggle`, global Cmd+K `CommandPalette` + `useCommandPalette` hook. Barrel at `src/components/layout/index.ts`.
- **Compositions** — `src/components/compositions/` (barrel `index.ts`): `NicheCard`, `AssistantCard`, `AssistantStatusDot`, `MissionControlGrid`, `ReviewScorecard`, `ReviewSuggestionItem`, `VelocitySparkline` (custom SVG), `OutlierBadge`, `DiscoveryStateBadge`, `ProductionFitBadge`, `ProvenBandBadge`, `ToneBadge`, `EmptyState`, `KeyboardShortcutHint`.
- **Design logic** — `src/lib/design/`: `badges.ts` (state→tone+label mapping + `AssistantStatus`/`DiscoveryState`/`ProductionFit`/`ProvenBand`/`OutlierTier` types), `format.ts` (compact number + shortcut formatters), `sparkline.ts` (path math + trend).

## Where things live (quick map for consumers)

- Tokens: use Tailwind arbitrary values like `bg-[var(--surface-1)]`, `text-[var(--text-secondary)]`, `border-[var(--border-subtle)]`. Accent = `var(--accent)`.
- Import compositions/layout/motion from their barrels: `@/components/compositions`, `@/components/layout`, `@/components/motion`. (Within the compositions barrel members, import sibling compositions by direct path to avoid self-referential barrel imports.)
- Badge tone/label logic is centralized in `@/lib/design/badges` — pass raw DB strings; the helpers map to `BadgeSpec`.

## Naming decision (carries forward)

Product personas are `Assistant*` in code + DB (the `assistants` table, to avoid collision with Plan #4's pipeline `agents` table) but display as **"Agent"** in user-facing UI. `AssistantCard`/`AssistantStatusDot` render "Agent" text.

## Throwaway

`src/app/sandbox/components/` (page + client island) is the single visual-review surface — every primitive, motion helper, and composition in every state. **Delete it in Sub-phase J.** Both files carry a top-of-file throwaway comment.

## Verification state

- `npx tsc --noEmit`: clean. (Also fixed a pre-existing union-narrowing type error in `src/tests/lib/auth/session.test.ts` that was making tsc red.)
- `npm test`: 359 passing (334 baseline + 25 new design-system logic tests). The 11 failing tests are pre-existing env-gated integration tests (Supabase / AI gateway / env loader) that need real secrets the runner doesn't load — unchanged from `main`, no new failures.
- Visual smoke (the real 9/10 gate) is the PR's open checklist — pending Darius's eyeball on the running `/sandbox/components`. (Not auto-screenshotted: the route is behind cockpit auth, and forging a session was correctly disallowed; the human eyeball is the stronger gate for premium feel anyway.)

## Next: Sub-phase C — Multi-source ingestion (~7–10 days)

YouTube category sweep + targeted Shorts search, watch-list velocity snapshots, channel-stat enrichment, Reddit topic-discovery, Google Trends, TikTok Creative Center. Writes into the Sub-phase A schema (`shorts_observations`, `video_velocity_snapshots`, `watched_channels`, etc.) via the existing repository helpers. This is the first sub-phase that adds crons + API routes.

**Carry-forward constraint:** Reddit OAuth is deferred indefinitely (their "create app" form has failed repeatedly across browsers). Ship **cookies-only manual-URL ingest** for Reddit instead of an OAuth flow.

## Fresh-chat kickoff prompt for Sub-phase C

(See the chat hand-back — paste it into a new chat after this PR merges.)
