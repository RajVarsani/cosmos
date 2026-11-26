import type { GalaxyBody } from "../galaxy/types";
import type { Row } from "../data/types";
import { BAD, TRANSIT } from "../theme/palette";

const health = (state: string): GalaxyBody["health"] =>
  state === "running" ? "running" : TRANSIT.has(state) ? "starting" : state === "exited" ? "error" : BAD.has(state) || state === "partial" ? "degraded" : "stopped";

export const toBodies = (rows: Row[], pending: Record<string, string>): GalaxyBody[] =>
  rows.map((r) => ({ id: r.name, name: r.label, slot: r.slot, health: health(r.state), memMiB: r.memMiB ?? 0, busy: !!pending[r.name] }));
