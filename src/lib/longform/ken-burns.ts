// src/lib/longform/ken-burns.ts
// Pure builder of an ffmpeg zoompan filtergraph for a slow landscape (1920x1080)
// Ken-Burns move on a still image — emulates the reference's slow cinematic push-in.
// Mirrored verbatim into scripts/render-worker/lib/ken-burns.ts.

export const KEN_BURNS_DIRECTIONS = ["in", "out", "left", "right"] as const;
export type KenBurnsDirection = (typeof KEN_BURNS_DIRECTIONS)[number];

export interface KenBurnsArgs {
  durationSeconds: number;
  fps: number;
  direction: KenBurnsDirection;
  /** Total zoom travel as a fraction of frame (e.g. 0.06 = 6% push). */
  zoom: number;
}

const OUT_W = 1920;
const OUT_H = 1080;
// Oversample so the pan/zoom has pixels to move into without softening.
const SRC_W = OUT_W * 2;
const SRC_H = OUT_H * 2;

export function buildKenBurnsFilter(args: KenBurnsArgs): string {
  const frames = Math.max(1, Math.round(args.durationSeconds * args.fps));
  const z = Math.max(0, args.zoom);
  // zoom expression: push in ramps zoom up, push out starts zoomed and ramps down.
  const zExpr =
    args.direction === "out"
      ? `'if(eq(on,0),${(1 + z).toFixed(4)},max(zoom-${(z / frames).toFixed(6)},1.0))'`
      : `'min(zoom+${(z / frames).toFixed(6)},${(1 + z).toFixed(4)})'`;
  // pan expressions: centre by default, drift horizontally for left/right.
  let xExpr = "'iw/2-(iw/zoom/2)'";
  let yExpr = "'ih/2-(ih/zoom/2)'";
  if (args.direction === "left") xExpr = `'(iw - iw/zoom) * (1 - on/${frames})'`;
  if (args.direction === "right") xExpr = `'(iw - iw/zoom) * (on/${frames})'`;

  return (
    `scale=${SRC_W}:${SRC_H}:force_original_aspect_ratio=increase,` +
    `crop=${SRC_W}:${SRC_H},` +
    `zoompan=z=${zExpr}:x=${xExpr}:y=${yExpr}:d=${frames}:s=${OUT_W}x${OUT_H}:fps=${args.fps},` +
    `setsar=1`
  );
}
