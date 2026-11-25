import { focusSystem } from "@/state/actions";
import { ui } from "@/state/ui-store";
import { RM } from "@/lib/motion/reduced";
import type { GalaxyModel } from "@/modules/scene/model";
import { methods } from "@/modules/scene/types";
import { Cz } from "@/modules/scene/handle";

// a removed system is scribbled out and erased into the hole over this long before it is dropped
export const GHOST_MS = 2400;

// model -> drawn state, diffed by instance and service name; nothing is rebuilt on a poll
export const model = methods({
  setModel(m: GalaxyModel) {
    this.m = m;
    const keep = new Set<string>(), first = !this.seen;
    this.seen = true;
    for (const s of m.systems) {
      keep.add(s.name);
      let o = this.sys.get(s.name);
      if (o && o.ghost) { this.sys.delete(s.name); o = null; }
      const fresh = !o, creating = !!(s.life && !s.life.failed && s.life.kind === "create");
      if (!o) { o = { s, pmap: new Map(), rot: Cz.rot.get(s.name) || 0, born: performance.now(), lk: 1, mode: undefined }; this.sys.set(s.name, o); }
      o.s = s;
      const seen = new Set<string>();
      for (const p of s.planets) {
        seen.add(p.svc);
        const q = o.pmap.get(p.svc);
        if (q) { q.p = p; q.leave = false; continue; }
        o.pmap.set(p.svc, { p, leave: false, vis: first || fresh || creating ? 1 : 0, rev: creating ? 0 : 1, pv: creating ? 0 : 1, orbitCur: p.orbit, sizeCur: p.size });
      }
      for (const q of o.pmap.values()) if (!seen.has(q.p.svc)) q.leave = true;
    }
    for (const [n, o] of this.sys) if (!keep.has(n) && !o.ghost) {
      const g = (m.gone || []).find((x) => x.name === n);
      if (this.ok && !RM.matches && !(g && g.fail)) o.ghost = performance.now();
      else this.dropSys(n);
    }
    this.home = this.homeGoal();
    if (!this.flight && !ui().focus && this.homeLock && performance.now() - this.lastInput > 8000) this.easeHome = true;
    this.still();
  },
  planetOf(name: string, svc: string) { const o = this.sys.get(name); return o && o.pmap.get(svc); },
  // where a body is now, on the same orbit maths the 3D planets use
  planetPos(name: string, svc: string, out: any) {
    const o = this.sys.get(name), q = o && o.pmap.get(svc);
    if (!q) return null;
    const s = o.s, a = q.p.ph + o.rot, r = q.orbitCur * s.k;
    return out.set(s.pos.x + Math.cos(a) * r, s.pos.y + Math.sin(a * 0.5 + q.p.ph) * q.orbitCur * 0.03 * s.k, s.pos.z + Math.sin(a) * r);
  },
  dropSys(n: string) {
    const o = this.sys.get(n);
    this.sys.delete(n);
    if (o && o.ghost && ui().focus === n) focusSystem(null);
  },
  birth(id: string) {
    if (!this.ok) return;
    this.births.push({ id, t0: performance.now() });
    this.still();
  },
});
