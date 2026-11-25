import type { Transition } from "motion/react";

// one motion system: same curves as the css tokens --ease and --spring; nothing scales
export const EASE = [0.2, 0.8, 0.2, 1] as const;
export const SPRING = [0.2, 1.12, 0.32, 1] as const;

export const T = {
  fast: { duration: 0.15, ease: EASE },
  base: { duration: 0.2, ease: EASE },
  panel: { duration: 0.3, ease: EASE },
  sheet: { duration: 0.42, ease: SPRING },
} satisfies Record<string, Transition>;

// overlays fade and drift a few px; press feedback is a deeper wash in css, never motion
export const overlay = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};
export const rise = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 16 },
};
