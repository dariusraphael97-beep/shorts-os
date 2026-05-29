import type { Transition, Variants } from "motion/react";

export const DURATION = {
  instant: 0.1,
  quick: 0.2,
  smooth: 0.32,
  slow: 0.5,
} as const;

export const EASE = {
  entry: [0, 0, 0.2, 1] as readonly [number, number, number, number],
  standard: [0.4, 0, 0.2, 1] as readonly [number, number, number, number],
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

export const backdropFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.quick, ease: EASE.standard } },
  exit: { opacity: 0, transition: { duration: DURATION.quick, ease: EASE.standard } },
} satisfies Variants;

export const hoverLift = {
  rest: { y: 0, boxShadow: "var(--elev-1)" },
  hover: { y: -2, boxShadow: "var(--elev-2)", transition: { duration: DURATION.quick, ease: EASE.standard } },
} satisfies Variants;
