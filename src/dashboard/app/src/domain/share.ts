import { TRANSIT } from "./states";
import type { Instance, Share } from "./types";

// on: live; go: starting; warn: restarting or unavailable; dim: stopped; undefined: not shared
export type ShareTone = "on" | "go" | "warn" | "dim";
export function shareTone(sh: Share | null | undefined): ShareTone | undefined {
  if (!sh) return undefined;
  if (sh.state === "live") return "on";
  if (sh.state === "restarting" || sh.state === "unavailable") return "warn";
  return sh.state === "stopped" ? "dim" : "go";
}

// the same gate for the bar, the sheet and the palette
export const canShare = (i: Instance) => !(TRANSIT.has(i.state) && i.state !== "booting") && i.containers.some((c) => c.running);
