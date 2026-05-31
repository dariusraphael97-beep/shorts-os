# Plan #5 Phase 1 Sub-phase F Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Sub-phase F — premium first-run onboarding, legacy-page shell unification onto the design-system `AppShell`, and the four deferred admin analysis pages (2 real, 2 honest stubs).

**Architecture:** Shell first (reconcile `AppShell` with a `bare` variant + prefix-aware sidebar active state, migrate 5 legacy pages off `CockpitShell`, retire it). Then onboarding (one `channels` migration for goals/interests/completion flag; a focused `/onboarding` wizard guarded by `/`; lightweight fire-and-forget scan on finish). Then admin (expand `AdminSidebar`; build scoring-analysis + moat-validation against real data, gate costs + prompt-versions honestly).

**Tech Stack:** Next.js (App Router, this fork — read `node_modules/next/dist/docs/` before Next code), TypeScript strict (no `any`), Supabase (service client, untyped `.from()`), Vitest, Tailwind + design-system tokens, shadcn/ui, Framer Motion, Recharts. Premium UI built with the frontend-design + ui-ux-pro-max + shadcn skills.

**Spec:** `docs/superpowers/specs/2026-05-30-plan-5-phase-1-sub-f-design.md`.

**Hard rules (carry-forward):**
- TS strict, no `any` in source. This is NOT the Next.js you know — read the bundled docs before writing route/page code.
- Premium UI bar is 9/10 (Linear/Vercel/Raycast feel). Every surface: real tokens, motion, designed empty/loading/skip states. Lead with the ONE thing.
- Prod migrations are operator-gated — name the target (`jfmjppzjicvbpnlkmxbg`) in chat and get explicit OK before `apply_migration`.
- Local `npm run dev` needs `env -u ANTHROPIC_BASE_URL`. Local pages 500 with blank `.env.local` — UI verification runs on the Vercel preview.
- Baseline to hold throughout: `npx tsc --noEmit` clean; `npx vitest run` = 493 pass / 11 pre-existing env-gated fails (no NEW failures); `env -u ANTHROPIC_BASE_URL npm run build` passes.

---

## File-structure map

**Thread 1 — shell**
- Modify `src/components/layout/app-shell.tsx` — add `bare?: boolean`.
- Create `src/components/layout/sidebar-active.ts` — pure `resolveActiveHref(pathname, hrefs)`.
- Create `src/tests/components/sidebar-active.test.ts` — its unit test.
- Modify `src/components/layout/sidebar.tsx` — use `resolveActiveHref` for active state.
- Modify `src/components/layout/app-sidebar.tsx` — optional `activeHref`, default `usePathname()`; Settings href → `/settings`.
- Create `src/app/settings/page.tsx` — redirect to `/settings/niche-finder`.
- Modify `src/app/mission-control/page.tsx`, `src/app/lab/page.tsx`, `src/app/lab/drafts/page.tsx`, `src/app/clips/page.tsx`, `src/app/settings/channel/page.tsx` — `CockpitShell` → `AppShell bare`.
- Delete `src/components/cockpit/cockpit-shell.tsx` (+ grep-verified orphans).

**Thread 2 — onboarding**
- Create `supabase/migrations/20260530000001_channels_onboarding.sql`.
- Modify `src/lib/supabase/repositories/channels.ts` — `Channel` type + `saveOnboarding` + `markOnboardingComplete`.
- Create `src/tests/lib/channels-onboarding.test.ts`.
- Modify `src/app/page.tsx` — onboarding guard. Modify `src/tests/app/landing-redirect.test.ts`.
- Create `src/lib/onboarding/parse-channel-urls.ts` + `src/tests/lib/parse-channel-urls.test.ts`.
- Create `src/app/onboarding/layout.tsx`, `src/app/onboarding/page.tsx`, `src/app/onboarding/onboarding-wizard.tsx` (+ step components).
- Create `src/app/api/onboarding/complete/route.ts` + `src/tests/api/onboarding-complete.test.ts`.
- Modify `src/app/settings/niche-finder/settings-client.tsx` — "Re-run setup" link.
- Modify `src/app/mission-control/page.tsx` — `?onboarded=1` callout.

**Thread 3 — admin**
- Modify `src/app/admin/_components/admin-sidebar.tsx` — 4 nav entries.
- Create `src/lib/admin/scoring-analysis.ts` + test; `src/app/admin/scoring-analysis/page.tsx`.
- Modify `src/lib/supabase/repositories/niche-predictions.ts` (`listClosedPredictions`), `niche-actions.ts` (`listRecentNicheActions`), `vidiq-appearances.ts` (`listVidiqAppearances`).
- Create `src/lib/admin/moat.ts` + test; `src/app/admin/moat-validation/page.tsx` + form client; `src/app/api/admin/vidiq-appearances/route.ts` + test.
- Create `src/lib/admin/costs.ts` + test; `src/app/admin/costs/page.tsx`; `src/app/admin/prompt-versions/page.tsx`.

**Final**
- Create `docs/superpowers/notes/2026-05-30-plan-5-phase-1-sub-f-handoff.md`.

---

I'll write the tasks in three commits to this file (shell, onboarding, admin + final) so each block is reviewable. Tasks follow the spec's order (§7).

---

## Thread 1 — Legacy-page shell unification

### Task 1: `AppShell` `bare` variant + prefix-aware sidebar active state

**Files:**
- Create: `src/components/layout/sidebar-active.ts`
- Test: `src/tests/components/sidebar-active.test.ts`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`
- Create: `src/app/settings/page.tsx`

- [ ] **Step 1: Write the failing test for `resolveActiveHref`**

```ts
// src/tests/components/sidebar-active.test.ts
import { describe, it, expect } from "vitest";
import { resolveActiveHref } from "@/components/layout/sidebar-active";

const HREFS = [
  "/mission-control", "/niches", "/lab", "/clips",
  "/niches/watch-list", "/competitors", "/settings",
];

describe("resolveActiveHref", () => {
  it("matches an exact path", () => {
    expect(resolveActiveHref("/niches", HREFS)).toBe("/niches");
  });
  it("matches a sub-route to its section root (longest prefix)", () => {
    expect(resolveActiveHref("/lab/drafts", HREFS)).toBe("/lab");
    expect(resolveActiveHref("/settings/channel", HREFS)).toBe("/settings");
    expect(resolveActiveHref("/niches/abc-123", HREFS)).toBe("/niches");
  });
  it("prefers the more specific item when two prefixes match", () => {
    expect(resolveActiveHref("/niches/watch-list", HREFS)).toBe("/niches/watch-list");
  });
  it("returns null when nothing matches", () => {
    expect(resolveActiveHref("/unknown", HREFS)).toBeNull();
  });
  it("does not treat a partial segment as a prefix", () => {
    // "/competitor" must NOT match "/competitors"
    expect(resolveActiveHref("/competitor", HREFS)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx vitest run src/tests/components/sidebar-active.test.ts`
Expected: FAIL — `resolveActiveHref` not exported / module missing.

- [ ] **Step 3: Implement `resolveActiveHref`**

```ts
// src/components/layout/sidebar-active.ts
/**
 * Given the current pathname and the set of nav hrefs, return the href that
 * should render active: the LONGEST href that is the pathname exactly or a
 * path-segment prefix of it (`href` followed by `/`). Returns null if none.
 *
 * Longest-prefix wins so `/niches/watch-list` lights up Watch-list (not Niches),
 * while `/niches/abc` and `/lab/drafts` light up their section roots.
 */
export function resolveActiveHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const isMatch = pathname === href || pathname.startsWith(href + "/");
    if (isMatch && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx vitest run src/tests/components/sidebar-active.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire `resolveActiveHref` into the `Sidebar` primitive**

In `src/components/layout/sidebar.tsx`, add the import and compute the resolved active href once from `activeHref` (now treated as "the current path"). Replace the per-item exact comparison.

Add near the top imports:
```ts
import { resolveActiveHref } from "@/components/layout/sidebar-active"
```
Inside `Sidebar`, after `const width = ...`, add:
```ts
  const resolvedActive = resolveActiveHref(activeHref ?? "", items.map((i) => i.href))
```
Then change the per-item line:
```ts
          const isActive = item.href === activeHref
```
to:
```ts
          const isActive = item.href === resolvedActive
```
(Backward compatible: callers that pass an exact href like `/niches` resolve to themselves; callers that pass a deeper pathname resolve to the longest matching nav root.)

- [ ] **Step 6: Add `bare` to `AppShell`**

Replace `src/components/layout/app-shell.tsx` with:
```tsx
import type { ReactNode } from "react"
import { AppCommandPalette } from "@/components/layout/app-command-palette"

export interface AppShellProps {
  sidebar: ReactNode
  children: ReactNode
  /** When true, render children full-bleed (no max-width/padding wrapper).
   * Used by migrated legacy pages that manage their own internal containers. */
  bare?: boolean
}

export function AppShell({ sidebar, children, bare = false }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      {sidebar}
      <main className="flex-1 min-w-0">
        {bare ? children : <div className="mx-auto max-w-[1280px] px-8 py-8">{children}</div>}
      </main>
      <AppCommandPalette />
    </div>
  )
}
```

- [ ] **Step 7: Make `AppSidebar` pathname-aware + point Settings at `/settings`**

Replace `src/components/layout/app-sidebar.tsx` with:
```tsx
"use client";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Sparkles, FlaskConical, Film, Eye, Swords, Settings } from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const NAV: SidebarItem[] = [
  { href: "/mission-control", label: "Mission Control", icon: LayoutDashboard },
  { href: "/niches", label: "Niches", icon: Sparkles },
  { href: "/lab", label: "Lab", icon: FlaskConical },
  { href: "/clips", label: "Clips", icon: Film },
  { href: "/niches/watch-list", label: "Watch-list", icon: Eye },
  { href: "/competitors", label: "Competitors", icon: Swords },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ activeHref }: { activeHref?: string }) {
  const pathname = usePathname();
  return <Sidebar items={NAV} activeHref={activeHref ?? pathname} footer={<ThemeToggle />} />;
}
```
(Existing callers that still pass `activeHref` keep compiling — it's now optional. New legacy pages call `<AppSidebar />`.)

- [ ] **Step 8: Add the `/settings` index redirect**

Create `src/app/settings/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default function SettingsIndexPage() {
  redirect("/settings/niche-finder");
}
```

- [ ] **Step 9: Typecheck + full test run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; vitest baseline holds (493 pass / 11 pre-existing fails) + the new sidebar-active test passes.

- [ ] **Step 10: Commit**

```bash
git add src/components/layout/app-shell.tsx src/components/layout/app-sidebar.tsx \
  src/components/layout/sidebar.tsx src/components/layout/sidebar-active.ts \
  src/tests/components/sidebar-active.test.ts src/app/settings/page.tsx
git commit -m "feat(plan-5-f): AppShell bare variant + prefix-aware sidebar active state"
```

### Task 2: Migrate `/mission-control` to `AppShell bare`

**Files:**
- Modify: `src/app/mission-control/page.tsx`

- [ ] **Step 1: Swap the shell wrapper (body untouched)**

Replace `src/app/mission-control/page.tsx` with:
```tsx
// The legacy cockpit reads Supabase at render time; defer to request time so the
// build doesn't try to prerender it with blank secrets (same pattern as the new surfaces).
export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopicQueuePanel } from "@/components/cockpit/topic-queue-panel";
import { TrendingPanel } from "@/components/cockpit/trending-panel";

export default function MissionControlPage() {
  return (
    <AppShell bare sidebar={<AppSidebar />}>
      <div className="h-full flex flex-col lg:flex-row">
        <div className="flex-1 min-w-0 lg:basis-3/5 lg:border-r lg:border-subtle">
          <TopicQueuePanel />
        </div>
        <div className="flex-1 min-w-0 lg:basis-2/5">
          <TrendingPanel />
        </div>
      </div>
    </AppShell>
  );
}
```
(The `?onboarded=1` callout is added in Task 9.)

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && env -u ANTHROPIC_BASE_URL npm run build`
Expected: clean; `/mission-control` is `ƒ` (Dynamic).

- [ ] **Step 3: Commit**

```bash
git add src/app/mission-control/page.tsx
git commit -m "feat(plan-5-f): mission-control adopts AppShell"
```

### Task 3: Migrate `/lab` and `/lab/drafts` to `AppShell bare`

**Files:**
- Modify: `src/app/lab/page.tsx`
- Modify: `src/app/lab/drafts/page.tsx`

- [ ] **Step 1: `/lab/page.tsx` — swap only the wrapper**

In `src/app/lab/page.tsx`, replace the `CockpitShell` import line:
```ts
import { CockpitShell } from "@/components/cockpit/cockpit-shell";
```
with:
```ts
import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
```
Then change the opening/closing wrapper from `<CockpitShell>` … `</CockpitShell>` to `<AppShell bare sidebar={<AppSidebar />}>` … `</AppShell>`. Leave the inner `<div className="p-6 space-y-6 max-w-5xl mx-auto">…</div>` body exactly as-is.

- [ ] **Step 2: `/lab/drafts/page.tsx` — same swap**

In `src/app/lab/drafts/page.tsx`, replace the `CockpitShell` import with the `AppShell` + `AppSidebar` imports (as Step 1), and change `<CockpitShell>`…`</CockpitShell>` to `<AppShell bare sidebar={<AppSidebar />}>`…`</AppShell>`. Body untouched.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && env -u ANTHROPIC_BASE_URL npm run build`
Expected: clean; both `/lab` and `/lab/drafts` are `ƒ`.

- [ ] **Step 4: Commit**

```bash
git add src/app/lab/page.tsx src/app/lab/drafts/page.tsx
git commit -m "feat(plan-5-f): lab + drafts adopt AppShell"
```

### Task 4: Migrate `/clips` to `AppShell bare`

**Files:**
- Modify: `src/app/clips/page.tsx`

- [ ] **Step 1: Swap the wrapper**

In `src/app/clips/page.tsx`, replace the `CockpitShell` import with the `AppShell` + `AppSidebar` imports, and change `<CockpitShell>`…`</CockpitShell>` to `<AppShell bare sidebar={<AppSidebar />}>`…`</AppShell>`. Leave the inner `<div className="p-6 space-y-6 max-w-6xl mx-auto">…</div>` body as-is.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && env -u ANTHROPIC_BASE_URL npm run build`
Expected: clean; `/clips` is `ƒ`.

- [ ] **Step 3: Commit**

```bash
git add src/app/clips/page.tsx
git commit -m "feat(plan-5-f): clips adopts AppShell"
```

### Task 5: Migrate `/settings/channel`, then retire `CockpitShell`

**Files:**
- Modify: `src/app/settings/channel/page.tsx`
- Delete: `src/components/cockpit/cockpit-shell.tsx` (+ grep-verified orphans)

- [ ] **Step 1: Swap the wrapper on `/settings/channel`**

In `src/app/settings/channel/page.tsx`, replace the `CockpitShell` import with the `AppShell` + `AppSidebar` imports, and change `<CockpitShell>`…`</CockpitShell>` to `<AppShell bare sidebar={<AppSidebar />}>`…`</AppShell>`. Leave the inner `<div className="p-6 space-y-6 max-w-2xl mx-auto">…</div>` body as-is.

- [ ] **Step 2: Confirm `CockpitShell` has no remaining importers**

Run: `grep -rln "cockpit-shell\|CockpitShell" src/`
Expected: no matches (all five pages migrated). If any remain, migrate them the same way before continuing.

- [ ] **Step 3: Find orphaned cockpit-only components**

Run (check each child `CockpitShell` used — `TopBar`, `TeamStatusSidebar`, `ScraperTickerFooter`, `Spotlight`):
```bash
for c in top-bar team-status-sidebar scraper-ticker-footer; do echo "== $c =="; grep -rln "components/cockpit/$c" src/; done
echo "== Spotlight =="; grep -rln "ui/spotlight\|Spotlight" src/
```
Expected: `top-bar`, `team-status-sidebar`, `scraper-ticker-footer` are referenced ONLY by `cockpit-shell.tsx`. `Spotlight` may be referenced elsewhere — only delete components with zero remaining importers after `cockpit-shell.tsx` is removed.

- [ ] **Step 4: Delete `CockpitShell` and confirmed orphans**

```bash
git rm src/components/cockpit/cockpit-shell.tsx
# Then, ONLY for each component that Step 3 showed is orphaned (no other importer), e.g.:
# git rm src/components/cockpit/top-bar.tsx src/components/cockpit/team-status-sidebar.tsx src/components/cockpit/scraper-ticker-footer.tsx
```
Do NOT delete `Spotlight` or any component still imported elsewhere.

- [ ] **Step 5: Typecheck + build + full test run**

Run: `npx tsc --noEmit && npx vitest run && env -u ANTHROPIC_BASE_URL npm run build`
Expected: tsc clean (no dangling imports), vitest baseline holds, build passes. If tsc flags an unused import (e.g. `Spotlight` now unreferenced), remove it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(plan-5-f): settings/channel adopts AppShell; retire CockpitShell"
```

- [ ] **Step 7: Preview verification (operator-gated; Vercel preview)**

After this branch deploys a preview, screenshot `/mission-control`, `/lab`, `/lab/drafts`, `/clips`, `/settings/channel`: confirm the persistent `AppSidebar` is present, the correct nav item is highlighted (Lab for `/lab/drafts`, Settings for `/settings/channel`), Cmd/Ctrl-K opens the palette, and no layout is broken by the `bare` swap. (Local dev 500s with blank `.env.local` — this is a preview check.)

---

## Thread 2 — First-run onboarding

### Task 6: `channels` onboarding migration + repo fns + types regen

**Files:**
- Create: `supabase/migrations/20260530000001_channels_onboarding.sql`
- Modify: `src/lib/supabase/repositories/channels.ts`
- Test: `src/tests/lib/channels-onboarding.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260530000001_channels_onboarding.sql
-- Sub-phase F: first-run onboarding fields on channels.
alter table public.channels
  add column if not exists creator_goals text,
  add column if not exists interests text[] not null default '{}'::text[],
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.channels.creator_goals is 'Onboarding goal: monetize | grow_subscribers | test_niche | other (validated in app).';
comment on column public.channels.interests is 'Onboarding free-text interest tags; seeds targeted-search terms (§4.2).';
comment on column public.channels.onboarding_completed_at is 'Set when the first-run wizard finishes; null = onboarding not yet done (drives the / guard).';
```

- [ ] **Step 2: Write the failing test for the repo fns**

```ts
// src/tests/lib/channels-onboarding.test.ts
import { describe, it, expect, vi } from "vitest";
import { saveOnboarding, markOnboardingComplete } from "@/lib/supabase/repositories/channels";

/** Minimal chainable mock: .from(table).update(payload).eq(col,val) → { error: null }.
 * Records the table + payload + eq args so we can assert on them. */
function mockClient() {
  const calls: { table: string; payload?: Record<string, unknown>; eq?: [string, unknown] } = { table: "" };
  const client = {
    from(table: string) {
      calls.table = table;
      return {
        update(payload: Record<string, unknown>) {
          calls.payload = payload;
          return {
            async eq(col: string, val: unknown) {
              calls.eq = [col, val];
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

describe("channels onboarding repo", () => {
  it("saveOnboarding updates goals + interests on the channel id", async () => {
    const { client, calls } = mockClient();
    await saveOnboarding(client as never, {
      channelId: "ch-1",
      creatorGoals: "monetize",
      interests: ["ai", "productivity"],
    });
    expect(calls.table).toBe("channels");
    expect(calls.payload).toMatchObject({ creator_goals: "monetize", interests: ["ai", "productivity"] });
    expect(calls.eq).toEqual(["id", "ch-1"]);
  });

  it("markOnboardingComplete stamps onboarding_completed_at on the channel id", async () => {
    const { client, calls } = mockClient();
    await markOnboardingComplete(client as never, "ch-2");
    expect(calls.table).toBe("channels");
    expect(typeof (calls.payload as { onboarding_completed_at: string }).onboarding_completed_at).toBe("string");
    expect(calls.eq).toEqual(["id", "ch-2"]);
  });
});
```

- [ ] **Step 3: Run it; verify it fails**

Run: `npx vitest run src/tests/lib/channels-onboarding.test.ts`
Expected: FAIL — `saveOnboarding` / `markOnboardingComplete` not exported.

- [ ] **Step 4: Extend the `Channel` type + add the repo fns**

In `src/lib/supabase/repositories/channels.ts`, add to the `Channel` type (after `posting_schedule`):
```ts
  creator_goals: string | null;
  interests: string[];
  onboarding_completed_at: string | null;
```
Append the two functions at the end of the file:
```ts
export type CreatorGoal = "monetize" | "grow_subscribers" | "test_niche" | "other";

export async function saveOnboarding(
  supabase: SupabaseClient,
  params: { channelId: string; creatorGoals: CreatorGoal; interests: string[] },
): Promise<void> {
  const { error } = await supabase
    .from("channels")
    .update({ creator_goals: params.creatorGoals, interests: params.interests })
    .eq("id", params.channelId);
  if (error) throw new Error(`saveOnboarding: ${error.message}`);
}

export async function markOnboardingComplete(
  supabase: SupabaseClient,
  channelId: string,
): Promise<void> {
  const { error } = await supabase
    .from("channels")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", channelId);
  if (error) throw new Error(`markOnboardingComplete: ${error.message}`);
}
```

- [ ] **Step 5: Run it; verify it passes + tsc**

Run: `npx vitest run src/tests/lib/channels-onboarding.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests); tsc clean.

- [ ] **Step 6: Commit (code only — prod apply is a separate gated step)**

```bash
git add supabase/migrations/20260530000001_channels_onboarding.sql \
  src/lib/supabase/repositories/channels.ts src/tests/lib/channels-onboarding.test.ts
git commit -m "feat(plan-5-f): channels onboarding columns + saveOnboarding/markOnboardingComplete"
```

- [ ] **Step 7: OPERATOR-GATED — apply migration to prod + regen types**

Ask in chat: "Apply migration `channels_onboarding` to prod `jfmjppzjicvbpnlkmxbg`?" On explicit OK, apply via Supabase MCP `apply_migration` (name `channels_onboarding`), then regenerate `src/lib/supabase/types.ts` via `generate_typescript_types` for `jfmjppzjicvbpnlkmxbg`, overwrite the file. Then `npx tsc --noEmit` (expected clean — repos use the untyped service client) and commit:
```bash
git add src/lib/supabase/types.ts
git commit -m "chore(plan-5-f): regenerate types.ts after channels_onboarding prod apply"
```
Until applied, `/` and the onboarding finish route throw at runtime when reading/writing the new columns — gate live verification on this.

### Task 7: `/` onboarding guard + `/onboarding` focused layout + steps 1–3

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/tests/app/landing-redirect.test.ts`
- Create: `src/app/onboarding/layout.tsx`
- Create: `src/app/onboarding/onboarding-wizard.tsx`
- Create: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Rewrite the landing-redirect test for the guard**

Replace `src/tests/app/landing-redirect.test.ts` with:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));
vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn(() => ({})) }));
const getDefaultChannel = vi.fn();
vi.mock("@/lib/supabase/repositories/channels", () => ({
  getDefaultChannel: (...a: Parameters<typeof getDefaultChannel>) => getDefaultChannel(...a),
}));

import HomePage from "@/app/page";

beforeEach(() => getDefaultChannel.mockReset());

describe("/ landing guard", () => {
  it("redirects to /onboarding when onboarding is not complete", async () => {
    getDefaultChannel.mockResolvedValue({ onboarding_completed_at: null });
    await expect(HomePage()).rejects.toThrow("REDIRECT:/onboarding");
  });
  it("redirects to /niches when onboarding is complete", async () => {
    getDefaultChannel.mockResolvedValue({ onboarding_completed_at: "2026-05-30T00:00:00Z" });
    await expect(HomePage()).rejects.toThrow("REDIRECT:/niches");
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx vitest run src/tests/app/landing-redirect.test.ts`
Expected: FAIL — current `HomePage` is sync and always redirects to `/niches`.

- [ ] **Step 3: Implement the guard**

Replace `src/app/page.tsx` with:
```tsx
import { redirect } from "next/navigation";
import { getServiceClient } from "@/lib/supabase/server";
import { getDefaultChannel } from "@/lib/supabase/repositories/channels";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = getServiceClient();
  const channel = await getDefaultChannel(supabase);
  if (!channel.onboarding_completed_at) redirect("/onboarding");
  redirect("/niches");
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx vitest run src/tests/app/landing-redirect.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the focused onboarding layout (no sidebar)**

Create `src/app/onboarding/layout.tsx`:
```tsx
import type { ReactNode } from "react";

// Focused first-run layout: no AppSidebar — the wizard IS the one thing.
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-[var(--bg)]">
      <div className="w-full max-w-xl">{children}</div>
    </div>
  );
}
```

- [ ] **Step 6: Build the wizard shell + steps 1–3 (premium)**

Create `src/app/onboarding/onboarding-wizard.tsx` as a `"use client"` component. **Invoke the frontend-design + ui-ux-pro-max + shadcn skills** to produce the premium markup. It must satisfy this exact contract so Tasks 8–9 wire in cleanly:

State held in the wizard (single source of truth, POSTed at finish):
```ts
type WizardState = {
  step: number;                       // 0..5
  creatorGoals: CreatorGoal | null;   // step 2 (import type from channels repo)
  interests: string[];                // step 3 (tag chips)
  admiredUrls: string[];              // step 4 (Task 8)
  alsoCompetitor: Record<string, boolean>; // step 4 per-url flag (Task 8)
};
```
Steps in this task (0–2 of the 6-step flow; later steps stubbed as "next" placeholders until Tasks 8–9):
- **Step 0 — Welcome:** headline ("Find proven niches, generate videos, ship better"), one-line subhead, single primary "Get started" button. Lead with this ONE thing.
- **Step 1 — Goals:** single-select among 4 cards → sets `creatorGoals` to `monetize | grow_subscribers | test_niche | other`. "Continue" disabled until chosen.
- **Step 2 — Interests:** tag input (type + Enter adds a chip; backspace/x removes). Writes `interests: string[]`. "Continue" enabled with ≥1 tag; a "Skip" affordance allows empty.

Requirements: a stepper/progress indicator (6 steps), Framer Motion step transitions (use the existing `@/lib/motion` tokens — `fadeRise`), keyboard-friendly (Enter advances where valid), design-system tokens only, motion-reduce safe. Back button on steps ≥1.

Create `src/app/onboarding/page.tsx`:
```tsx
import { OnboardingWizard } from "./onboarding-wizard";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return <OnboardingWizard />;
}
```

- [ ] **Step 7: Typecheck + full test run + build**

Run: `npx tsc --noEmit && npx vitest run && env -u ANTHROPIC_BASE_URL npm run build`
Expected: tsc clean; vitest baseline holds + the rewritten landing test passes; `/onboarding` builds as `ƒ`.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx src/tests/app/landing-redirect.test.ts \
  src/app/onboarding/layout.tsx src/app/onboarding/onboarding-wizard.tsx src/app/onboarding/page.tsx
git commit -m "feat(plan-5-f): / onboarding guard + focused wizard (welcome/goals/interests)"
```

### Task 8: Onboarding steps 4–5 (admired channels + connect channel)

**Files:**
- Create: `src/lib/onboarding/parse-channel-urls.ts`
- Test: `src/tests/lib/parse-channel-urls.test.ts`
- Modify: `src/app/onboarding/onboarding-wizard.tsx`

- [ ] **Step 1: Write the failing test for `parseChannelUrls`**

```ts
// src/tests/lib/parse-channel-urls.test.ts
import { describe, it, expect } from "vitest";
import { parseChannelUrls } from "@/lib/onboarding/parse-channel-urls";

describe("parseChannelUrls", () => {
  it("splits on newlines and commas, trims, drops blanks", () => {
    expect(parseChannelUrls("https://youtube.com/@a\nhttps://youtube.com/@b , @c"))
      .toEqual(["https://youtube.com/@a", "https://youtube.com/@b", "@c"]);
  });
  it("dedupes case-sensitively-distinct entries while preserving order", () => {
    expect(parseChannelUrls("@a\n@a\n@b")).toEqual(["@a", "@b"]);
  });
  it("returns [] for empty/whitespace input", () => {
    expect(parseChannelUrls("   \n  ,  ")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx vitest run src/tests/lib/parse-channel-urls.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `parseChannelUrls`**

```ts
// src/lib/onboarding/parse-channel-urls.ts
/** Normalize a free-text paste of channel URLs/handles into a clean, de-duped list.
 * The watch-list/competitor routes resolve each entry via the YouTube API, so this
 * only splits, trims, and dedupes — it does not validate URL shape. */
export function parseChannelUrls(raw: string): string[] {
  const parts = raw.split(/[\n,]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!seen.has(p)) { seen.add(p); out.push(p); }
  }
  return out;
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx vitest run src/tests/lib/parse-channel-urls.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add steps 4–5 to the wizard (premium; reuse existing routes)**

Extend `src/app/onboarding/onboarding-wizard.tsx` (frontend-design + ui-ux-pro-max + shadcn skills):
- **Step 3 — Admired channels:** a textarea ("Paste 5–10 channel URLs you respect, one per line"). On change, run `parseChannelUrls` to preview the parsed list as removable chips; each chip has a small "also a competitor" toggle writing `alsoCompetitor[url]`. Store the parsed list in `admiredUrls`. Posting happens at finish (Task 9) so the operator can edit freely; show a hint "We'll add these when you finish." "Continue"/"Skip" both allowed (empty list ok).
- **Step 4 — Connect channel:** explain why (analytics for the close-loop). Render the existing connect affordance — reuse `ConnectYouTubeButton` from `@/components/settings/connect-youtube-button` (it takes a `connected: boolean` prop — pass `connected={false}` in onboarding; a fresh operator hasn't linked yet). A prominent "Skip for now — I'll connect later" secondary action advances without connecting.

Both steps must have designed skip states and keep the stepper/back/motion behavior from Task 7.

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit && env -u ANTHROPIC_BASE_URL npm run build`
Expected: clean; `/onboarding` still `ƒ`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/onboarding/parse-channel-urls.ts src/tests/lib/parse-channel-urls.test.ts \
  src/app/onboarding/onboarding-wizard.tsx
git commit -m "feat(plan-5-f): onboarding steps 4-5 (admired channels + connect)"
```

### Task 9: Onboarding finish route + landing callout + Settings re-run link

**Files:**
- Create: `src/app/api/onboarding/complete/route.ts`
- Test: `src/tests/api/onboarding-complete.test.ts`
- Modify: `src/app/onboarding/onboarding-wizard.tsx`
- Modify: `src/app/settings/niche-finder/settings-client.tsx`
- Modify: `src/app/mission-control/page.tsx`

- [ ] **Step 1: Write the failing test for the finish route**

```ts
// src/tests/api/onboarding-complete.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn(() => ({})) }));
const getDefaultChannel = vi.fn(async () => ({ id: "ch-1" }));
const saveOnboarding = vi.fn(async () => {});
const markOnboardingComplete = vi.fn(async () => {});
vi.mock("@/lib/supabase/repositories/channels", () => ({
  getDefaultChannel: (...a: Parameters<typeof getDefaultChannel>) => getDefaultChannel(...a),
  saveOnboarding: (...a: Parameters<typeof saveOnboarding>) => saveOnboarding(...a),
  markOnboardingComplete: (...a: Parameters<typeof markOnboardingComplete>) => markOnboardingComplete(...a),
}));
const triggerIngestion = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/ingestion/registry", () => ({
  triggerIngestion: (...a: Parameters<typeof triggerIngestion>) => triggerIngestion(...a),
  TRIGGERABLE_JOBS: ["youtube_shorts_search"],
}));
vi.mock("@/lib/env", () => ({ loadEnv: () => ({ CRON_SECRET: "s" }) }));

import { POST } from "@/app/api/onboarding/complete/route";

function req(body: unknown) {
  return new Request("http://x/api/onboarding/complete", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => { saveOnboarding.mockClear(); markOnboardingComplete.mockClear(); triggerIngestion.mockClear(); });

describe("POST /api/onboarding/complete", () => {
  it("400s on an invalid goal", async () => {
    const res = await POST(req({ creatorGoals: "nope", interests: [] }));
    expect(res.status).toBe(400);
  });
  it("persists, marks complete, enqueues a scan, returns 200", async () => {
    const res = await POST(req({ creatorGoals: "monetize", interests: ["ai"] }));
    expect(res.status).toBe(200);
    expect(saveOnboarding).toHaveBeenCalled();
    expect(markOnboardingComplete).toHaveBeenCalledWith(expect.anything(), "ch-1");
    expect(triggerIngestion).toHaveBeenCalled();
  });
  it("still returns 200 when the scan enqueue fails (fire-and-forget)", async () => {
    triggerIngestion.mockRejectedValueOnce(new Error("network"));
    const res = await POST(req({ creatorGoals: "other", interests: [] }));
    expect(res.status).toBe(200);
    expect(markOnboardingComplete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx vitest run src/tests/api/onboarding-complete.test.ts`
Expected: FAIL — route module missing.

- [ ] **Step 3: Implement the finish route**

```ts
// src/app/api/onboarding/complete/route.ts
import "server-only";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { getDefaultChannel, saveOnboarding, markOnboardingComplete } from "@/lib/supabase/repositories/channels";
import { triggerIngestion } from "@/lib/ingestion/registry";
import { loadEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  creatorGoals: z.enum(["monetize", "grow_subscribers", "test_niche", "other"]),
  interests: z.array(z.string()).default([]),
});

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try { body = BodySchema.parse(await req.json()); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : "bad body" }, { status: 400 }); }

  const supabase = getServiceClient();
  const channel = await getDefaultChannel(supabase);
  await saveOnboarding(supabase, { channelId: channel.id, creatorGoals: body.creatorGoals, interests: body.interests });
  await markOnboardingComplete(supabase, channel.id);

  // Fire-and-forget small scan; never let an enqueue failure block completion.
  const env = loadEnv();
  const origin = new URL(req.url).origin;
  try {
    await triggerIngestion({ job: "youtube_shorts_search", origin, secret: env.CRON_SECRET });
  } catch { /* best-effort: first niches still arrive at Monday's digest run */ }

  return Response.json({ ok: true }, { status: 200 });
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx vitest run src/tests/api/onboarding-complete.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the wizard's finish step (Step 5 — Done)**

In `src/app/onboarding/onboarding-wizard.tsx`, implement the final step:
- On "Finish", first POST each `admiredUrls` entry to `POST /api/watch-list/channels` with body `{ urlOrHandle }`; if `alsoCompetitor[url]` is set, also POST to `POST /api/watch-list/competitors` with `{ urlOrHandle }`. Tolerate per-URL failures (collect + show a small "couldn't add N" note; don't block).
- Then POST `{ creatorGoals, interests }` to `POST /api/onboarding/complete`.
- On success, `router.push("/mission-control?onboarded=1")` (use `useRouter` from `next/navigation`).
- Show a brief in-flight state on the Finish button (≤200ms ops may not need a skeleton; a button spinner is fine here since it's a network batch).

- [ ] **Step 6: Add the landing callout on Mission Control**

In `src/app/mission-control/page.tsx`, read the `onboarded` search param and render a dismissible callout above the panels when `onboarded === "1"`: "You're all set — first niches arriving by Monday's digest." Use the App Router `searchParams` prop (this fork: `searchParams` is a Promise — `await` it; mirror the pattern in `src/app/settings/channel/page.tsx`). Keep it a server-rendered banner (a simple bordered Card with accent styling); no client state needed if non-dismissible, or a tiny client wrapper if you want a close button. Page stays `force-dynamic`.

- [ ] **Step 7: Add the "Re-run setup" link in Settings**

In `src/app/settings/niche-finder/settings-client.tsx`, add a small secondary link/button "Re-run setup" pointing to `/onboarding` (Next `<Link href="/onboarding">`), placed unobtrusively (e.g. footer of the settings panel). It re-enters the wizard; finishing re-stamps `onboarding_completed_at`.

- [ ] **Step 8: Typecheck + full test run + build**

Run: `npx tsc --noEmit && npx vitest run && env -u ANTHROPIC_BASE_URL npm run build`
Expected: tsc clean; vitest baseline + the 3 new onboarding-complete tests pass; build passes.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/onboarding/complete/route.ts src/tests/api/onboarding-complete.test.ts \
  src/app/onboarding/onboarding-wizard.tsx src/app/settings/niche-finder/settings-client.tsx \
  src/app/mission-control/page.tsx
git commit -m "feat(plan-5-f): onboarding finish route + scan enqueue + landing callout + re-run link"
```

- [ ] **Step 10: Preview verification (operator-gated; needs Task 6 prod apply)**

On the preview: with a channel whose `onboarding_completed_at` is null, hitting `/` redirects to `/onboarding`; complete the wizard → admired channels appear in `/niches/watch-list` (+ `/competitors` where flagged), goals/interests persist on the channel, an `ingestion_runs` row is created for `youtube_shorts_search`, and you land on `/mission-control?onboarded=1` with the callout. Re-hitting `/` now redirects to `/niches`. "Re-run setup" re-opens the wizard.

---

## Thread 3 — Deferred admin analysis pages

### Task 10: Expand `AdminSidebar` nav

**Files:**
- Modify: `src/app/admin/_components/admin-sidebar.tsx`

- [ ] **Step 1: Add the four new entries**

Replace `src/app/admin/_components/admin-sidebar.tsx` with:
```tsx
"use client";
import { usePathname } from "next/navigation";
import { Activity, ListChecks, Gauge, ShieldCheck, FileClock, DollarSign } from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const ADMIN_NAV: SidebarItem[] = [
  { href: "/admin/ingestion-health", label: "Ingestion Health", icon: Activity },
  { href: "/admin/classification-review", label: "Classification Review", icon: ListChecks },
  { href: "/admin/scoring-analysis", label: "Scoring Analysis", icon: Gauge },
  { href: "/admin/moat-validation", label: "Moat Validation", icon: ShieldCheck },
  { href: "/admin/costs", label: "Costs", icon: DollarSign },
  { href: "/admin/prompt-versions", label: "Prompt Versions", icon: FileClock },
];

export function AdminSidebar({ activeHref }: { activeHref?: string }) {
  const pathname = usePathname();
  return <Sidebar items={ADMIN_NAV} activeHref={activeHref ?? pathname} footer={<ThemeToggle />} />;
}
```
(Made `activeHref` optional + pathname-aware to match `AppSidebar`. Existing pages that pass `activeHref` keep compiling.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/_components/admin-sidebar.tsx
git commit -m "feat(plan-5-f): expand AdminSidebar with the four F admin pages"
```

### Task 11: `/admin/scoring-analysis` (real, partial)

**Files:**
- Create: `src/lib/admin/scoring-analysis.ts`
- Test: `src/tests/lib/scoring-analysis.test.ts`
- Modify: `src/lib/supabase/repositories/niche-predictions.ts` (add `listClosedPredictions`)
- Modify: `src/lib/supabase/repositories/niche-actions.ts` (add `listRecentNicheActions`)
- Create: `src/app/admin/scoring-analysis/page.tsx`

- [ ] **Step 1: Write the failing test for the pure aggregations**

```ts
// src/tests/lib/scoring-analysis.test.ts
import { describe, it, expect } from "vitest";
import { averageSignalContributions, actionCorrelation, predictionAccuracy } from "@/lib/admin/scoring-analysis";

describe("averageSignalContributions", () => {
  it("averages each signal key across clusters that report it", () => {
    const out = averageSignalContributions([
      { explainability_top_signals: { velocity: 2, outlier: 4 } },
      { explainability_top_signals: { velocity: 4 } },
    ]);
    expect(out.velocity).toBe(3);   // (2+4)/2
    expect(out.outlier).toBe(4);    // 4/1
  });
  it("returns {} for no clusters", () => {
    expect(averageSignalContributions([])).toEqual({});
  });
});

describe("actionCorrelation", () => {
  it("splits clusters into acted vs negative and averages each score component", () => {
    const clusters = [
      { id: "a", first_mover_score: 10, proven_score: 2, niche_score: 8 },
      { id: "b", first_mover_score: 2, proven_score: 6, niche_score: 4 },
    ];
    const actionsByCluster = {
      a: { viewed: 1, investigated: 1, generated_from: 0, dismissed: 0, hidden: 0 },
      b: { viewed: 1, investigated: 0, generated_from: 0, dismissed: 1, hidden: 0 },
    };
    const out = actionCorrelation(clusters, actionsByCluster);
    expect(out.actedCount).toBe(1);
    expect(out.negativeCount).toBe(1);
    expect(out.actedAvg.first_mover_score).toBe(10);
    expect(out.negativeAvg.proven_score).toBe(6);
  });
  it("reports zero counts when there are no actions", () => {
    const out = actionCorrelation([{ id: "a", first_mover_score: 1, proven_score: 1, niche_score: 1 }], {});
    expect(out.actedCount).toBe(0);
    expect(out.negativeCount).toBe(0);
  });
});

describe("predictionAccuracy", () => {
  it("returns null when nothing is closed", () => {
    expect(predictionAccuracy([])).toBeNull();
  });
  it("counts verdicts and computes percentages", () => {
    const out = predictionAccuracy([
      { accuracy_verdict: "within" }, { accuracy_verdict: "within" },
      { accuracy_verdict: "above" }, { accuracy_verdict: "below" },
    ]);
    expect(out).not.toBeNull();
    expect(out!.total).toBe(4);
    expect(out!.within).toBe(2);
    expect(out!.withinPct).toBe(50);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx vitest run src/tests/lib/scoring-analysis.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the pure aggregations**

```ts
// src/lib/admin/scoring-analysis.ts
export type ScoreComponents = { first_mover_score: number; proven_score: number; niche_score: number };

export function averageSignalContributions(
  clusters: Array<{ explainability_top_signals: Record<string, number> }>,
): Record<string, number> {
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const c of clusters) {
    for (const [k, v] of Object.entries(c.explainability_top_signals ?? {})) {
      if (typeof v !== "number" || Number.isNaN(v)) continue;
      sums[k] = (sums[k] ?? 0) + v;
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }
  const out: Record<string, number> = {};
  for (const k of Object.keys(sums)) out[k] = sums[k] / counts[k];
  return out;
}

export interface ActionCounts { viewed: number; investigated: number; generated_from: number; dismissed: number; hidden: number; }

export interface ActionCorrelationResult {
  actedCount: number;
  negativeCount: number;
  actedAvg: ScoreComponents;
  negativeAvg: ScoreComponents;
}

function avgComponents(rows: Array<{ first_mover_score: number; proven_score: number; niche_score: number }>): ScoreComponents {
  if (rows.length === 0) return { first_mover_score: 0, proven_score: 0, niche_score: 0 };
  const acc = rows.reduce(
    (a, r) => ({
      first_mover_score: a.first_mover_score + (r.first_mover_score ?? 0),
      proven_score: a.proven_score + (r.proven_score ?? 0),
      niche_score: a.niche_score + (r.niche_score ?? 0),
    }),
    { first_mover_score: 0, proven_score: 0, niche_score: 0 },
  );
  return {
    first_mover_score: acc.first_mover_score / rows.length,
    proven_score: acc.proven_score / rows.length,
    niche_score: acc.niche_score / rows.length,
  };
}

export function actionCorrelation(
  clusters: Array<{ id: string; first_mover_score: number; proven_score: number; niche_score: number }>,
  actionsByCluster: Record<string, ActionCounts>,
): ActionCorrelationResult {
  const acted: typeof clusters = [];
  const negative: typeof clusters = [];
  for (const c of clusters) {
    const a = actionsByCluster[c.id];
    if (!a) continue;
    const isActed = a.investigated > 0 || a.generated_from > 0;
    const isNegative = a.dismissed > 0 || a.hidden > 0;
    if (isActed) acted.push(c);
    else if (isNegative) negative.push(c);
  }
  return {
    actedCount: acted.length,
    negativeCount: negative.length,
    actedAvg: avgComponents(acted),
    negativeAvg: avgComponents(negative),
  };
}

export interface PredictionAccuracyResult {
  total: number; within: number; above: number; below: number;
  withinPct: number; abovePct: number; belowPct: number;
}

export function predictionAccuracy(
  closed: Array<{ accuracy_verdict: "within" | "above" | "below" | null }>,
): PredictionAccuracyResult | null {
  const rows = closed.filter((r) => r.accuracy_verdict !== null);
  if (rows.length === 0) return null;
  const within = rows.filter((r) => r.accuracy_verdict === "within").length;
  const above = rows.filter((r) => r.accuracy_verdict === "above").length;
  const below = rows.filter((r) => r.accuracy_verdict === "below").length;
  const total = rows.length;
  const pct = (n: number) => Math.round((n / total) * 100);
  return { total, within, above, below, withinPct: pct(within), abovePct: pct(above), belowPct: pct(below) };
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx vitest run src/tests/lib/scoring-analysis.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Add the two repo reads**

In `src/lib/supabase/repositories/niche-predictions.ts`, append:
```ts
/** Closed predictions (outcome attached) — powers the accuracy aggregate. */
export async function listClosedPredictions(supabase: SupabaseClient): Promise<NichePrediction[]> {
  const { data, error } = await supabase
    .from("niche_predictions")
    .select()
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false });
  if (error) throw new Error(`listClosedPredictions: ${error.message}`);
  return (data ?? []) as NichePrediction[];
}
```
In `src/lib/supabase/repositories/niche-actions.ts`, append:
```ts
/** Recent raw actions across clusters (for admin correlation; aggregate in pure code). */
export async function listRecentNicheActions(
  supabase: SupabaseClient,
  limit = 1000,
): Promise<Array<{ niche_cluster_id: string; action: NicheActionType }>> {
  const { data, error } = await supabase
    .from("niche_actions")
    .select("niche_cluster_id, action")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentNicheActions: ${error.message}`);
  return (data ?? []) as Array<{ niche_cluster_id: string; action: NicheActionType }>;
}
```

- [ ] **Step 6: Build the page (premium; honest empty states)**

Create `src/app/admin/scoring-analysis/page.tsx` (server component, `force-dynamic`; frontend-design + ui-ux-pro-max + shadcn skills). Pattern after `src/app/admin/ingestion-health/page.tsx` (AppShell + AdminSidebar + PageHeader). Data flow:
- Resolve latest week via `getLatestWeekStart` → `listDigestRankedClusters(supabase, week)`.
- Build `actionsByCluster`: fold `listRecentNicheActions` into a `Record<clusterId, ActionCounts>` (init zeros, increment by `action`).
- Compute `averageSignalContributions(clusters)`, `actionCorrelation(clusters.map(c => ({ id, first_mover_score: c.first_mover_score ?? 0, proven_score: c.proven_score ?? 0, niche_score: c.niche_score ?? 0 })), actionsByCluster)`, and `predictionAccuracy(await listClosedPredictions(supabase))`.
- Render three sections: **Signal contributions** (bar list / Recharts bar of the averaged signals), **Acted-on vs dismissed** (side-by-side score-component comparison; if `actedCount === 0 && negativeCount === 0`, a designed empty state: "No niche actions logged yet — act on a few niches and weight correlation appears here"), **Prediction accuracy** (if `predictionAccuracy` is null, the honest state "Awaiting first closed prediction — the +7d close-loop runs once a niche-sourced video has posted and accrued 7 days of analytics"; else within/above/below percentages).

- [ ] **Step 7: Typecheck + full test run + build**

Run: `npx tsc --noEmit && npx vitest run && env -u ANTHROPIC_BASE_URL npm run build`
Expected: tsc clean; vitest baseline + 6 new tests pass; `/admin/scoring-analysis` is `ƒ`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/admin/scoring-analysis.ts src/tests/lib/scoring-analysis.test.ts \
  src/lib/supabase/repositories/niche-predictions.ts src/lib/supabase/repositories/niche-actions.ts \
  src/app/admin/scoring-analysis/page.tsx
git commit -m "feat(plan-5-f): /admin/scoring-analysis (signal weights + action correlation + accuracy)"
```

### Task 12: `/admin/moat-validation` (real: log form + lag table)

**Files:**
- Create: `src/lib/admin/moat.ts`
- Test: `src/tests/lib/moat.test.ts`
- Modify: `src/lib/supabase/repositories/vidiq-appearances.ts` (add `listVidiqAppearances`)
- Create: `src/app/api/admin/vidiq-appearances/route.ts`
- Test: `src/tests/api/admin-vidiq-appearances.test.ts`
- Create: `src/app/admin/moat-validation/page.tsx`
- Create: `src/app/admin/moat-validation/log-form.tsx`

- [ ] **Step 1: Write the failing test for the lag aggregation**

```ts
// src/tests/lib/moat.test.ts
import { describe, it, expect } from "vitest";
import { earliestExternalLagDays, averageLagDays } from "@/lib/admin/moat";

const base = {
  canonical_topic: "t", format_label: "talking_head_facts" as const,
  first_surfaced_by_1of10_at: null, notes: null, created_at: "", id: "x",
};

describe("earliestExternalLagDays", () => {
  it("uses the earliest external surfacing date", () => {
    const lag = earliestExternalLagDays({
      ...base,
      first_surfaced_by_shorts_os_at: "2026-05-01T00:00:00Z",
      first_surfaced_by_vidiq_at: "2026-05-11T00:00:00Z",          // +10d
      first_surfaced_by_exploding_topics_at: "2026-05-06T00:00:00Z", // +5d (earliest)
    });
    expect(lag).toBe(5);
  });
  it("returns null when no external date exists", () => {
    expect(earliestExternalLagDays({
      ...base,
      first_surfaced_by_shorts_os_at: "2026-05-01T00:00:00Z",
      first_surfaced_by_vidiq_at: null,
      first_surfaced_by_exploding_topics_at: null,
    })).toBeNull();
  });
});

describe("averageLagDays", () => {
  it("averages over rows that have an external date; null if none", () => {
    const rows = [
      { ...base, first_surfaced_by_shorts_os_at: "2026-05-01T00:00:00Z", first_surfaced_by_vidiq_at: "2026-05-05T00:00:00Z", first_surfaced_by_exploding_topics_at: null }, // +4
      { ...base, first_surfaced_by_shorts_os_at: "2026-05-01T00:00:00Z", first_surfaced_by_vidiq_at: "2026-05-09T00:00:00Z", first_surfaced_by_exploding_topics_at: null }, // +8
      { ...base, first_surfaced_by_shorts_os_at: "2026-05-01T00:00:00Z", first_surfaced_by_vidiq_at: null, first_surfaced_by_exploding_topics_at: null }, // excluded
    ];
    expect(averageLagDays(rows)).toBe(6);
    expect(averageLagDays([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx vitest run src/tests/lib/moat.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the lag aggregation (reuse `computeLagDays`)**

```ts
// src/lib/admin/moat.ts
import { computeLagDays, type VidiqAppearance } from "@/lib/supabase/repositories/vidiq-appearances";

type ExternalFields = Pick<VidiqAppearance,
  | "first_surfaced_by_shorts_os_at"
  | "first_surfaced_by_vidiq_at"
  | "first_surfaced_by_1of10_at"
  | "first_surfaced_by_exploding_topics_at">;

/** Days from our surfacing to the EARLIEST external tool's surfacing; null if none. */
export function earliestExternalLagDays(a: ExternalFields): number | null {
  const externals = [a.first_surfaced_by_vidiq_at, a.first_surfaced_by_1of10_at, a.first_surfaced_by_exploding_topics_at]
    .filter((d): d is string => d !== null)
    .map((d) => new Date(d).getTime());
  if (externals.length === 0) return null;
  const earliest = new Date(Math.min(...externals));
  return computeLagDays(new Date(a.first_surfaced_by_shorts_os_at), earliest);
}

export function averageLagDays(rows: ExternalFields[]): number | null {
  const lags = rows.map(earliestExternalLagDays).filter((n): n is number => n !== null);
  if (lags.length === 0) return null;
  return Math.round(lags.reduce((s, n) => s + n, 0) / lags.length);
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx vitest run src/tests/lib/moat.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add `listVidiqAppearances`**

In `src/lib/supabase/repositories/vidiq-appearances.ts`, append:
```ts
export async function listVidiqAppearances(supabase: SupabaseClient): Promise<VidiqAppearance[]> {
  const { data, error } = await supabase
    .from("vidiq_appearances")
    .select()
    .order("first_surfaced_by_shorts_os_at", { ascending: false });
  if (error) throw new Error(`listVidiqAppearances: ${error.message}`);
  return (data ?? []) as VidiqAppearance[];
}
```

- [ ] **Step 6: Write the failing test for the insert route**

```ts
// src/tests/api/admin-vidiq-appearances.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn(() => ({})) }));
const insertVidiqAppearance = vi.fn(async () => ({ id: "v1" }));
vi.mock("@/lib/supabase/repositories/vidiq-appearances", () => ({
  insertVidiqAppearance: (...a: Parameters<typeof insertVidiqAppearance>) => insertVidiqAppearance(...a),
}));

import { POST } from "@/app/api/admin/vidiq-appearances/route";

function req(body: unknown) {
  return new Request("http://x/api/admin/vidiq-appearances", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/admin/vidiq-appearances", () => {
  it("400s on a missing topic", async () => {
    const res = await POST(req({ formatLabel: "talking_head_facts", firstSurfacedByShortsOsAt: "2026-05-01" }));
    expect(res.status).toBe(400);
  });
  it("inserts a valid appearance", async () => {
    const res = await POST(req({
      canonicalTopic: "ai tools", formatLabel: "talking_head_facts",
      firstSurfacedByShortsOsAt: "2026-05-01", firstSurfacedByVidiqAt: "2026-05-10",
    }));
    expect(res.status).toBe(201);
    expect(insertVidiqAppearance).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run it; verify it fails**

Run: `npx vitest run src/tests/api/admin-vidiq-appearances.test.ts`
Expected: FAIL — route module missing.

- [ ] **Step 8a: Export `FORMAT_LABELS` from `shorts-classifications.ts`**

`shorts-classifications.ts` exports only the `FormatLabel` *type* today (verified: `grep -n "FORMAT_LABELS" src/lib/supabase/repositories/shorts-classifications.ts` → no match). Add a runtime const that the route's zod enum can consume, and redefine the type from it so they can't drift. In `src/lib/supabase/repositories/shorts-classifications.ts`, replace the existing `export type FormatLabel = …` union with:
```ts
export const FORMAT_LABELS = [
  "narrated_storytelling", "talking_head_facts", "talking_head_advice",
  "compilation_montage", "transformation_reveal", "ranking_list", "before_after",
  "tutorial_quick", "pov_skit", "screen_record_walkthrough", "ai_voiceover_facts",
  "reaction", "interview_clip", "news_recap", "product_review", "meme_format",
  "live_capture", "other",
] as const;
export type FormatLabel = (typeof FORMAT_LABELS)[number];
```
(Same 18 values as the current union — derived from it so the type is unchanged. Run `npx tsc --noEmit` after to confirm no consumers broke.)

- [ ] **Step 8b: Implement the insert route**

```ts
// src/app/api/admin/vidiq-appearances/route.ts
import "server-only";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { insertVidiqAppearance } from "@/lib/supabase/repositories/vidiq-appearances";
import { FORMAT_LABELS, type FormatLabel } from "@/lib/supabase/repositories/shorts-classifications";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  canonicalTopic: z.string().min(1),
  formatLabel: z.enum(FORMAT_LABELS),
  firstSurfacedByShortsOsAt: z.string().min(1),
  firstSurfacedByVidiqAt: z.string().optional().nullable(),
  firstSurfacedBy1of10At: z.string().optional().nullable(),
  firstSurfacedByExplodingTopicsAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try { body = BodySchema.parse(await req.json()); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : "bad body" }, { status: 400 }); }

  const supabase = getServiceClient();
  const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);
  const row = await insertVidiqAppearance(supabase, {
    canonicalTopic: body.canonicalTopic,
    formatLabel: body.formatLabel as FormatLabel,
    firstSurfacedByShortsOsAt: new Date(body.firstSurfacedByShortsOsAt),
    firstSurfacedByVidiqAt: toDate(body.firstSurfacedByVidiqAt),
    firstSurfacedBy1of10At: toDate(body.firstSurfacedBy1of10At),
    firstSurfacedByExplodingTopicsAt: toDate(body.firstSurfacedByExplodingTopicsAt),
    notes: body.notes ?? null,
  });
  return Response.json({ ok: true, appearance: row }, { status: 201 });
}
```
(`z.enum(FORMAT_LABELS)` infers the literal union directly from the const, so `body.formatLabel` is already a `FormatLabel`; the cast is belt-and-suspenders, not an `any`.)

- [ ] **Step 9: Run it; verify it passes**

Run: `npx vitest run src/tests/api/admin-vidiq-appearances.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 10: Build the page + form (premium; empty state)**

Create `src/app/admin/moat-validation/log-form.tsx` (`"use client"`) — a compact form (topic, format select, our-surfacing date, optional external dates for VidIQ/1of10/Exploding Topics, notes) that POSTs to `/api/admin/vidiq-appearances` and refreshes (`router.refresh()`). Create `src/app/admin/moat-validation/page.tsx` (server, `force-dynamic`, AppShell + AdminSidebar + PageHeader): fetch `listVidiqAppearances`, compute `averageLagDays`, render the headline ("Average lead time: N days" or "Log your first appearance to measure lead time"), the `<LogForm />`, and a table of rows with per-row `earliestExternalLagDays`. Designed empty state when no rows. Use frontend-design + ui-ux-pro-max + shadcn skills.

- [ ] **Step 11: Typecheck + full test run + build**

Run: `npx tsc --noEmit && npx vitest run && env -u ANTHROPIC_BASE_URL npm run build`
Expected: tsc clean; vitest baseline + new moat tests pass; `/admin/moat-validation` is `ƒ`.

- [ ] **Step 12: Commit**

```bash
git add src/lib/admin/moat.ts src/tests/lib/moat.test.ts \
  src/lib/supabase/repositories/vidiq-appearances.ts src/lib/supabase/repositories/shorts-classifications.ts \
  src/app/api/admin/vidiq-appearances/route.ts src/tests/api/admin-vidiq-appearances.test.ts \
  src/app/admin/moat-validation/page.tsx src/app/admin/moat-validation/log-form.tsx
git commit -m "feat(plan-5-f): /admin/moat-validation (log form + lag table)"
```

### Task 13: `/admin/costs` (honest gate) + `/admin/prompt-versions` (honest gate)

**Files:**
- Create: `src/lib/admin/costs.ts`
- Test: `src/tests/lib/costs.test.ts`
- Create: `src/app/admin/costs/page.tsx`
- Create: `src/app/admin/prompt-versions/page.tsx`

- [ ] **Step 1: Write the failing test for quota aggregation**

```ts
// src/tests/lib/costs.test.ts
import { describe, it, expect } from "vitest";
import { aggregateQuotaByDay } from "@/lib/admin/costs";

describe("aggregateQuotaByDay", () => {
  it("sums quota_units per UTC day, sorted ascending", () => {
    const out = aggregateQuotaByDay([
      { started_at: "2026-05-02T09:00:00Z", quota_units: 100 },
      { started_at: "2026-05-01T09:00:00Z", quota_units: 50 },
      { started_at: "2026-05-01T18:00:00Z", quota_units: 30 },
    ]);
    expect(out).toEqual([
      { date: "2026-05-01", quota: 80 },
      { date: "2026-05-02", quota: 100 },
    ]);
  });
  it("returns [] for no runs", () => {
    expect(aggregateQuotaByDay([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx vitest run src/tests/lib/costs.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the aggregation**

```ts
// src/lib/admin/costs.ts
export interface DailyQuota { date: string; quota: number; }

/** Sum YouTube quota_units per UTC day (YYYY-MM-DD), sorted ascending. */
export function aggregateQuotaByDay(runs: Array<{ started_at: string; quota_units: number }>): DailyQuota[] {
  const byDay = new Map<string, number>();
  for (const r of runs) {
    const day = r.started_at.slice(0, 10); // ISO date prefix (UTC)
    byDay.set(day, (byDay.get(day) ?? 0) + (r.quota_units ?? 0));
  }
  return [...byDay.entries()]
    .map(([date, quota]) => ({ date, quota }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx vitest run src/tests/lib/costs.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Build `/admin/costs` (real quota + external links)**

Create `src/app/admin/costs/page.tsx` (server, `force-dynamic`, AppShell + AdminSidebar + PageHeader; frontend-design skills). Fetch `listRecentRuns(supabase, 500)` from `@/lib/supabase/repositories/ingestion-runs`, compute `aggregateQuotaByDay`, render: a **YouTube quota** card with a Recharts bar/area of daily quota + a 7-day total; then two clearly-labeled **"Tracked externally"** cards — AI Gateway (link `https://vercel.com/dashboard` → the project's AI Gateway observability) and Resend (link `https://resend.com/emails`) — each with one line explaining usage lives in that provider's dashboard. No fabricated token/cost numbers.

- [ ] **Step 6: Build `/admin/prompt-versions` (honest read-only stub)**

Create `src/app/admin/prompt-versions/page.tsx` (server, `force-dynamic`, AppShell + AdminSidebar + PageHeader; frontend-design skills). Import `CLASSIFIER_PROMPT_VERSION` from `@/lib/ingestion/classify-observations` and `CLASSIFIER_TOPIC_MODEL` / `CLASSIFIER_FORMAT_MODEL` from `@/lib/ai/models`. Render a read-only card: current classifier prompt version + the two model strings, and an honest callout: "Versioned history, per-version sampling accuracy, and rollback arrive once the classifier captures prompt versions. Today the classifier runs a single in-code prompt (version shown above)." No rollback button, no fake version list.

- [ ] **Step 7: Typecheck + full test run + build**

Run: `npx tsc --noEmit && npx vitest run && env -u ANTHROPIC_BASE_URL npm run build`
Expected: tsc clean; vitest baseline + costs test pass; `/admin/costs` and `/admin/prompt-versions` are `ƒ`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/admin/costs.ts src/tests/lib/costs.test.ts \
  src/app/admin/costs/page.tsx src/app/admin/prompt-versions/page.tsx
git commit -m "feat(plan-5-f): /admin/costs (quota + external links) + /admin/prompt-versions (honest stub)"
```

### Task 14: Full verification + handoff

**Files:**
- Create: `docs/superpowers/notes/2026-05-30-plan-5-phase-1-sub-f-handoff.md`

- [ ] **Step 1: Final verification sweep**

Run: `npx tsc --noEmit && npx vitest run && env -u ANTHROPIC_BASE_URL npm run build`
Expected: tsc clean, no `any` in source; vitest baseline holds (493 + the new F tests pass, the 11 pre-existing env-gated fails unchanged — no NEW failures); build passes, all new pages `ƒ` (Dynamic).

- [ ] **Step 2: Confirm no `any` crept in**

Run: `grep -rn ": any\|as any\|as unknown as" src/lib src/app src/components | grep -v ".test.ts"`
Expected: no matches in source (the `as never` casts in repo-typed boundaries are intentional and match existing convention; tests may use minimal casts).

- [ ] **Step 3: Preview screenshot pass (operator-gated; Vercel preview)**

On the deployed preview, capture: the 5 re-shelled legacy pages (sidebar present, correct active item, palette works), the full onboarding flow (guard → wizard steps → seeds watch-list/competitors → lands on `/mission-control?onboarded=1`), and the 4 admin pages (real data or honest empty/external states — no fabricated charts). Confirm the 9/10 premium bar on the onboarding wizard especially.

- [ ] **Step 4: Write the handoff note**

Create `docs/superpowers/notes/2026-05-30-plan-5-phase-1-sub-f-handoff.md` covering: what F shipped (the three threads); the operator-gated items done/outstanding (the `channels_onboarding` prod apply + types regen; the preview screenshot pass); any autonomous deviations; verification state (tsc/vitest/build); what's deferred (full Mission Control §4.8 + agent-status replacement, live onboarding scan feed, classifier prompt-version capture, cost persistence); and a copy-pasteable **Sub-phase G kickoff prompt** (per the phase-boundary handoff rule).

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/notes/2026-05-30-plan-5-phase-1-sub-f-handoff.md
git commit -m "docs(plan-5-f): Sub-phase F handoff note + Sub-phase G kickoff"
```

---

## Self-review (filled at write time)

**Spec coverage:** §2 shell → Tasks 1–5; §3 onboarding (migration/guard/wizard/finish/re-run) → Tasks 6–9; §4 admin (scoring/moat/costs/prompt-versions) → Tasks 11–13; AdminSidebar nav → Task 10; §6 verification → Tasks 9/11/12/13 per-task + Task 14. All spec sections map to a task.

**Placeholder scan:** No "TBD/TODO/handle appropriately". UI surfaces (wizard, admin pages) carry explicit data contracts + component responsibilities + the design-skill invocation rather than full premium JSX — this is intentional (the design skills generate the markup), and every such task names exact files, exact data sources, and exact acceptance. Two verify-before-write notes are flagged inline (Task 12 `FORMAT_LABELS` export; Task 5 orphan grep).

**Type consistency:** `CreatorGoal` defined in Task 6, reused in Tasks 7/9. `saveOnboarding`/`markOnboardingComplete` signatures match across Tasks 6/9. `ActionCounts`/`ScoreComponents` defined in Task 11 used consistently. `resolveActiveHref(pathname, hrefs)` signature consistent across Tasks 1/10. `VidiqAppearance` fields reused in Task 12 match the repo. `aggregateQuotaByDay` row shape matches `ingestion_runs` columns.
