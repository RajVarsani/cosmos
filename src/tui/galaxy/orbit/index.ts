import type { GalaxyBody } from "../types";
import { hash } from "../hash";

export const TILT = 0.4; // ellipse ry / rx, the inclined-disc look
export const STAR_R = 2.2; // units

export type Ring = { rx: number; ry: number };
export type Placed = { body: GalaxyBody; ring: Ring; x: number; y: number; behind: boolean; size: number };

export const sizeStep = (mem: number) => (mem < 256 ? 0 : mem < 1024 ? 1 : mem < 4096 ? 2 : 3);
export const PLANET_R = [0.7, 1.0, 1.35, 1.75];

export function rings(n: number, cx: number, cy: number): Ring[] {
  const rmax = Math.min(cx - 3, (cy - 1.5) / TILT);
  const r0 = Math.min(STAR_R + 5, rmax * 0.4);
  if (n === 1) return [{ rx: (r0 + rmax) / 2, ry: ((r0 + rmax) / 2) * TILT }];
  return Array.from({ length: n }, (_, i) => {
    const rx = r0 + ((rmax - r0) * i) / (n - 1);
    return { rx, ry: rx * TILT };
  });
}

// innermost period ~90 s, outer ones slower (Kepler-ish); phase from id so planets never jump
export function place(bodies: GalaxyBody[], cx: number, cy: number, t: number): Placed[] {
  const sorted = [...bodies].sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id));
  const rs = rings(sorted.length, cx, cy);
  const r0 = rs[0]?.rx ?? 1;
  return sorted.map((body, i) => {
    const ring = rs[i];
    const w = ((2 * Math.PI) / 90) * Math.pow(r0 / ring.rx, 1.5);
    const a = ((hash(body.id) % 3600) / 3600) * 2 * Math.PI + t * w;
    return { body, ring, x: cx + Math.cos(a) * ring.rx, y: cy + Math.sin(a) * ring.ry, behind: Math.sin(a) < 0, size: sizeStep(body.memMiB) };
  });
}
