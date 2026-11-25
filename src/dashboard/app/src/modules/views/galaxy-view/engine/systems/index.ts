import { THREE } from "../three";
import { focusSystem } from "@/state/actions";
import { ui } from "@/state/ui-store";
import { hash, rng } from "@/lib/hash";
import { RM } from "@/lib/motion/reduced";
import type { GalaxyModel } from "@/modules/scene/model";
import { TAU, col3 } from "../util";
import { TX, addSprite } from "../textures";
import { sweepMat } from "../shaders/sweep";
import { pointsMat } from "../shaders/points";
import { methods } from "@/modules/scene/types";
import { Cz } from "@/modules/scene/handle";

export const systems = methods({
  // ---------- model -> scene: diffed by stable id (instance name, service name), never rebuilt on a data change ----------
  setModel(m: GalaxyModel) {
    this.m = m;
    const keep = new Set();
    for (const s of m.systems) {
      keep.add(s.name);
      let o = this.sys.get(s.name);
      if (o && o.ghost) { this.leave(o, s.name, null); o = null; }
      if (!o) { o = this.makeSys(s); this.sys.set(s.name, o); }
      this.syncSys(o, s);
      const a = this.anim.get(s.name) || { flare: 0, detail: 0, fade: 1, born: 0, sig: null, rot: Cz.rot.get(s.name) || 0 };
      if (s.life) a.lifeT = performance.now();
      // the probe pulse stays out of a create/destroy and its settling
      if (s.probe && a.sig !== s.probe) { a.fresh = a.sig != null && !s.life && performance.now() - (a.lifeT || -1e9) > 20000; a.sig = s.probe; }
      this.anim.set(s.name, a);
    }
    for (const [n, o] of this.sys) if (!keep.has(n) && !o.ghost) {
      const g = (m.gone || []).find((x) => x.name === n);
      // gone for real: the star plays out its death where it stood (planets dark, orbits decay, shell), then leaves
      if (this.ok && o.s && !(g && g.fail) && !RM.matches) {
        o.ghost = performance.now() / 1000;
        const per: Record<string, number> = {}; o.s.planets.forEach((p: any) => { per[p.svc] = 0; });
        o.s = { ...o.s, life: { ...(o.s.life || {}), kind: "remove", frac: 1, per, failed: false, stalled: false } };
        for (const q of o.pmap.values()) q.p = { ...q.p, phase: 0, running: false, ok: false };
        continue;
      }
      this.leave(o, n, g);
    }
    sweepMat.uniforms.uR.value = m.bound.R + 30;
    this.sweep.scale.setScalar(m.bound.R + 30);
    this.home = this.homeGoal();
    if (!this.flight && !ui().focus && this.homeLock && performance.now() - this.lastInput > 8000) this.easeHome = true;
    this.still();
  },
  // the star's parts; colours are written every frame from the life stage, so nothing here depends on state
  makeSys(s: any) {
    const g = new THREE.Group();
    g.position.set(s.pos.x, s.pos.y, s.pos.z);
    const c = col3(s.col);
    const o: any = { g, pmap: new Map(), planets: [], belt: null, beltKey: null, starC: c.clone(), knots: [] };
    o.glow = addSprite(TX.glow, c, s.sr * 10, 0.9); g.add(o.glow);
    o.glow2 = addSprite(TX.glow, c, s.sr * 20, 0.1); g.add(o.glow2);
    o.core = addSprite(TX.core, new THREE.Color(s.coreCol), s.sr * 1.7, 1); g.add(o.core);
    o.spike = addSprite(TX.spike, c, s.sr * 10, 0.45); g.add(o.spike);
    o.flare = addSprite(TX.ring, c, s.sr * 4, 0); g.add(o.flare);
    o.aura = addSprite(TX.glow, c, s.ext * 2.6, 0.07); g.add(o.aura);
    o.pg = new THREE.Group(); g.add(o.pg);
    this.scene.add(g);
    return o;
  },
  syncSys(o: any, s: any) {
    o.s = s;
    o.col = col3(s.col); o.baseC = col3(s.baseCol || s.col); o.coreC = new THREE.Color(s.coreCol);
    if (s.guard && !o.guard) { o.guard = addSprite(TX.dash, o.col, s.sr * 7, 0.5); o.g.add(o.guard); }
    if (!s.guard && o.guard) { o.g.remove(o.guard); o.guard.material.dispose(); o.guard = null; }
    const seen = new Set();
    for (const p of s.planets) {
      seen.add(p.svc);
      let q = o.pmap.get(p.svc);
      if (!q) { q = this.makePlanet(o, p, s); o.pmap.set(p.svc, q); }
      q.p = p; q.leave = false;
    }
    for (const q of o.pmap.values()) if (!seen.has(q.p.svc)) q.leave = true;
    o.planets = [...o.pmap.values()];
    const bkey = s.belt ? `${s.belt.n}` : null;
    if (bkey !== o.beltKey) this.makeBelt(o, s);
    if (o.belt && o.beltUp !== s.belt.up) this.litBelt(o, s.belt.up);
  },
  // infra belt, built at unit outer radius and scaled by the frame, so a widening system never rebuilds it
  makeBelt(o: any, s: any) {
    if (o.belt) { o.g.remove(o.belt); o.belt.geometry.dispose(); o.belt.material.dispose(); o.belt = null; }
    o.beltKey = s.belt ? `${s.belt.n}` : null;
    if (!s.belt) return;
    const b = s.belt, r = rng(hash(s.name + "belt")), f0 = b.r0 / b.r1;
    const pos = new Float32Array(b.n * 3), cc = new Float32Array(b.n * 3), sz = new Float32Array(b.n);
    o.beltSeed = [];
    for (let k = 0; k < b.n; k++) {
      const a = r() * TAU, rad = f0 + (r() + r()) / 2 * (1 - f0);
      pos.set([Math.cos(a) * rad, (r() - 0.5) * 1.2 / b.r1, Math.sin(a) * rad], k * 3);
      o.beltSeed.push([r(), r()]);
      sz[k] = 0.9 + r() ** 3 * 2.2;
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    gg.setAttribute("aC", new THREE.BufferAttribute(cc, 3));
    gg.setAttribute("aS", new THREE.BufferAttribute(sz, 1));
    o.belt = new THREE.Points(gg, pointsMat("near"));
    o.belt.material.uniforms.uPR.value = this.pr;
    o.belt.frustumCulled = false;
    o.beltCur = b.r1;
    o.g.add(o.belt);
    this.litBelt(o, b.up);
  },
  litBelt(o: any, up: number) {
    o.beltUp = up;
    const C = o.belt.geometry.attributes.aC;
    o.beltSeed.forEach(([u, w]: number[], k: number) => { const lit = u < up, v = lit ? 0.5 + w * 0.4 : 0.14; C.setXYZ(k, v, lit ? v * 0.95 : v, lit ? v * 0.86 : v); });
    C.needsUpdate = true;
  },
  leave(o: any, n: string, g: any) {
    if (this.ok && o.s) this.remnant(o, g);
    this.dropSys(o); this.sys.delete(n); this.anim.delete(n); o.label && o.label.remove();
    if (o.ghost && ui().focus === n) focusSystem(null);
  },
  dropSys(o: any) {
    this.scene.remove(o.g);
    o.g.traverse((x: any) => { if (x.geometry && !this.sharedGeo.has(x.geometry)) x.geometry.dispose(); if (x.material) x.material.dispose(); });
  },
});
