// src/remotion/lib/fonts.ts
//
// Loads Montserrat ExtraBold (weight 800) for use in compositions. Wraps
// Remotion's delayRender/continueRender so frames don't render before the
// font is available — that's the silent-fallback hazard the Stage 3a
// glyph-hash check catches.
//
// @fontsource/montserrat v5 uses a CSS-only side-effect import; there is no
// named loadFont export. The import registers the @font-face rules; then we
// wait for document.fonts.ready to confirm the font has loaded before calling
// continueRender.

import '@fontsource/montserrat/800.css';
import { continueRender, delayRender } from 'remotion';

let started: Promise<void> | null = null;

export function loadCaptionFont(): Promise<void> {
  if (started) return started;
  const handle = delayRender('loading Montserrat ExtraBold (800)');
  started = document.fonts.ready.then(() => {
    continueRender(handle);
  });
  return started;
}
