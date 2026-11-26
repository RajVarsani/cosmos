import type { GalaxyBody, Style } from "../types";

// from the web dashboard palette (domain/palette.ts, scene/model, engine halo colours)
export const HEALTH: Record<GalaxyBody["health"], string> = {
  running: "#7bd88f",
  starting: "#ff9a6b",
  degraded: "#ffc46b",
  stopped: "#8c8580",
  error: "#ff5b7a",
};

const faint = { color: "#363b4f" }; // shared object so runs merge

export const S = {
  core: { color: "#ffcf9a", bold: true },
  corona: { color: "#ffb877" },
  halo: { color: "#ff8a5c", dim: true },
  ringFront: { color: "#4a5175" },
  ringBack: faint,
  stars: [faint, faint, { color: "#8a90a8" }],
  select: { color: "#bfe8ff", bold: true },
  empty: { dim: true },
} satisfies Record<string, Style | Style[]>;

export const planet = (h: GalaxyBody["health"], bright: boolean): Style => ({ color: HEALTH[h], bold: bright });
