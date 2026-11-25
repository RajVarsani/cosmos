import { THREE } from "../../three";
import { GX, armAngle } from "@/modules/scene/model/layout";
import { TAU, RS, DISK_OUT, clamp, lerp, _c1, _c2 } from "../../util";
import { TX, addSprite } from "../../textures";
import { methods } from "@/modules/scene/types";

export const births = methods({
  // create accepted: the hole fires its jet (knots leave at constant speed); the gathering itself is drawn at the slot
  birth(id: string) {
    if (!this.ok) return;
    const nx = this.m && this.m.next;
    this.births.push({ id, t0: performance.now() / 1000, seat: nx ? new THREE.Vector3(nx.pos.x, nx.pos.y, nx.pos.z) : null, slot: nx ? nx.slot : 1, trail: [], sp: null });
    this.wake();
  },
  // create accepted: a clump of hot gas leaves up the spin axis inside the jet, bends over into the galactic plane and
  // rides its slot's arm outward (the way the arm winds) to the seat; it cools from synchrotron blue-white to H-alpha
  // on the way and dissolves into the new envelope once the instance exists
  drawBirths(nowS: number, dt: number, rm: boolean) {
    for (const b of [...this.births]) {
      const age = nowS - b.t0, sys = [...this.sys.values()].find((o) => o.s && o.s.life && o.s.life.jobId === b.id);
      if (!b.curve) {
        const tp = sys ? sys.g.position.clone() : b.seat;
        if (!tp) { this.dropBirth(b); continue; }
        const n = Math.max(0, (sys ? sys.s.slot : b.slot) - 1) % GX.ARMS, rT = Math.hypot(tp.x, tp.z), aT = Math.atan2(tp.z, tp.x);
        let off = (aT - armAngle(rT, n)) % TAU; if (off > Math.PI) off -= TAU; if (off < -Math.PI) off += TAU;
        const r0 = DISK_OUT + 14, a0 = armAngle(r0, n);
        const pts = [new THREE.Vector3(0, RS * 1.2, 0), new THREE.Vector3(0, 34, 0), new THREE.Vector3(Math.cos(a0) * r0 * 0.55, 30, Math.sin(a0) * r0 * 0.55)];
        for (let k = 0; k <= 12; k++) { const f = k / 12, r = lerp(r0, rT, f), an = armAngle(r, n) + off * f; pts.push(new THREE.Vector3(Math.cos(an) * r, lerp(14, tp.y, Math.sqrt(f)), Math.sin(an) * r)); }
        b.curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
        b.dur = clamp(b.curve.getLength() / 120, 2.6, 5.5);
        b.core = addSprite(TX.glow, new THREE.Color(), 12, 0); this.scene.add(b.core);
        b.tr = Array.from({ length: 12 }, () => { const s = addSprite(TX.glow, new THREE.Color(), 8, 0); this.scene.add(s); return s; });
      }
      const u = clamp((age - 0.15) / b.dur, 0, 1), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      const p = b.curve.getPointAt(rm ? 1 : e);
      const done = u >= 1 && (!!sys || age > 60);
      b.out = done ? Math.min(1, (b.out || 0) + dt / 1.6) : 0;
      if (dt && (!b.lastT || age - b.lastT > 0.05)) { b.trail.unshift(p.clone()); b.trail.length = Math.min(b.trail.length, 12); b.lastT = age; }
      const col = e < 0.35 ? _c1.set("#dfe8ff").lerp(_c2.set("#ffb08c"), e / 0.35) : _c1.set("#ffb08c").lerp(_c2.set("#e0524a"), (e - 0.35) / 0.65);
      const op = Math.min(1, age / 0.3) * (1 - b.out) * (rm ? 0 : 1);
      b.core.position.copy(p); b.core.material.color.copy(col); b.core.material.opacity = 0.75 * op; b.core.scale.setScalar(10 + 8 * e);
      b.tr.forEach((s: any, k: number) => { const q = b.trail[k]; s.visible = !!q; if (!q) return; s.position.copy(q); s.material.color.copy(col); s.material.opacity = 0.32 * op * (1 - k / 12) ** 1.5; s.scale.setScalar((9 + 7 * e) * (1 - k / 16)); });
      if (b.out >= 1) this.dropBirth(b);
    }
  },
  dropBirth(b: any) {
    for (const s of [b.core, ...(b.tr || [])]) if (s) { this.scene.remove(s); s.material.dispose(); }
    this.births.splice(this.births.indexOf(b), 1);
  },
});
