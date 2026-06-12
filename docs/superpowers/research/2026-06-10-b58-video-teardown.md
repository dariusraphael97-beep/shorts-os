# Teardown: "The Truth About the B58" — first-hand retention diagnosis

**Watched 2026-06-10 with `/watch` (frames + full caption transcript). Video: https://youtu.be/GwC66BSw7wU · 8:24 · Dyfrx.**
**Launch data (~12h):** 280 impressions · 2.9% CTR · 16 views · **avg view 0:58 of 8:24 (~11% retention)** · like ratio 66.7%.

This is primary evidence for the findings doc. The conclusion is unambiguous: **the writing in the middle is good; the packaging of the first 60 seconds is what killed it, and the best material is buried past the halfway mark.**

---

## What's GOOD (don't break these)

- **Visual style.** Clean, consistent hand-drawn ink + watercolor-wash illustrations on a warm cream background (engine on a stand, iron-vs-aluminum heat-flow diagram, bore/stroke spec callout, "RACING V8 vs B58 I6" cutaways). Crisp, professional, on-brand. The locked illustration-from-reference rule is working. **Visuals are not the problem.**
- **Accuracy got fixed.** This re-render carries the corrected story: *stock internals handle 800whp, all-in $5–10k (not $20–30k), forged internals are overkill.* The 2JZ comparison is fair. The accuracy gate did its job. (Matches `reference_b58_ground_truth_facts`.)
- **The writer already knows narrative devices.** Open-loop turn phrases are present and good: *"Here's the thing,"* *"So why…,"* *"Here's where it gets interesting,"* and segment-ending mini-cliffhangers (*"So where do you go from here?"*). The problem is purely **sequencing** — they fire after the boring part, not before it.

---

## Second-by-second hook (0:00–0:45) — where the viewer bails

| t | On screen | Narration | Problem |
|---|---|---|---|
| 0:00–0:04 | Black 3-series parked by a house, briefcase in back seat. No text. | (silence → ) | Low-energy, ambiguous opening image. No promise, no motion, no stakes. |
| 0:04–0:17 | Generic BMW lineup; "BMW" label | *"BMW builds commuter cars, sedans, SUVs… meant to be leased, driven gently, and forgotten. So when they sat down to design the B58, logic said build it just strong enough…"* | **Abstract throat-clear about BMW generally.** A cold viewer who clicked "The Truth About the B58" has no idea what payoff is coming. Zero curiosity gap paid. |
| 0:17–0:19 | Engine reveal | *"But that's not what they did. **They built a weapon.**"* | **The actual hook line lands at 0:17.** Most bailing viewers are already gone. This line belongs at second 1. |
| 0:19–1:16 | Spec diagrams: closed-deck, coated walls, "82mm × 94.6mm, 11.0:1", twin-scroll turbo | dry architecture spec-dump → "286 horsepower… a number the engine treats as an idle" | **A technical encyclopedia entry delivered exactly during the stay/bail decision window.** No open loop, no stakes, no "here's what's coming." On-screen text = encyclopedic labels (bore/stroke), not a hook. |

**The first real narrative tension doesn't arrive until 1:16** (*"Here's the thing. BMW is one of the most cost-obsessed manufacturers on Earth… so why overengineer a commuter motor this far? Because they knew tuners would find it."*). That's ~80 seconds in — long after the average viewer (0:58) has left.

---

## Full structure map

| Segment | Time | Content | Retention note |
|---|---|---|---|
| Slow intro | 0:00–0:19 | abstract BMW preamble; hook line buried at 0:17 | ❌ kills cold viewers |
| Spec dump | 0:19–1:16 | block, walls, bore/stroke, turbo, 286hp | ❌ dry, no loop, in the bail window |
| Why overbuilt | 1:16–1:44 | cost-obsessed BMW "knew tuners would find it" | ✅ first real tension — but too late |
| Stage 1 | 1:44–2:34 | flash tune, intake, downpipe | ✅ momentum building |
| Stage 2 | 2:34–3:22 | E85, flex-fuel kit $490, port injection | ✅ |
| **The 800whp payoff** | **3:22–4:55** | **"you don't need forged internals," real 340i dyno = 744whp, all-in $5–10k not $20–30k** | ⭐ **the single most shareable claim — buried past the halfway point** |
| Past 800 | 4:55–6:28 | the *car* breaks, not the engine (ZF8 box, driveline, heat) | ✅ good tension |
| 2JZ comparison | 6:28–8:00 | B58 vs the legend — modern metallurgy wins | ✅ strong for enthusiasts |
| Thesis close | 8:00–8:24 | "overbuilt, underrated, quietly the best inline six ever…" | ❌ abrupt; **no CTA, no subscribe, no next-video loop** |

---

## Root-cause findings (carry into the learnings doc)

1. **The hook is inverted.** The most clickable, title-paying-off claim — *"800whp on a $50k commuter engine you never even open, for the price of a set of wheels"* — is the payoff at ~4:42. It should BE the first sentence. We led with the least interesting thing (generic BMW philosophy) and buried the lede past the midpoint.
2. **Dry exposition in the bail window.** Seconds 19–76 are pure spec dump. Cold-audience retention is decided in the first 30–60s; we spent it on bore/stroke numbers with no open loop.
3. **The title promise is never restated up front.** "The Truth About the B58" implies a reveal/contrarian payoff. The first 17s deliver none of it. The viewer can't tell what they'll get.
4. **On-screen text is encyclopedic, not hooky.** Bore/stroke, "BMW", "B58 ENGINE" are labels. Per `feedback_onscreen_text_retention`, each beat's text should be the ONE takeaway/claim ("800 WHP. STOCK INTERNALS." / "$5–10K. NOT $30K.").
5. **No CTA / no end-loop.** Abrupt thesis ending. No subscribe ask, no "watch this next" — leaves session-time and subscriber conversion on the table.
6. **The good devices exist but are sequenced wrong.** The writer can do open loops and turn-phrases; we need to (a) move the payoff-tease to second 1, (b) compress/defer the spec dump, (c) front-load stakes. This is a **prompt/structure fix in writer.ts**, not a capability gap.

> Net: this was a well-written video wearing a bad first 60 seconds. Fixing hook + structure + a tease-the-payoff open is the highest-leverage change we can make.
