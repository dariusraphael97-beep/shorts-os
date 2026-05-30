# Plan #5 Phase 1 Sub-phase E — Niche Finder UI + Digest Email + Sealed Predictions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Sub-phase D's scored `niche_clusters` into the user-facing Niche Finder (five §4.9 surfaces, new design-system shell, `/` → `/niches`), a weekly Resend digest email, and the sealed-prediction close-loop.

**Architecture:** New surfaces mount the design-system `AppShell` + a new `AppSidebar` (thin wrapper over the existing `Sidebar` primitive, like `AdminSidebar`). Server Components fetch via existing repos; client components handle interaction. Digest email is a React Email component rendered server-side and sent via Resend behind an env gate. Predictions + `niche_actions` logging close the loop via two crons.

**Tech Stack:** Next.js 16 (App Router, Server Components, route handlers, `redirect`), TypeScript strict (no `any`), Supabase service-role client, `resend` + `@react-email/components` + `@react-email/render`, Vitest, Tailwind v4 + shadcn design system, Framer-Motion primitives (`HoverLift`, `Tappable`).

**Spec:** `docs/superpowers/specs/2026-05-29-plan-5-phase-1-sub-e-design.md` — read it before starting.

---

## UI tasks: how to read this plan

The backend/logic tasks below give complete TDD code. The **UI surface tasks** (NicheCard, `/niches`, detail, watch-list, competitors, digest-preview, settings) intentionally specify the **data contract, the design-system pieces to compose, required interactions/states, and acceptance criteria — NOT literal JSX.** Premium UI (the 9/10 bar) is produced by invoking the **`frontend-design` + `ui-ux-pro-max` + `vercel:shadcn`** skills during implementation; hand-rolled generic markup is a failure. Each UI task ends with a screenshot-verified pass **against the Vercel preview deployment or a seeded local `.env.local`** — the pages 500 with blank local secrets (same wall as Sub-phase D), so a bare local `npm run dev` won't render them.

## Conventions to mirror (read these first)
- Shell: `src/components/layout/{app-shell,sidebar,page-header,command-palette}.tsx`; the Sub-phase D `AdminSidebar` at `src/app/admin/_components/admin-sidebar.tsx` is the exact pattern for `AppSidebar`.
- Existing rich card to extend: `src/components/compositions/niche-card.tsx` (already has badges + `VelocitySparkline` + `HoverLift`/`Tappable`).
- Repo pattern + error style: `src/lib/supabase/repositories/shorts-classifications.ts`.
- Cron + adapter pattern: `src/app/api/cron/cluster-niches/route.ts` + `src/lib/ingestion/run.ts` (`runWithIngestionLog`).
- API route convention (`/api/lab/*`, `/api/admin/*`): Zod + `force-dynamic`, no inline session check.
- Test pattern: `vi.mock("ai")` / inject deps; `src/tests/**/*.test.ts`; `npx vitest run <path>`.

## Existing integration points (verified)
- `listDigestRankedClusters(supabase, weekStart)`, `getClusterById`, `NicheCluster` shape — `repositories/niche-clusters.ts`.
- `getShortsObservationByVideoId` — `repositories/shorts-observations.ts`.
- `listActiveWatchedChannels` — `repositories/watched-channels.ts`; `addCompetitorChannel`/`listCompetitorChannels` — `repositories/competitor-channels.ts`.
- `insertNichePrediction({nicheClusterId, predictedViews7dLower, predictedViews7dUpper})`, `attachActualOutcome(supabase, predictionId, actualViews7d)`, `listPredictionsByCluster` — `repositories/niche-predictions.ts`.
- `topic_queue` repo (`listQueuedTopics`/`updateTopicState`/`getTopicById`) — needs an `insertManualTopic` added. `your_videos.source_niche_cluster_id` exists; `createVideoDraft` in `repositories/your-videos.ts`. Lab dispatch at `/api/lab/dispatch`.
- `CommandPalette` (`CommandPaletteGroup`/`CommandPaletteItem` props) — `src/components/layout/command-palette.tsx`. Sonner mounted in `src/app/layout.tsx`.
- `niche_actions` table exists (Sub-phase A); **no repo yet** — create it.

## Global rules
TS strict, no `any` in source. Prod migration (`digest_runs`) is operator-gated — STOP and get Darius's target-named in-chat OK before `apply_migration`. New crons/sends degrade gracefully without secrets. Branch `plan-5-phase-1-sub-e` (stacked on sub-d).

---

## Task ordering & dependencies
1. `AppSidebar` + `/` → `/niches` redirect (legacy cockpit → `/mission-control`)
2. `niche_actions` repo + `POST /api/niches/actions` (before the cards that call it)
3. `NicheCard` upgrade (thumbnails, stat row, "Why?", CTAs)
4. `/niches` hero (two-band feed)
5. `/niches/[id]` detail
6. `/niches/watch-list`
7. `/competitors`
8. `digest_runs` migration + repo (before the preview page)
9. `DigestEmail` React Email component + render
10. `/niches/digest-preview` page + `/api/admin/digest-preview`
11. `/api/cron/digest-send` (render → send → digest_runs → sealed predictions)
12. `/settings/niche-finder` + command-palette niche commands
13. `generated_from` → `topic_queue` seed + Lab dispatch handoff
14. `/api/cron/prediction-close` (+7d)
15. `vercel.ts` crons + full verification + handoff note

---

## Task 1: AppSidebar + `/` → `/niches` redirect

**Files:**
- Create: `src/components/layout/app-sidebar.tsx`
- Create: `src/app/mission-control/page.tsx` (moved legacy cockpit)
- Modify: `src/app/page.tsx` (→ redirect)
- Test: `src/tests/app/landing-redirect.test.ts`

- [ ] **Step 1: Move the legacy cockpit to `/mission-control`**

Create `src/app/mission-control/page.tsx` with the CURRENT contents of `src/app/page.tsx` (the `CockpitShell` + `TopicQueuePanel` + `TrendingPanel` home). Copy verbatim; keep its imports.

- [ ] **Step 2: Write the failing redirect test**

`src/tests/app/landing-redirect.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }) }));

import HomePage from "@/app/page";

describe("/ landing", () => {
  it("redirects to /niches", () => {
    expect(() => HomePage()).toThrow("REDIRECT:/niches");
  });
});
```

- [ ] **Step 3: Replace `src/app/page.tsx` with the redirect**

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/niches");
}
```

- [ ] **Step 4: Build `AppSidebar`** (thin wrapper over `Sidebar`, mirroring `AdminSidebar`)

`src/components/layout/app-sidebar.tsx`:
```tsx
"use client";
import { LayoutDashboard, Sparkles, FlaskConical, Film, Eye, Swords, Send, Settings } from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const NAV: SidebarItem[] = [
  { href: "/mission-control", label: "Mission Control", icon: LayoutDashboard },
  { href: "/niches", label: "Niches", icon: Sparkles },
  { href: "/lab", label: "Lab", icon: FlaskConical },
  { href: "/clips", label: "Clips", icon: Film },
  { href: "/niches/watch-list", label: "Watch-list", icon: Eye },
  { href: "/competitors", label: "Competitors", icon: Swords },
  { href: "/settings/niche-finder", label: "Settings", icon: Settings },
];

export function AppSidebar({ activeHref }: { activeHref: string }) {
  return <Sidebar items={NAV} activeHref={activeHref} footer={<ThemeToggle />} />;
}
```
(Confirm the lucide icon names exist; swap any that don't for the nearest equivalent. `Send`/`Posted` omitted — Posted is a Phase-4 surface.)

- [ ] **Step 5: Run test + tsc**

Run: `npx vitest run src/tests/app/landing-redirect.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 6: Commit**
```bash
git add src/components/layout/app-sidebar.tsx src/app/mission-control/page.tsx src/app/page.tsx src/tests/app/landing-redirect.test.ts
git commit -m "feat(plan-5-e): AppSidebar + redirect / → /niches (legacy cockpit → /mission-control)"
```

---

## Task 2: niche_actions repo + `POST /api/niches/actions`

**Files:**
- Create: `src/lib/supabase/repositories/niche-actions.ts`
- Create: `src/app/api/niches/actions/route.ts`
- Test: `src/tests/lib/supabase/niche-actions.test.ts` (repo shape), `src/tests/app/niche-actions-route.test.ts` (route validation)

Built BEFORE the cards so they wire to a real endpoint. `niche_actions` columns (Sub-phase A): `id`, `niche_cluster_id`, `action` (`viewed|investigated|generated_from|dismissed|hidden`), `actor`, `created_at`.

- [ ] **Step 1: Write the failing route test**

`src/tests/app/niche-actions-route.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn(() => ({})) }));
const recordNicheAction = vi.fn(async () => {});
vi.mock("@/lib/supabase/repositories/niche-actions", () => ({ recordNicheAction: (...a: unknown[]) => recordNicheAction(...a) }));

import { POST } from "@/app/api/niches/actions/route";

function req(body: unknown) {
  return new Request("http://x/api/niches/actions", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/niches/actions", () => {
  it("400s on invalid action", async () => {
    const res = await POST(req({ nicheClusterId: "11111111-1111-1111-1111-111111111111", action: "nope" }));
    expect(res.status).toBe(400);
  });
  it("records a valid action", async () => {
    const res = await POST(req({ nicheClusterId: "11111111-1111-1111-1111-111111111111", action: "dismissed" }));
    expect(res.status).toBe(200);
    expect(recordNicheAction).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL.**

- [ ] **Step 3: Write the repo** `src/lib/supabase/repositories/niche-actions.ts`:
```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type NicheActionType = "viewed" | "investigated" | "generated_from" | "dismissed" | "hidden";

export async function recordNicheAction(
  supabase: SupabaseClient,
  params: { nicheClusterId: string; action: NicheActionType; actor?: string | null },
): Promise<void> {
  const { error } = await supabase.from("niche_actions").insert({
    niche_cluster_id: params.nicheClusterId,
    action: params.action,
    actor: params.actor ?? "darius",
  });
  if (error) throw new Error(`recordNicheAction: ${error.message}`);
}

export async function countActionsByCluster(
  supabase: SupabaseClient,
  nicheClusterId: string,
): Promise<Record<NicheActionType, number>> {
  const { data, error } = await supabase
    .from("niche_actions").select("action").eq("niche_cluster_id", nicheClusterId);
  if (error) throw new Error(`countActionsByCluster: ${error.message}`);
  const out = { viewed: 0, investigated: 0, generated_from: 0, dismissed: 0, hidden: 0 };
  for (const r of (data ?? []) as Array<{ action: NicheActionType }>) out[r.action]++;
  return out;
}
```

- [ ] **Step 4: Write the route** `src/app/api/niches/actions/route.ts`:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { recordNicheAction } from "@/lib/supabase/repositories/niche-actions";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  nicheClusterId: z.string().uuid(),
  action: z.enum(["viewed", "investigated", "generated_from", "dismissed", "hidden"]),
});

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid action" }, { status: 400 });
  const supabase = getServiceClient();
  await recordNicheAction(supabase, { nicheClusterId: parsed.data.nicheClusterId, action: parsed.data.action });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run tests + tsc → green. Commit:**
```bash
git add src/lib/supabase/repositories/niche-actions.ts src/app/api/niches/actions/route.ts src/tests/app/niche-actions-route.test.ts
git commit -m "feat(plan-5-e): niche_actions repo + POST /api/niches/actions"
```

---

## Task 3: NicheCard upgrade (thumbnails, stat row, "Why?", CTAs)

**Files:**
- Modify: `src/components/compositions/niche-card.tsx`
- Create: `src/components/compositions/why-this-niche.tsx` (collapsible explainability)
- Test: `src/tests/components/why-this-niche.test.tsx` (pure render of signals)

**Design directive:** Invoke `frontend-design` + `ui-ux-pro-max` + `vercel:shadcn`. The card already has title/summary/badges/sparkline (`HoverLift`/`Tappable`). EXTEND it — do not regress the existing props.

**Data contract — extend `NicheCardProps` with:**
```ts
exampleThumbnails: string[];   // YouTube video IDs → https://i.ytimg.com/vi/{id}/hqdefault.jpg, render with plain <img>
stats: { channelCount: number; avgVelocity24h: number | null; firstSeenAt: string | null; productionFit: string };
explainability: Record<string, unknown>;  // niche_clusters.explainability_top_signals
canGenerate: boolean;          // production_fit === 'native'
onInvestigate?: () => void; onGenerate?: () => void; onDismiss?: () => void;
```

**Requirements:**
- 3 example thumbnails (plain `<img src="https://i.ytimg.com/vi/{id}/hqdefault.jpg">`), hover-lift, click → `https://youtube.com/watch?v={id}` (new tab).
- Stat row: channels · avg velocity · first seen (relative) · production-fit badge (reuse `ProductionFitBadge`).
- Collapsible "Why this niche?" → renders the `<WhyThisNiche signals={explainability} />` component (Step 1).
- Footer CTAs: Investigate · Generate now (disabled unless `canGenerate`) · Dismiss. Buttons call the `on*` callbacks.
- Empty/skeleton handled by the consuming page, not the card.

- [ ] **Step 1: TDD the pure `WhyThisNiche` signal renderer**

`src/tests/components/why-this-niche.test.tsx` (vitest + jsdom — confirm jsdom env; if the project's vitest is node-only, test the pure `formatSignals(signals)` helper instead and render-snapshot separately):
```ts
import { describe, it, expect } from "vitest";
import { formatSignals } from "@/components/compositions/why-this-niche";

describe("formatSignals", () => {
  it("turns contributions into ranked, labeled rows (available first, by weight)", () => {
    const rows = formatSignals({
      nicheAgeDays: 10,
      contributions: {
        provenScore: { value: 0.33, weight: 0.25, available: true },
        firstMoverScore: { value: 0, weight: 0.25, available: false },
        saturationInverse: { value: 0.62, weight: 0.15, available: true },
      },
    });
    expect(rows[0].available).toBe(true);
    expect(rows.find((r) => r.key === "firstMoverScore")?.available).toBe(false);
    expect(rows.map((r) => r.key)).toContain("provenScore");
  });
});
```

- [ ] **Step 2: Run, verify FAIL. Implement `why-this-niche.tsx`** with an exported pure `formatSignals(signals: Record<string, unknown>): Array<{ key: string; label: string; value: number; weight: number; available: boolean }>` (sort available-first then by weight desc; map keys → human labels) AND a `WhyThisNiche` component that renders those rows (a small bar per signal, dimmed when unavailable, with the niche-age line). Use the design skills for the visual.

- [ ] **Step 3: Run test → green.**

- [ ] **Step 4: Extend `NicheCard`** per the data contract + requirements above (design skills for JSX). Keep existing props working.

- [ ] **Step 5: tsc → clean. Commit:**
```bash
git add src/components/compositions/niche-card.tsx src/components/compositions/why-this-niche.tsx src/tests/components/why-this-niche.test.tsx
git commit -m "feat(plan-5-e): NicheCard upgrade — thumbnails, stat row, Why-this-niche, CTAs"
```

---

## Task 4: `/niches` hero (two-band feed)

**Files:**
- Create: `src/app/niches/page.tsx` (Server Component — fetch)
- Create: `src/app/niches/niches-feed.tsx` (Client — interaction/shortcuts/actions)
- Create: `src/lib/niches/current-week.ts` + test `src/tests/lib/niches/current-week.test.ts`

**Design directive:** `frontend-design` + `ui-ux-pro-max` + `vercel:shadcn`. This is the **hero surface — the 9/10 bar.** Lead with the ONE thing: this week's niches.

- [ ] **Step 1: TDD the week-selection helper** (pure)

`src/tests/lib/niches/current-week.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isoWeekStart, partitionBands, type BandableCluster } from "@/lib/niches/current-week";

const c = (id: string, niche: number, proven: number | null, fm: number | null): BandableCluster =>
  ({ id, niche_score: niche, proven_score: proven, first_mover_score: fm, digest_rank: 1 });

describe("isoWeekStart", () => {
  it("returns the Monday (UTC) as YYYY-MM-DD", () => {
    expect(isoWeekStart(new Date("2026-05-29T00:00:00Z"))).toBe("2026-05-25");
  });
});

describe("partitionBands", () => {
  it("splits proven (proven_score>0.6) from trending-unproven (first_mover>0.7)", () => {
    const { proven, unproven } = partitionBands([c("a", 0.9, 0.7, 0.2), c("b", 0.8, 0.3, 0.9), c("c", 0.5, 0.2, 0.1)]);
    expect(proven.map((x) => x.id)).toEqual(["a"]);
    expect(unproven.map((x) => x.id)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run, verify FAIL. Implement `src/lib/niches/current-week.ts`:**
```ts
export function isoWeekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - day);
  return x.toISOString().slice(0, 10);
}

export interface BandableCluster {
  id: string;
  niche_score: number | null;
  proven_score: number | null;
  first_mover_score: number | null;
  digest_rank: number | null;
}

export function partitionBands<T extends BandableCluster>(clusters: T[]): { proven: T[]; unproven: T[] } {
  const proven = clusters.filter((c) => (c.proven_score ?? 0) > 0.6);
  const unproven = clusters.filter((c) => (c.proven_score ?? 0) <= 0.6 && (c.first_mover_score ?? 0) > 0.7);
  return { proven, unproven };
}
```
Run test → green.

- [ ] **Step 3: Server Component `src/app/niches/page.tsx`** — fetch, then render `<NichesFeed>`.
  - `const supabase = getServiceClient();`
  - Resolve the week: `listDigestRankedClusters(supabase, isoWeekStart(new Date()))`; if empty, query the most-recent `week_start` present and use that (add `getLatestWeekStart(supabase)` to the niche-clusters repo — a `select week_start order desc limit 1`).
  - `const { proven, unproven } = partitionBands(clusters);`
  - For each cluster, derive `exampleThumbnails = (example_video_ids as string[]).slice(0,3)`, `velocityValues` (from `avg_velocity_24h` history if available else `[]`), and pass `explainability_top_signals`.
  - `export const dynamic = "force-dynamic";`
  - Compose with `AppShell` + `<AppSidebar activeHref="/niches" />` + `PageHeader title="This week's niches" description="{N} clusters · refreshed Monday"`. Pass `proven`/`unproven` arrays to `<NichesFeed>`.

- [ ] **Step 4: Client `src/app/niches/niches-feed.tsx`** (`"use client"`):
  - Renders two labeled bands ("Proven + trending", "Trending, unproven" with an explicit unproven badge) of `<NicheCard>`s (staggered via the motion primitives).
  - Card callbacks POST to `/api/niches/actions`: open/Investigate → `investigated` then `router.push('/niches/'+id)`; Dismiss → `dismissed` + optimistic hide + toast; Generate → `generated_from` + POST `/api/niches/[id]/generate` (Task 13; until then, toast "coming"). Fire `viewed` on mount per visible card (debounced/once).
  - Keyboard shortcuts `j/k` (move focus), `Enter` (open), `g` (generate if native), `x` (dismiss).
  - Empty state (no clusters this week) + skeletons.

**Acceptance:** `/niches` renders both bands with upgraded cards, actions POST correctly (verify Network tab), shortcuts work, empty/skeleton states present, 9/10 visual.

- [ ] **Step 5: tsc + week-helper test green. Verify on preview/seeded env, screenshot. Commit:**
```bash
git add src/app/niches/page.tsx src/app/niches/niches-feed.tsx src/lib/niches/current-week.ts src/tests/lib/niches/current-week.test.ts src/lib/supabase/repositories/niche-clusters.ts
git commit -m "feat(plan-5-e): /niches two-band hero feed + week helpers"
```

---

## Task 5: `/niches/[id]` detail

**Files:**
- Create: `src/app/niches/[id]/page.tsx` (Server)
- Create: `src/app/niches/[id]/detail-actions.tsx` (Client action panel)

**Design directive:** `frontend-design` + `ui-ux-pro-max` + `vercel:shadcn`. 40/35/25 columns.

- [ ] **Step 1: Server Component fetch:**
  - `const cluster = await getClusterById(supabase, params.id);` (404 via `notFound()` if null).
  - Cluster videos: `await Promise.all((cluster.example_video_ids as string[]).map((vid) => getShortsObservationByVideoId(supabase, vid)))`, filter nulls.
  - Predictions: `listPredictionsByCluster(supabase, params.id)` → show the open prediction's `[lower, upper]` band if present.
  - Related niches: query `niche_clusters` same `week_start` where `canonical_topic = cluster.canonical_topic OR format_label = cluster.format_label`, exclude self, limit 6 (add `listRelatedClusters` to the repo).
  - `export const dynamic = "force-dynamic";` Compose `AppShell` + `<AppSidebar activeHref="/niches" />` + breadcrumb back to `/niches`.

- [ ] **Step 2: Layout (design skills):**
  - **Col 1 (40%)** — cluster videos as expandable rows (thumbnail, title, channel, views, velocity; expand → description).
  - **Col 2 (35%)** — stacked "Why?" cards (reuse `<WhyThisNiche>` + per-signal detail).
  - **Col 3 (25%)** — `<DetailActions>` panel: Generate (native only) · Add to my niches (`investigated`) · Hide (`hidden`). Sealed-prediction band card.
  - Related-niches strip at the bottom (mini `NicheCard`s or a compact list).

- [ ] **Step 3: `detail-actions.tsx`** (`"use client"`) — buttons POST `/api/niches/actions` with the right action + toasts; Generate calls the Task-13 route (gated).

**Acceptance:** detail renders three columns, videos expand, prediction band shows when present, actions POST, related strip populates. 9/10 visual.

- [ ] **Step 4: tsc clean. Verify on preview, screenshot. Commit:**
```bash
git add src/app/niches/[id]/ src/lib/supabase/repositories/niche-clusters.ts
git commit -m "feat(plan-5-e): /niches/[id] detail (videos · why · actions · related)"
```

---

## Task 6: `/niches/watch-list`

**Files:**
- Create: `src/app/niches/watch-list/page.tsx` (Server)
- Create: `src/app/niches/watch-list/watch-list-client.tsx` (Client — filter + detail + add modal)

**Design directive:** design skills. 320px filterable list + selected-channel detail.

- [ ] **Step 1: Server fetch** — `listActiveWatchedChannels(supabase, 1000)`; pass to client. `AppShell` + `<AppSidebar activeHref="/niches/watch-list" />` + `PageHeader`. `force-dynamic`.

- [ ] **Step 2: Client** — left 320px filterable list of `watched_channels` (filter by handle/title, sort by growth/cadence); right detail for the selected channel: subscriber-growth display (`subscriber_growth_30d`/`_90d`), `upload_cadence_per_week`, `outlier_rate_60d`, recent videos (if available). `+ Add channel` opens a modal (shadcn Dialog) → `POST /api/watch-list/channels` (existing) → `router.refresh()` + toast.

**Acceptance:** list filters, selecting shows detail, add-channel modal posts + refreshes. 9/10 visual.

- [ ] **Step 3: tsc clean. Verify on preview, screenshot. Commit:**
```bash
git add src/app/niches/watch-list/
git commit -m "feat(plan-5-e): /niches/watch-list (filterable list + channel detail + add modal)"
```

---

## Task 7: `/competitors`

**Files:**
- Create: `src/app/competitors/page.tsx` (Server)
- Create: `src/app/competitors/competitors-client.tsx` (Client — add modal)

**Design directive:** design skills. Thinnest of the five surfaces — keep it clean, not padded.

- [ ] **Step 1: Server fetch** — `listCompetitorChannels(supabase)`; `AppShell` + `<AppSidebar activeHref="/competitors" />` + `PageHeader`. `force-dynamic`.

- [ ] **Step 2: Client** — competitor list, recent-uploads strip per channel (if data; else a tasteful empty state), pattern-change hints placeholder copy (no analysis engine yet — show "watching for changes"). `+ Add competitor` modal → `POST /api/watch-list/competitors` (existing) → refresh + toast.

**Acceptance:** list renders, add-competitor modal posts + refreshes, empty states are designed (not blank). 9/10 visual.

- [ ] **Step 3: tsc clean. Verify on preview, screenshot. Commit:**
```bash
git add src/app/competitors/
git commit -m "feat(plan-5-e): /competitors (list + add modal + designed empty states)"
```

---

## Task 8: `digest_runs` migration + repo

**Files:**
- Create: `supabase/migrations/20260529000003_digest_runs.sql`
- Create: `src/lib/supabase/repositories/digest-runs.ts`
- Regenerate: `src/lib/supabase/types.ts`

- [ ] **Step 1: Write the migration** `supabase/migrations/20260529000003_digest_runs.sql`:
```sql
-- Weekly digest send/preview history (Plan #5 Sub-phase E).
create table if not exists public.digest_runs (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null,
  sent_at     timestamptz not null default now(),
  recipient   text,
  status      text not null check (status in ('sent','skipped','failed','preview')),
  cluster_ids jsonb not null default '[]'::jsonb,
  html        text,
  error       text
);
create index if not exists digest_runs_week_idx on public.digest_runs (week_start, sent_at desc);
```

- [ ] **Step 2: CHECKPOINT — operator-gated prod apply.** Surface to Darius: "About to apply migration `digest_runs` to prod `jfmjppzjicvbpnlkmxbg`." Wait for the explicit, target-naming OK. Then `apply_migration` (name `digest_runs`). Then regenerate `src/lib/supabase/types.ts` via the Supabase MCP `generate_typescript_types` and overwrite the file.

- [ ] **Step 3: Write the repo** `src/lib/supabase/repositories/digest-runs.ts`:
```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DigestStatus = "sent" | "skipped" | "failed" | "preview";

export interface DigestRun {
  id: string;
  week_start: string;
  sent_at: string;
  recipient: string | null;
  status: DigestStatus;
  cluster_ids: string[];
  html: string | null;
  error: string | null;
}

export async function insertDigestRun(
  supabase: SupabaseClient,
  params: { weekStart: string; recipient: string | null; status: DigestStatus; clusterIds: string[]; html: string | null; error?: string | null },
): Promise<DigestRun> {
  const { data, error } = await supabase
    .from("digest_runs")
    .insert({
      week_start: params.weekStart, recipient: params.recipient, status: params.status,
      cluster_ids: params.clusterIds, html: params.html, error: params.error ?? null,
    })
    .select().single();
  if (error) throw new Error(`insertDigestRun: ${error.message}`);
  return data as DigestRun;
}

export async function listDigestRuns(supabase: SupabaseClient, limit: number): Promise<DigestRun[]> {
  const { data, error } = await supabase
    .from("digest_runs").select().order("sent_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`listDigestRuns: ${error.message}`);
  return (data ?? []) as DigestRun[];
}

export async function getLatestDigestRun(supabase: SupabaseClient): Promise<DigestRun | null> {
  const { data, error } = await supabase
    .from("digest_runs").select().order("sent_at", { ascending: false }).limit(1).maybeSingle();
  if (error && (error as { code?: string }).code !== "PGRST116") throw new Error(`getLatestDigestRun: ${error.message}`);
  return (data as DigestRun | null) ?? null;
}
```

- [ ] **Step 4: tsc clean. Commit:**
```bash
git add supabase/migrations/20260529000003_digest_runs.sql src/lib/supabase/repositories/digest-runs.ts src/lib/supabase/types.ts
git commit -m "feat(plan-5-e): digest_runs table + repo"
```

---

## Task 9: `DigestEmail` component + cluster→email mapping

**Files:**
- Create: `src/lib/digest/build-email-props.ts` (pure mapping)
- Create: `src/emails/digest-email.tsx` (React Email component)
- Create: `src/lib/digest/render-digest.ts` (render to HTML + text)
- Test: `src/tests/lib/digest/build-email-props.test.ts`

- [ ] **Step 1: TDD the pure mapping** `src/tests/lib/digest/build-email-props.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildEmailProps, type DigestClusterRow } from "@/lib/digest/build-email-props";

const row = (over: Partial<DigestClusterRow>): DigestClusterRow => ({
  id: "c1", canonical_topic: "ai tools", format_label: "ai_voiceover_facts", niche_score: 0.7,
  proven_score: 0.7, first_mover_score: 0.2, channel_count: 5, avg_views: 12345,
  production_fit: "native", discovery_state: "public", digest_rank: 1, example_video_ids: ["v1"], ...over,
});

describe("buildEmailProps", () => {
  it("uses digest_rank #1 as hero and the rest as condensed", () => {
    const props = buildEmailProps("2026-05-25", [row({ id: "a", digest_rank: 2 }), row({ id: "b", digest_rank: 1 })]);
    expect(props.hero?.id).toBe("b");
    expect(props.rest.map((r) => r.id)).toEqual(["a"]);
    expect(props.weekStart).toBe("2026-05-25");
  });
  it("labels each niche with its band", () => {
    const props = buildEmailProps("2026-05-25", [row({ id: "a", digest_rank: 1, proven_score: 0.3, first_mover_score: 0.9 })]);
    expect(props.hero?.band).toBe("unproven");
  });
  it("returns hero=null for an empty week", () => {
    expect(buildEmailProps("2026-05-25", []).hero).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify FAIL. Implement `src/lib/digest/build-email-props.ts`:**
```ts
export interface DigestClusterRow {
  id: string; canonical_topic: string; format_label: string; niche_score: number | null;
  proven_score: number | null; first_mover_score: number | null; channel_count: number;
  avg_views: number | null; production_fit: string; discovery_state: string;
  digest_rank: number | null; example_video_ids: string[];
}
export interface DigestNiche {
  id: string; topic: string; format: string; band: "proven" | "unproven";
  channelCount: number; avgViews: number | null; productionFit: string; thumbnailId: string | null;
}
export interface DigestEmailProps { weekStart: string; hero: DigestNiche | null; rest: DigestNiche[] }

function toNiche(r: DigestClusterRow): DigestNiche {
  return {
    id: r.id, topic: r.canonical_topic, format: r.format_label,
    band: (r.proven_score ?? 0) > 0.6 ? "proven" : "unproven",
    channelCount: r.channel_count, avgViews: r.avg_views, productionFit: r.production_fit,
    thumbnailId: r.example_video_ids[0] ?? null,
  };
}

export function buildEmailProps(weekStart: string, rows: DigestClusterRow[]): DigestEmailProps {
  const ranked = [...rows].filter((r) => r.digest_rank !== null).sort((a, b) => (a.digest_rank! - b.digest_rank!));
  if (ranked.length === 0) return { weekStart, hero: null, rest: [] };
  return { weekStart, hero: toNiche(ranked[0]), rest: ranked.slice(1).map(toNiche) };
}
```
Run test → green.

- [ ] **Step 3: Build `src/emails/digest-email.tsx`** — a `@react-email/components` component (`Html`/`Head`/`Body`/`Container`/`Section`/`Row`/`Heading`/`Text`/`Button`/`Img`) taking `DigestEmailProps`. Hero niche prominent (thumbnail via `https://i.ytimg.com/vi/{thumbnailId}/hqdefault.jpg`), then condensed rows; each links to `{APP_URL}/niches/{id}`; unproven niches carry an explicit "unproven" pill. Table layout, design-system colors inline (email clients ignore CSS vars — hardcode hex from `globals.css`). Use the design skills for polish.

- [ ] **Step 4: `src/lib/digest/render-digest.ts`:**
```ts
import "server-only";
import { render } from "@react-email/render";
import { DigestEmail } from "@/emails/digest-email";
import type { DigestEmailProps } from "@/lib/digest/build-email-props";

export async function renderDigest(props: DigestEmailProps): Promise<{ html: string; text: string }> {
  const html = await render(DigestEmail(props));
  const text = await render(DigestEmail(props), { plainText: true });
  return { html, text };
}
```

- [ ] **Step 5: tsc clean; mapping test green. Commit:**
```bash
git add src/lib/digest/build-email-props.ts src/emails/digest-email.tsx src/lib/digest/render-digest.ts src/tests/lib/digest/build-email-props.test.ts
git commit -m "feat(plan-5-e): DigestEmail component + cluster→props mapping + render"
```

---

## Task 10: `/niches/digest-preview` + `/api/admin/digest-preview`

**Files:**
- Create: `src/app/api/admin/digest-preview/route.ts` (render-only)
- Create: `src/app/niches/digest-preview/page.tsx` (Server)
- Create: `src/app/niches/digest-preview/preview-client.tsx` (Client — week dropdown + phone/desktop frames + resend)

- [ ] **Step 1: Render-only API** `src/app/api/admin/digest-preview/route.ts`:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { listDigestRankedClusters } from "@/lib/supabase/repositories/niche-clusters";
import { buildEmailProps, type DigestClusterRow } from "@/lib/digest/build-email-props";
import { renderDigest } from "@/lib/digest/render-digest";

export const dynamic = "force-dynamic";
const BodySchema = z.object({ weekStart: z.string() });

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "weekStart required" }, { status: 400 });
  const supabase = getServiceClient();
  const clusters = await listDigestRankedClusters(supabase, parsed.data.weekStart);
  const { html } = await renderDigest(buildEmailProps(parsed.data.weekStart, clusters as unknown as DigestClusterRow[]));
  return NextResponse.json({ ok: true, html });
}
```

- [ ] **Step 2: Page (Server)** — `listDigestRuns(supabase, 12)` for the dropdown of past weeks; default to the latest week with digest-ranked clusters. `AppShell` + `<AppSidebar activeHref="/niches" />` + `PageHeader`. `force-dynamic`. Pass available weeks + initial HTML to the client.

- [ ] **Step 3: Client (design skills)** — week dropdown (re-POSTs `/api/admin/digest-preview` on change, sets `iframe srcDoc`), phone (375px) + desktop (640px) preview frames side by side, rate-limited "Resend now" button → `POST /api/admin/digest-send?force=1` (Task 11) with a client cooldown + toast.

**Acceptance:** dropdown switches weeks, both frames render the email HTML, resend is rate-limited. 9/10 visual.

- [ ] **Step 4: tsc clean. Verify on preview, screenshot. Commit:**
```bash
git add src/app/api/admin/digest-preview/ src/app/niches/digest-preview/
git commit -m "feat(plan-5-e): /niches/digest-preview + render-only preview route"
```

---

## Task 11: `/api/cron/digest-send` (render → send → digest_runs → sealed predictions)

**Files:**
- Create: `src/lib/digest/prediction-interval.ts` (pure heuristic) + test
- Create: `src/lib/digest/send-digest.ts` (adapter — injected render/send/repo deps) + test
- Create: `src/app/api/cron/digest-send/route.ts`

- [ ] **Step 1: TDD the cold-start prediction interval** `src/tests/lib/digest/prediction-interval.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { predictionInterval } from "@/lib/digest/prediction-interval";

describe("predictionInterval", () => {
  it("brackets avg_views with documented k-factors (0.4×..3.0×)", () => {
    expect(predictionInterval(10000, null)).toEqual({ lower: 4000, upper: 30000 });
  });
  it("widens the upper bound with higher velocity", () => {
    const slow = predictionInterval(10000, 1);
    const fast = predictionInterval(10000, 8);
    expect(fast.upper).toBeGreaterThan(slow.upper);
  });
  it("floors at 0 and handles null avg_views", () => {
    expect(predictionInterval(null, null)).toEqual({ lower: 0, upper: 0 });
  });
});
```

- [ ] **Step 2: Run, verify FAIL. Implement `src/lib/digest/prediction-interval.ts`:**
```ts
// Cold-start sealed-prediction band. No historical outcomes yet, so this is a transparent
// heuristic: lower = 0.4× avg_views; upper = (3.0 + velocityBoost)× avg_views, where a higher
// 24h velocity widens the optimistic bound. Recorded k-factors make the band auditable later.
export const PREDICTION_K = { lower: 0.4, upperBase: 3.0, velocityWeight: 0.25 } as const;

export function predictionInterval(avgViews: number | null, avgVelocity24h: number | null): { lower: number; upper: number } {
  if (!avgViews || avgViews <= 0) return { lower: 0, upper: 0 };
  const velocityBoost = Math.max(0, (avgVelocity24h ?? 0)) * PREDICTION_K.velocityWeight;
  return {
    lower: Math.round(avgViews * PREDICTION_K.lower),
    upper: Math.round(avgViews * (PREDICTION_K.upperBase + velocityBoost)),
  };
}
```
Run test → green.

- [ ] **Step 3: TDD the send adapter** `src/tests/lib/digest/send-digest.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runDigestSend } from "@/lib/digest/send-digest";

const cluster = (id: string) => ({ id, canonical_topic: "t", format_label: "ai_voiceover_facts", niche_score: 0.7, proven_score: 0.7, first_mover_score: 0.2, channel_count: 3, avg_views: 1000, avg_velocity_24h: 2, production_fit: "native", discovery_state: "public", digest_rank: 1, example_video_ids: ["v"] });

function deps(over = {}) {
  return {
    weekStart: "2026-05-25", recipient: "me@example.com", canSend: true,
    fetchClusters: vi.fn(async () => [cluster("a")]),
    renderHtml: vi.fn(async () => ({ html: "<p>hi</p>", text: "hi" })),
    send: vi.fn(async () => ({ id: "email_1" })),
    insertDigestRun: vi.fn(async () => {}),
    insertPrediction: vi.fn(async () => {}),
    ...over,
  };
}

describe("runDigestSend", () => {
  it("sends, logs a 'sent' run, and writes one prediction per cluster", async () => {
    const d = deps();
    const res = await runDigestSend(d);
    expect(d.send).toHaveBeenCalledOnce();
    expect(d.insertDigestRun).toHaveBeenCalledWith(expect.objectContaining({ status: "sent" }));
    expect(d.insertPrediction).toHaveBeenCalledTimes(1);
    expect(res.status).toBe("sent");
  });
  it("skips (no send, no prediction) on an empty week", async () => {
    const d = deps({ fetchClusters: vi.fn(async () => []) });
    const res = await runDigestSend(d);
    expect(res.status).toBe("skipped");
    expect(d.send).not.toHaveBeenCalled();
    expect(d.insertPrediction).not.toHaveBeenCalled();
  });
  it("logs 'skipped' when canSend is false (no RESEND key)", async () => {
    const d = deps({ canSend: false });
    const res = await runDigestSend(d);
    expect(d.send).not.toHaveBeenCalled();
    expect(d.insertDigestRun).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped" }));
  });
  it("records 'failed' and does not throw when send rejects", async () => {
    const d = deps({ send: vi.fn(async () => { throw new Error("resend down"); }) });
    const res = await runDigestSend(d);
    expect(res.status).toBe("failed");
    expect(d.insertDigestRun).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });
});
```

- [ ] **Step 4: Run, verify FAIL. Implement `src/lib/digest/send-digest.ts`:**
```ts
import "server-only";
import { buildEmailProps, type DigestClusterRow } from "@/lib/digest/build-email-props";
import { predictionInterval } from "@/lib/digest/prediction-interval";

type ClusterRow = DigestClusterRow & { avg_velocity_24h: number | null };

export interface DigestSendDeps {
  weekStart: string;
  recipient: string | null;
  canSend: boolean;
  fetchClusters: () => Promise<ClusterRow[]>;
  renderHtml: (props: ReturnType<typeof buildEmailProps>) => Promise<{ html: string; text: string }>;
  send: (args: { to: string; html: string; text: string; subject: string }) => Promise<{ id: string }>;
  insertDigestRun: (r: { weekStart: string; recipient: string | null; status: "sent" | "skipped" | "failed"; clusterIds: string[]; html: string | null; error?: string | null }) => Promise<void>;
  insertPrediction: (p: { nicheClusterId: string; predictedViews7dLower: number; predictedViews7dUpper: number }) => Promise<void>;
}

export interface DigestSendResult { status: "sent" | "skipped" | "failed"; clusterCount: number }

export async function runDigestSend(deps: DigestSendDeps): Promise<DigestSendResult> {
  const clusters = await deps.fetchClusters();
  const clusterIds = clusters.map((c) => c.id);
  if (clusters.length === 0) {
    await deps.insertDigestRun({ weekStart: deps.weekStart, recipient: deps.recipient, status: "skipped", clusterIds: [], html: null });
    return { status: "skipped", clusterCount: 0 };
  }
  const props = buildEmailProps(deps.weekStart, clusters);
  const { html, text } = await deps.renderHtml(props);

  if (!deps.canSend || !deps.recipient) {
    await deps.insertDigestRun({ weekStart: deps.weekStart, recipient: deps.recipient, status: "skipped", clusterIds, html });
    return { status: "skipped", clusterCount: clusters.length };
  }

  try {
    await deps.send({ to: deps.recipient, html, text, subject: `This week's niches — ${deps.weekStart}` });
  } catch (e) {
    await deps.insertDigestRun({ weekStart: deps.weekStart, recipient: deps.recipient, status: "failed", clusterIds, html, error: e instanceof Error ? e.message : String(e) });
    return { status: "failed", clusterCount: clusters.length };
  }

  await deps.insertDigestRun({ weekStart: deps.weekStart, recipient: deps.recipient, status: "sent", clusterIds, html });
  // Sealed predictions: one per surfaced cluster (best-effort; a failure here doesn't unsend).
  for (const c of clusters) {
    const { lower, upper } = predictionInterval(c.avg_views, c.avg_velocity_24h);
    await deps.insertPrediction({ nicheClusterId: c.id, predictedViews7dLower: lower, predictedViews7dUpper: upper });
  }
  return { status: "sent", clusterCount: clusters.length };
}
```

- [ ] **Step 5: Write the route** `src/app/api/cron/digest-send/route.ts` — `assertCronAuth` (cron) OR allow `?force=1` from the admin preview resend; `getServiceClient`; `loadEnv()` for `RESEND_API_KEY` + `DIGEST_RECIPIENT`; wire `runDigestSend` with: `fetchClusters` = `listDigestRankedClusters(supabase, isoWeekStart(new Date()))`, `renderHtml` = `renderDigest`, `send` = a thin `resend.emails.send({ from: 'onboarding@resend.dev', to, subject, html, text })`, `insertDigestRun` = the repo, `insertPrediction` = `insertNichePrediction`. `canSend = !!env.RESEND_API_KEY`. `maxDuration = 300`. Return `{ ok: true, result }`.

- [ ] **Step 6: Run digest tests + tsc → green. Commit:**
```bash
git add src/lib/digest/prediction-interval.ts src/lib/digest/send-digest.ts src/app/api/cron/digest-send/route.ts src/tests/lib/digest/
git commit -m "feat(plan-5-e): digest-send cron — render→send→log→sealed predictions"
```

---

## Task 12: `/settings/niche-finder` + command-palette niche commands

**Files:**
- Create: `src/app/settings/niche-finder/page.tsx` (Server)
- Create: `src/app/settings/niche-finder/settings-client.tsx` (Client)
- Modify: wherever the app mounts `CommandPalette` (find via `grep -rl "CommandPalette" src/app src/components`) to add a niche command group.

**Design directive:** design skills.

- [ ] **Step 1: Settings page** — read env-derived config server-side (`DIGEST_RECIPIENT`, digest enabled, current classifier model strings from `@/lib/ai/models`) and pass to the client. `AppShell` + `<AppSidebar activeHref="/settings/niche-finder" />` + `PageHeader`. `force-dynamic`.

- [ ] **Step 2: Settings client** — sections: Digest (toggle, recipient email **shown read-only with an "env-managed" note when sourced from `DIGEST_RECIPIENT`** — be honest, no fake save), send-time display ("Mondays 12:00 UTC"), classifier-model display (the runtime-swappable strings, read-only), and a "Reset this week" button → `POST /api/admin/trigger-ingestion` with `{ job: "cluster_niches" }` (reuses Sub-phase D's trigger). Toasts on actions.

- [ ] **Step 3: Command-palette niche group** — add a `CommandPaletteGroup` (read `src/components/layout/command-palette.tsx` for the exact `CommandPaletteGroup`/`CommandPaletteItem` shape) with items: "Niches: this week" → `/niches`, "Watch-list: add channel" → `/niches/watch-list`, "Digest: preview latest" → `/niches/digest-preview`, "Competitors: add channel" → `/competitors`, "Settings: niche finder" → `/settings/niche-finder`. Wire wherever the palette items are currently assembled. Add global `g n` → `/niches` if the palette/shortcut layer supports it (follow existing shortcut wiring; skip if none).

**Acceptance:** settings render honestly (no fake-save on env fields), reset triggers a cluster run, palette shows the niche group and navigates. 9/10 visual.

- [ ] **Step 4: tsc clean. Verify on preview, screenshot. Commit:**
```bash
git add src/app/settings/niche-finder/ src/components/layout/command-palette.tsx
git commit -m "feat(plan-5-e): /settings/niche-finder + command-palette niche commands"
```

---

## Task 13: `generated_from` → topic_queue seed + Lab dispatch handoff

**Files:**
- Modify: `src/lib/supabase/repositories/topic-queue.ts` (add `insertManualTopic`)
- Create: `src/lib/niches/cluster-brief.ts` (pure cluster→brief mapping) + test
- Create: `src/app/api/niches/[id]/generate/route.ts`

- [ ] **Step 1: TDD the brief mapping** `src/tests/lib/niches/cluster-brief.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { clusterToBrief } from "@/lib/niches/cluster-brief";

const cluster = {
  id: "c1", canonical_topic: "ai productivity tools", format_label: "ai_voiceover_facts",
  audience_signal: "professionals", example_video_ids: ["v1", "v2"], production_fit: "native",
};

describe("clusterToBrief", () => {
  it("produces a topic_queue manual row payload from a cluster", () => {
    const b = clusterToBrief(cluster);
    expect(b.title).toContain("ai productivity tools");
    expect(b.rawPayload).toMatchObject({ clusterId: "c1", format: "ai_voiceover_facts", audience: "professionals", referenceVideoIds: ["v1", "v2"] });
    expect(b.summary).toBeTruthy();
  });
  it("rejects non-native production_fit (only native auto-generates)", () => {
    expect(() => clusterToBrief({ ...cluster, production_fit: "needs_manual_recording" })).toThrow(/native/i);
  });
});
```

- [ ] **Step 2: Run, verify FAIL. Implement `src/lib/niches/cluster-brief.ts`:**
```ts
export interface BriefInput {
  id: string; canonical_topic: string; format_label: string;
  audience_signal: string | null; example_video_ids: string[]; production_fit: string;
}
export interface TopicBrief {
  title: string; summary: string;
  rawPayload: { clusterId: string; format: string; audience: string | null; referenceVideoIds: string[] };
}

export function clusterToBrief(c: BriefInput): TopicBrief {
  if (c.production_fit !== "native") throw new Error(`clusterToBrief: only 'native' production_fit auto-generates (got '${c.production_fit}')`);
  return {
    title: `${c.canonical_topic} (${c.format_label})`,
    summary: `Auto-seeded from niche cluster ${c.id}: ${c.canonical_topic}, ${c.format_label}, audience ${c.audience_signal ?? "general"}.`,
    rawPayload: { clusterId: c.id, format: c.format_label, audience: c.audience_signal ?? null, referenceVideoIds: c.example_video_ids },
  };
}
```
Run test → green.

- [ ] **Step 3: Add `insertManualTopic` to `topic-queue.ts`** (match the file's style; `topic_queue` columns: `source`, `niche_id`, `title`, `summary`, `raw_payload`, `state`):
```ts
export async function insertManualTopic(
  supabase: SupabaseClient,
  params: { title: string; summary: string; rawPayload: unknown; state?: TopicState },
): Promise<QueuedTopic> {
  const { data, error } = await supabase
    .from("topic_queue")
    .insert({ source: "manual", niche_id: null, title: params.title, summary: params.summary, raw_payload: params.rawPayload, state: params.state ?? "reviewed" })
    .select("*").single();
  if (error) throw new Error(`insertManualTopic: ${error.message}`);
  return data as QueuedTopic;
}
```

- [ ] **Step 4: Write `src/app/api/niches/[id]/generate/route.ts`** — read `createVideoDraft` in `repositories/your-videos.ts` and the `/api/lab/dispatch` contract FIRST to wire correctly. Flow:
  1. `getClusterById(supabase, params.id)` → 404 if null.
  2. `clusterToBrief(cluster)` (throws → 422 for non-native; the UI only shows Generate on native, this is the server guard).
  3. `insertManualTopic(supabase, brief)` → queued topic row.
  4. `createVideoDraft(...)` setting `source_niche_cluster_id = cluster.id` (+ `script_brief` jsonb from the brief if the column/param exists).
  5. `recordNicheAction(supabase, { nicheClusterId: cluster.id, action: "generated_from" })`.
  6. Return `{ ok: true, topicId, draftId }`. **Full auto-dispatch to `/api/lab/dispatch` is feature-gated** behind a `?dispatch=1` flag (or omitted) — the row + draft are created and the user finishes in the Lab; document this. If `createVideoDraft`'s required params don't all map cleanly from a cluster, STOP and report rather than guessing.

- [ ] **Step 5: tsc + brief test green. Commit:**
```bash
git add src/lib/niches/cluster-brief.ts src/lib/supabase/repositories/topic-queue.ts src/app/api/niches/[id]/generate/route.ts src/tests/lib/niches/cluster-brief.test.ts
git commit -m "feat(plan-5-e): Generate → topic_queue seed + draft (source_niche_cluster_id) + Lab handoff"
```

---

## Task 14: `/api/cron/prediction-close` (+7d close-loop)

**Files:**
- Create: `src/lib/niches/close-predictions.ts` (adapter — injected deps) + test
- Create: `src/app/api/cron/prediction-close/route.ts`
- Modify: `repositories/niche-predictions.ts` (add `listOpenPredictions`)

- [ ] **Step 1: TDD the close adapter** `src/tests/lib/niches/close-predictions.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runPredictionClose } from "@/lib/niches/close-predictions";

describe("runPredictionClose", () => {
  it("closes only predictions whose linked video has 7d analytics", async () => {
    const closeable = [
      { predictionId: "p1", actualViews7d: 5000 },
      { predictionId: "p2", actualViews7d: 12000 },
    ];
    const attach = vi.fn(async () => {});
    const res = await runPredictionClose({ fetchCloseable: async () => closeable, attachOutcome: attach });
    expect(attach).toHaveBeenCalledTimes(2);
    expect(res.closed).toBe(2);
  });
  it("no-ops cleanly when nothing is closeable (cold start)", async () => {
    const attach = vi.fn(async () => {});
    const res = await runPredictionClose({ fetchCloseable: async () => [], attachOutcome: attach });
    expect(attach).not.toHaveBeenCalled();
    expect(res.closed).toBe(0);
  });
});
```

- [ ] **Step 2: Run, verify FAIL. Implement `src/lib/niches/close-predictions.ts`:**
```ts
import "server-only";

export interface CloseablePrediction { predictionId: string; actualViews7d: number }
export interface PredictionCloseDeps {
  fetchCloseable: () => Promise<CloseablePrediction[]>;
  attachOutcome: (predictionId: string, actualViews7d: number) => Promise<void>;
}
export interface PredictionCloseResult { closed: number }

export async function runPredictionClose(deps: PredictionCloseDeps): Promise<PredictionCloseResult> {
  const closeable = await deps.fetchCloseable();
  for (const c of closeable) await deps.attachOutcome(c.predictionId, c.actualViews7d);
  return { closed: closeable.length };
}
```
Run test → green.

- [ ] **Step 3: Add `listOpenPredictions` to `niche-predictions.ts`** (`actual_video_id is null`) and write the route `src/app/api/cron/prediction-close/route.ts`:
  - `assertCronAuth`; `getServiceClient`.
  - `fetchCloseable`: join open predictions → their cluster → `your_videos` where `source_niche_cluster_id` matches AND posted ≥7d ago AND has a `video_analytics` 7-day views value. This query spans `niche_predictions`/`your_videos`/`video_analytics`; implement it as a repo helper (`listCloseablePredictions(supabase)`) returning `{ predictionId, actualVideoId, actualViews7d }[]`. **It returns `[]` until generation→post→7d-analytics data exists — that's expected (cold start).** If the exact analytics column/shape is unclear, STOP and report rather than guessing.
  - `attachOutcome` = `attachActualOutcome(supabase, predictionId, views)`.
  - Wrap in `runWithIngestionLog`? No — this isn't an ingestion job; return `{ ok: true, closed }` directly with try/catch + `serializeError`. `maxDuration = 300`.

- [ ] **Step 4: close test + tsc green. Commit:**
```bash
git add src/lib/niches/close-predictions.ts src/app/api/cron/prediction-close/route.ts src/lib/supabase/repositories/niche-predictions.ts src/tests/lib/niches/close-predictions.test.ts
git commit -m "feat(plan-5-e): prediction-close +7d cron (graceful no-op until data exists)"
```

---

## Task 15: Register crons + full verification + handoff

**Files:**
- Modify: `vercel.ts`
- Create: `docs/superpowers/notes/2026-05-29-plan-5-phase-1-sub-e-handoff.md`

- [ ] **Step 1: Register crons** in `vercel.ts` (after the Sub-phase D block):
```ts
    // --- Plan #5 Phase 1 Sub-phase E (niche UI + digest + predictions) ---
    { path: '/api/cron/digest-send',      schedule: '0 12 * * 1' }, // Monday 12:00 UTC (after cluster-niches)
    { path: '/api/cron/prediction-close', schedule: '0 13 * * *' }, // daily 13:00 UTC
```

- [ ] **Step 2: Full test suite** — `npx vitest run`. Expected: all NEW E tests green; only the pre-existing env-gated suites fail (same baseline count as C/D). Confirm no new failures.

- [ ] **Step 3: Typecheck + build** — `npx tsc --noEmit && env -u ANTHROPIC_BASE_URL npm run build`. tsc clean. Build compiles + typechecks (the pre-existing env-dependent `/mission-control` page may fail *prerender* locally with blank secrets — that's the relocated legacy cockpit, expected; all new pages are `force-dynamic`). If a NEW page breaks the build (RSC/client boundary), fix it.

- [ ] **Step 4: Spec-coverage self-check** against `…sub-e-design.md`: 5 surfaces (T4–T7,T10,T12), redirect+shell (T1), niche_actions (T2), NicheCard (T3), digest_runs+email+cron (T8–T11), predictions+close-loop (T11,T13,T14), crons (T15). Confirm deferrals absent (onboarding, scoring-analysis/moat/prompt-versions/costs, full Mission Control, shell-unification).

- [ ] **Step 5: Handoff note** `docs/superpowers/notes/2026-05-29-plan-5-phase-1-sub-e-handoff.md` — mirror the D handoff: what E ships, where things live, the operator-gated live smoke (now also `RESEND_API_KEY` + `DIGEST_RECIPIENT`), carry-forward, deferrals, and the fresh-chat kickoff prompt for **Sub-phase F (onboarding §4.14 + the legacy-page shell unification + the deferred admin analysis pages)**.

- [ ] **Step 6: Commit + PR**
```bash
git add vercel.ts docs/superpowers/notes/2026-05-29-plan-5-phase-1-sub-e-handoff.md
git commit -m "chore(plan-5-e): register digest/prediction crons + Sub-phase E handoff"
```
Push and open a PR with base `plan-5-phase-1-sub-d` (stacked; retarget to `main` after #15/#16 merge). Do NOT push/open without Darius's go-ahead.

---

## Live-smoke checklist (operator-gated, post-merge)
Needs `RESEND_API_KEY` + `DIGEST_RECIPIENT` (plus the C/D secrets for upstream data) in the deploy env.
1. `/niches`, `/niches/[id]`, `/niches/watch-list`, `/competitors`, `/niches/digest-preview`, `/settings/niche-finder` all render against real data; `/` redirects to `/niches`.
2. Trigger `digest-send` (cron or `?force=1` from the preview resend). Confirm a `digest_runs` row (`sent` with a real `RESEND_API_KEY`, else `skipped`), an email in the Resend dashboard, and one `niche_predictions` row per surfaced cluster.
3. Generate-from-niche on a `native` cluster creates a `topic_queue` row + a `your_videos` draft with `source_niche_cluster_id`, and logs a `generated_from` action.
4. `prediction-close` no-ops cleanly (returns `closed: 0`) until a generated video has posted + accrued 7 days of analytics.

