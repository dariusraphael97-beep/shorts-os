# Plan #4 Phase 4 — IP-Block Resolution Decision

**Date:** 2026-05-26
**Decision:** Option (A) — operator-supplied yt-dlp cookies + Reddit OAuth client_credentials. **Approved by operator.**
**Context:** Phase 3 benchmark ([docs/superpowers/notes/2026-05-26-plan-4-phase-3-benchmark.md](2026-05-26-plan-4-phase-3-benchmark.md)) confirmed that yt-dlp from Vercel Sandbox datacenter IPs is anonymously refused by Reddit (`Account authentication is required`) and YouTube (`Sign in to confirm you're not a bot`). One workaround per host, two hosts, three candidate paths scored below.

## Options

### (A) Operator-supplied yt-dlp cookies file
- Operator runs `yt-dlp --cookies-from-browser firefox --cookies cookies.txt --skip-download <any YT URL>` locally against their own logged-in Reddit + YouTube Firefox sessions.
- Base64-encoded cookies stored as `YTDLP_COOKIES_B64` env var, decoded to `/tmp/cookies.txt` by the worker before each yt-dlp invocation.
- For Reddit JSON discovery (separate from clip download): operator-supplied OAuth `client_credentials` from a Reddit "script" app hits `oauth.reddit.com` instead of `www.reddit.com`.
- Rotation: re-export from Firefox (~5 min) when consecutive bot-checks appear in `render_jobs.last_error`.

### (B) Residential outbound proxy
- Vendor: Bright Data / Decodo / Oxylabs / SmartProxy.
- yt-dlp wrapped with `--proxy http://user:pass@<vendor>:port`.
- Per-GB cost: $2–10/GB at retail. At ~10 ingests/day × ~5MB/clip ≈ 1.5GB/month → ~$3–15/month.
- No operator account dependency; vendor rotates IPs automatically.

### (C) Reddit/YouTube OAuth integration (full)
- Reddit OAuth (script-app or installed-app flow) authenticates `oauth.reddit.com` JSON listings → fixes discovery cron.
- YouTube Data API does NOT provide third-party-video download — only upload/manage your own channel's videos. So OAuth alone does NOT solve YouTube clip download.
- Practically reduces to: Reddit OAuth for discovery + (cookies-or-proxy) for YouTube clip downloads → not a standalone option, it's (A) or (B) with Reddit-side OAuth bolted on.

## Scoring (1 = best, 5 = worst)

| Axis | (A) Cookies | (B) Proxy | (C) OAuth |
|---|---|---|---|
| Operator effort (one-time) | 2 | 4 (vendor signup + payment + KYC) | 3 (Reddit app reg + YT cookies still needed) |
| Ongoing operator effort | 3 (re-export ~monthly) | 1 (none) | 3 (re-export YT cookies + OAuth token monitoring) |
| Direct $ cost | 1 ($0) | 4 ($3–15/mo) | 2 ($0 + proxy-or-cookies for YT) |
| Breakage rate (cookie/IP detection) | 3 (operator's IP, occasional captcha) | 2 (vendor rotates) | 3 (compound: OAuth quirks + YT cookies) |
| ToS posture | 2 (operator is account holder; allowed by YT Premium ToS) | 4 (residential proxies are borderline; vendor pulled-out clauses) | 2 (OAuth path is explicitly sanctioned by Reddit) |
| Implementation complexity in this codebase | 2 (env var + ~10 lines in yt-dlp wrapper) | 3 (proxy env + wrapper + vendor SDK) | 4 (OAuth token store + refresh + still need cookies for YT) |
| **Total (lower wins)** | **13** | **18** | **17** |

## Recommendation → APPROVED

**Option (A) — operator cookies + Reddit OAuth client_credentials.**

Lowest total, lowest cash cost, fastest implementation, ToS-aligned because Darius is the account holder on both Reddit and YouTube. Cookie-rotation cost is the only real downside — Phase 3 benchmark suggests ~30-day cookie lifespan on YouTube, longer on Reddit.

## Implementation surface

1. Operator generates `cookies.txt` via `yt-dlp --cookies-from-browser firefox --cookies cookies.txt --skip-download <any YT URL>`. (Visit Reddit in the same browser session first so Reddit cookies are captured in the same export.)
2. `base64 -i cookies.txt | pbcopy` → paste into Vercel as `YTDLP_COOKIES_B64` (production + preview, Sensitive).
3. Operator registers a Reddit "script" app at https://www.reddit.com/prefs/apps. Saves client_id + secret to `REDDIT_OAUTH_CLIENT_ID` + `REDDIT_OAUTH_CLIENT_SECRET` (production + preview, Sensitive).
4. Codebase changes: Tasks 2 (worker cookies plumbing + Reddit OAuth client) and 3 (prod smoke) in [docs/superpowers/plans/2026-05-26-shorts-os-plan-4-phase-4.md](../plans/2026-05-26-shorts-os-plan-4-phase-4.md).

## Rotation policy

- **Trigger:** ≥3 consecutive `render_jobs` for `clip_ingest` fail with `last_error` containing `cookies` OR `Sign in to confirm` OR `Account authentication is required`. Surfaced via an `operator_alerts` row (category `clip_ingest_zero_yield`, severity `warn`).
- **Operator action:** re-export `cookies.txt` from Firefox (~5 min), `vercel env rm YTDLP_COOKIES_B64 production && vercel env add YTDLP_COOKIES_B64 production`, redeploy.
- **Cadence baseline:** ~30 days on YouTube cookies; ~90 days on Reddit cookies. Operator sets a monthly calendar reminder.
- **v1.5 upgrade path:** auto-refresh via headless browser running in Sandbox once a month — see [docs/future-plans.md](../../future-plans.md). Only worth building once manual monthly refresh is proven stable.

## Smoke result

*Populated by Task 3 of the Phase 4 plan after the operator's prod smoke completes.*

## Out-of-scope for Phase 4 (defer)

- Multi-account cookie rotation (round-robin between two operator sessions)
- Automated cookie refresh via headless browser → see [future-plans.md](../../future-plans.md) v1.5 entry
- Bright Data fallback path (kept as Plan-B if (A) breakage rate exceeds 1/week)
