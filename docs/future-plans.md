# Future Plans

Captures plans that are too far out to design in detail today but worth recording so the requirements don't get lost. Each entry should be promoted to a full spec + plan under `docs/superpowers/specs/` and `docs/superpowers/plans/` when its gating conditions are met.

---

## Remotion full motion-graphics buildout — DISTRIBUTED, NOT A STANDALONE PLAN

**Status:** Distributed across Plan #4 Phases 3, 4, and 5. **Do NOT create a "Plan #6 Remotion buildout" plan** — the features are baked into existing phases per the integration map in [`2026-05-25-shorts-os-plan-4-render-pipeline-design.md`](./superpowers/specs/2026-05-25-shorts-os-plan-4-render-pipeline-design.md#-remotion-feature-integration-map-read-this-before-planning-phases-35) §4.

**Distribution:**
- Phase 2.5 → animated word-by-word captions (shipping now) + Lottie infrastructure
- Phase 3 → smooth b-roll transitions + lower-thirds (source credits)
- Phase 4 → title cards (Format 2 compilations) + animated callouts/stickers
- Phase 5 → branded intros/outros (per-channel)

Each phase's implementation plan MUST include the Remotion features assigned to it as required tasks, not optional polish. The §4 integration map is authoritative.

---

## Plan #8: Long-form AI character content vertical

**Target:** 15–30 minute horizontal video, AI characters, senior-targeted high-CPM niches (financial education, retirement, IRS/Medicare, etc.)

**Tool integrations to evaluate:** HeyGen, Synthesia, D-ID, Pictory, InVideo (consumer-grade AI video tools, $30–200/mo each — way cheaper than Veo/Sora at $0.75/sec)

**Architecture:** same Strategist + Writer + Composer pattern, but orchestrating external AI video APIs instead of Remotion stock composition. Render pipeline reuses Plan #4's `render_jobs` queue + VercelSandboxRenderWorker abstraction — long-form just adds new job types and handler modules. UI reuses /lab + /clips + /operations patterns adapted for longer assets.

**Gating condition:** do NOT start until Shorts pipeline (Plans #1–#7) generates **$1k+ MRR**. Long-form is more expensive per attempt ($5–30/video) and requires Shorts revenue to fund experimentation.

**Operator note:** the cars niche in Plan #4 v1 is intentional to BUILD DATA and prove/disprove the saturation hypothesis. Pivots come AFTER 30 real posted videos generate real performance data, not before. Plan #5's Scout Radar (see [2026-05-25-shorts-os-plan-5-learning-loops-design.md](./superpowers/specs/2026-05-25-shorts-os-plan-5-learning-loops-design.md#loop-1b--the-scouts-niche-radar-cross-niche-weekly)) is the discovery mechanism for pivot candidates; Plan #8 is the production mechanism for one specific category of pivot (long-form high-CPM).
