# Reference audio analysis — "What Did Ancient Humans Do at Night?" (st_Ah6Ykbh4)

**Date:** 2026-06-12. **Method:** full audio download + DSP analysis (silencedetect threshold sweep, loudnorm stats, band-filtered RMS, spectrograms of full video / open / close / every detected pause) + manual en-US caption track word count. This supersedes the handoff's frames+captions-only audio estimates.

## (a) Music bed: NONE

- `silencedetect` sweep: the only region under −30 dB for ≥0.5 s in the entire 8:32 is one 0.6 s gap at 5:46.5 — and its spectrogram drops to near-black across all frequencies. A music bed would survive an edit gap; nothing does.
- Full-video and pause spectrograms show **zero sustained horizontal tonal lines** anywhere — the inter-word floor is uniform broadband (compressed room tone), not music.
- Loudness: LRA **2.2 LU** (extremely compressed/even), true peak −2.0 dBTP. The floor sits around −31 LUFS only because heavy VO compression pumps room tone up between words.

**Decision: `MUSIC_BED_ENABLED` stays unset. Confirmed correct.**

## (b) Sound effects: effectively none

- Only **6 pauses ≥ 0.3 s in 8.5 minutes** (505 caption cues, no inter-cue gap > 1.2 s) — the narration is wall-to-wall with pauses edited out.
- No transient or tonal events occupy any detected pause; nothing detectable under the VO at the band level.

**Decision: SFX layer stays enabled but cues must be RARE — keep the planner's "handful, diegetic-only" guidance; treat ~4–6 cues at vol 0.18 as the ceiling (≤8 was already generous). Zero SFX would also be faithful.**

## (c) Voice pace: ~187 wpm — the handoff's 140–150 wpm estimate was WRONG

- Manual (creator-authored) en-US captions: **1,596 words / 512 s = 187 wpm** (auto track agrees: 1,598).
- Delivery: calm, contemplative second-person tone — but **brisk**, with sentence pauses tightly edited. "Calm" comes from tone/intonation, not slowness.

### Implications for our build
1. **Script length:** to match the reference's density at ~8.5 min, target **~1,500–1,600 words**, not the spec's 1,200–1,350 (which assumed 144 wpm). At 144 wpm 1,300 words would feel notably slower-paced than the reference.
2. **Voice audition (Task 14):** select for a naturally brisk-but-calm American male read; prefer candidates that land near 170–190 wpm at natural speed (ElevenLabs `speed` can nudge ~±10%).
3. **Beat math:** ~8.5–9 min at 2.5 s/beat still ⇒ ~205–215 beats; unchanged.
4. **Mastering bar:** dense edit, tight pauses, even loudness (low LRA). Our renderer's normal VO chain is fine; do not add a bed.

## Raw evidence
- Work dir (temp, disposable): `/tmp/doodle-ref-audio/` — spectrograms `spec_full.png`, `spec_open.png`, `spec_close.png`, `spec_quiet_346.png`, `spec_pause_*.png`.
- Threshold sweep: −50/−45 dB → 0 regions; −35/−30/−25 dB → 1 region (5:46.5, 0.6 s).
- Band RMS: 30–120 Hz −29.2 dB vs 300–3000 Hz −25.0 dB (bass consistent with male VO fundamentals, no bed bass).
