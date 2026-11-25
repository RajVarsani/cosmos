// host port = BASE + SLOT_STRIDE * slot + offset. Slot 0 is reserved, never auto-assigned.
import { RESERVED_OFFSETS, SERVICES } from "./catalog";

export const BASE_PORT = 20000;
export const SLOT_STRIDE = 100;
export const MAX_SLOT = 99;

export const EDGE_OFFSETS = Array.from({ length: RESERVED_OFFSETS.edge[1] - RESERVED_OFFSETS.edge[0] + 1 }, (_, k) => `edge${k}`);

// every named offset: each service's main and extra ports from the manifest, plus cosmos's own (edge0-9, share)
export function OFFSETS(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of SERVICES()) {
    if (d.offset !== undefined) out[d.svc] = d.offset;
    for (const x of d.extraPorts ?? []) out[x.key] = x.offset;
  }
  EDGE_OFFSETS.forEach((k, i) => (out[k] = RESERVED_OFFSETS.edge[0] + i));
  out.share = RESERVED_OFFSETS.share;
  return out;
}

export function hostPort(slot: number, key: string | number): number {
  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_SLOT) throw new Error(`bad slot ${slot}`);
  const off = typeof key === "number" ? key : key === "share" ? RESERVED_OFFSETS.share : key.startsWith("edge") && EDGE_OFFSETS.includes(key) ? RESERVED_OFFSETS.edge[0] + EDGE_OFFSETS.indexOf(key) : OFFSETS()[key];
  if (off === undefined) throw new Error(`no port offset for ${key}`);
  return BASE_PORT + SLOT_STRIDE * slot + off;
}
