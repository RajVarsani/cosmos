import { rng } from "@/lib/hash";
import { GX, armAngle } from "@/modules/scene/model/layout";
import { once } from ".";

const TAU = Math.PI * 2;
const wob = (r: () => number) => (r() + r() + r() - 1.5) / 1.5;

// the arms as loose short pencil strokes along the same log spiral the seats use, kept as world points
// (x0 z0 cx cz x1 z1 tone) so each frame projects them and they foreshorten like everything else
export function armStrokes(R: number) {
  return once(`arms:${Math.round(R / 30)}`, () => {
    const r = rng(42), out: number[] = [], r0 = GX.ARM0 * 0.7;
    for (let arm = 0; arm < GX.ARMS; arm++) for (let i = 0; i < 130; i++) {
      const rad = r0 * Math.pow(R / r0, Math.pow(r(), 0.85));
      const th = armAngle(rad, arm) + wob(r) * (0.05 + 5 / rad), off = wob(r) * (3 + rad * 0.035);
      const x = Math.cos(th) * rad - Math.sin(th) * off, z = Math.sin(th) * rad + Math.cos(th) * off;
      // along the arm, but never ruled: each stroke leans a little and bows
      const lean = Math.atan2(Math.sin(th) + Math.cos(th) / GX.PITCH, Math.cos(th) - Math.sin(th) / GX.PITCH) + wob(r) * 0.22;
      const dx = Math.cos(lean), dz = Math.sin(lean);
      const L = (7 + r() * 17) * (0.6 + rad / 240), bend = wob(r) * L * 0.32, tone = rad < R * 0.4 ? 0 : rad < R * 0.72 ? 1 : 2;
      for (let pass = 0; pass < (r() < 0.4 ? 2 : 1); pass++) {
        const j = pass * (0.5 + r()), sx = x - dz * j, sz = z + dx * j, over = 1 + r() * 0.15;
        out.push(sx - (dx * L) / 2, sz - (dz * L) / 2, sx - dz * bend, sz + dx * bend, sx + (dx * L * over) / 2, sz + (dz * L * over) / 2, tone);
      }
    }
    return Float32Array.from(out);
  });
}

// the infra belt as a dotted ring of short ticks; the lit share follows how much infra is up
export function beltTicks(name: string, r0: number, r1: number, count: number, up: number) {
  const n = 60 + count * 18, lit = Math.round(up * n);
  return once(`belt:${name}:${n}:${lit}:${Math.round(r1 * 4)}`, () => {
    const r = rng(n * 977 + name.length), on = new Path2D(), off = new Path2D();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + r() * 0.04, rad = r0 + (r() + r()) / 2 * (r1 - r0), L = 0.25 + r() * 0.5;
      const p = k < lit ? on : off, ta = a + Math.PI / 2 + wob(r) * 0.5;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      p.moveTo(x - Math.cos(ta) * L, z - Math.sin(ta) * L);
      p.lineTo(x + Math.cos(ta) * L, z + Math.sin(ta) * L);
    }
    return { on, off };
  });
}

// a wobbly two-pass stroke from a to b, for the birth line out of the hole
export function sketchLine(seed: number, x0: number, y0: number, x1: number, y1: number) {
  const r = rng(seed), p = new Path2D(), dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  for (let pass = 0; pass < 2; pass++) {
    const b = wob(r) * L * 0.06, j = pass * 1.2;
    p.moveTo(x0 + nx * j, y0 + ny * j);
    p.quadraticCurveTo(x0 + dx / 2 + nx * (b + j), y0 + dy / 2 + ny * (b + j), x1 + dx / L * 4 + nx * j, y1 + dy / L * 4 + ny * j);
  }
  return { p, L: L * 1.1 };
}
