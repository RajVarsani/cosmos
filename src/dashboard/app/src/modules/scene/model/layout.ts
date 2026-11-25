import { hash } from "@/lib/hash";
import { lookOf } from "@/domain/palette";

// FOOT: the most room a system takes in the galaxy; a bigger layout is drawn to scale k so it fits
export const GX = { RS: 9, DISK_IN: 12.5, DISK_OUT: 46, KEEP: 92, ARMS: 3, ARM0: 30, PITCH: 0.42, PAD: 40, FOOT: 18 };
export const GOLDEN = Math.PI * (3 - Math.sqrt(5));
export const armAngle = (r: number, arm: number) => (arm * Math.PI * 2) / GX.ARMS + Math.log(r / GX.ARM0) / GX.PITCH;
// a body's reach includes its rings and satellite; SAT_R is fixed so an arrival never resizes another's satellite
export const SAT_R = 0.19;
export const reachOf = (svc: string, size: number, sat: unknown) => { const ring = !!lookOf(svc).ring, satK = sat ? SAT_R / 0.45 / size : 0; return size * Math.max(ring ? 2.4 : 1, sat ? (ring ? 2.5 : 1.2) + satK * 2.2 * 1.25 : 0); };

type Lanes = { order: string[]; reach: Map<string, number>; kind?: Map<string, string> };
export const layouts = new Map<string, Lanes>();
// one orbit per planet, assigned once in first-seen order and never reshuffled; a lane only widens when its body grows
export function laneLayout(name: string, planets: { svc: string; kind: string; sat: unknown }[]) {
  let L = layouts.get(name);
  if (!L) { L = { order: [], reach: new Map() }; layouts.set(name, L); }
  const fresh = planets.filter((p) => !L!.order.includes(p.svc));
  // the first sighting sorts frontends inside backends; later arrivals append outward
  fresh.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "fe" ? -1 : 1));
  L.order.push(...fresh.map((p) => p.svc));
  // lanes are sized for the largest a body can grow to, so memory growth never pushes the next orbit out
  for (const p of planets) L.reach.set(p.svc, Math.max(L.reach.get(p.svc) || 0, reachOf(p.svc, 2.1, p.sat)));
  const kindOf = new Map(planets.map((p) => [p.svc, p.kind]));
  L.kind = L.kind || new Map();
  for (const [k, v] of kindOf) L.kind.set(k, v);
  let a = 4.2, prev = 0, prevKind: string | null | undefined = null;
  const lane = new Map<string, { orbit: number; idx: number }>();
  L.order.forEach((svc, idx) => {
    const R = L!.reach.get(svc) || 1.5, kind = L!.kind!.get(svc);
    // neighbours sit 137.5 degrees apart, so lanes can pack tighter than the two reaches added
    a += 0.6 * (prev + R) + 0.9 + (prevKind && prevKind !== kind ? 1.2 : 0);
    lane.set(svc, { orbit: a, idx });
    prev = R; prevKind = kind;
  });
  return { lane, edge: L.order.length ? a + prev : 4 };
}

export type Seat = { x: number; y: number; z: number; e: number };
// fixed seat for a system: seeded on its arm by slot, then pushed clear of systems already placed (which never move)
export function seatOf(name: string, slot: number, e: number, fixed: Seat[]): Seat {
  const n = Math.max(0, slot - 1), arm = n % GX.ARMS, j = Math.floor(n / GX.ARMS);
  const rad = GX.KEEP + 36 + j * 84 + (hash(`slot${slot}`) % 9), th = armAngle(rad, arm);
  const sx = Math.cos(th) * rad, sz = Math.sin(th) * rad;
  let x = sx, z = sz;
  for (let it = 0; it < 200; it++) {
    let moved = false;
    for (const f of fixed) {
      let dx = x - f.x, dz = z - f.z, dist = Math.hypot(dx, dz);
      const min = e + f.e + GX.PAD;
      if (dist >= min) continue;
      if (dist < 1e-3) { dx = 1; dz = 0; dist = 1; }
      x = f.x + (dx / dist) * min; z = f.z + (dz / dist) * min; moved = true;
    }
    const rr = Math.hypot(x, z), min = GX.KEEP + e;
    if (rr < min) { x *= min / rr; z *= min / rr; moved = true; }
    if (!moved) break;
  }
  return { x: +x.toFixed(2), y: ((hash(name) % 100) / 100 - 0.5) * 8, z: +z.toFixed(2), e };
}
