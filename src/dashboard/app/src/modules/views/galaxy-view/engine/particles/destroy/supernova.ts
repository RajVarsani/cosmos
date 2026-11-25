import { THREE } from "../../three";
import { ui } from "@/state/ui-store";
import { hash, rng } from "@/lib/hash";
import { RM } from "@/lib/motion/reduced";
import { TAU, RS, DISK_OUT, clamp, lerp, sstep, _c1, _c2, _fv } from "../../util";
import { TX, addSprite } from "../../textures";
import { EM, bb } from "../../shaders/blackbody";
import { pointsMat } from "../../shaders/points";
import { methods } from "@/modules/scene/types";

// destroy ejecta: shared parcel budget, and at most this much tidal debris caught by the shock
const SN_BUDGET = 4800, SN_CATCH = 600;

export const supernova = methods({
  // a system that left. Destroyed on purpose: its ejecta (thrown when the last container went) carry on into the hole;
  // with reduced motion there is no blast, just a calm stream. Failed: the cloud disperses and the error stays readable
  remnant(o: any, g: any) {
    const s = o.s, fail = !!(g && g.fail);
    if (fail) {
      const pos = o.g.position.clone(), haze = addSprite(TX.glow, new THREE.Color("#8a4a36"), s.gext * 2.4, 0.12); haze.position.copy(pos); this.scene.add(haze);
      this.remnants.push({ kind: "fail", t0: performance.now() / 1000, pos, haze, name: s.name, label: s.label, error: g.error, dur: 12 });
    } else if (!o.sn && !RM.matches) this.supernova(o);
    if (!fail && RM.matches) this.fall(o.g.position.clone(), s);
    this.wake();
  },
  // the last container goes: core collapse, a shock-breakout flash, then fast lopsided ejecta (Cas A / Crab): hot knots,
  // H-alpha and [O III] filaments, a pair of jets. The same parcels then drag to a halt and fall into the hole
  supernova(o: any) {
    if (o.sn) return;
    const s = o.s, pos = o.g.position.clone(), E = s.gext, V = E * 0.6, t0 = performance.now() / 1000, r = rng(hash(s.name + "sn"));
    const flash = addSprite(TX.glow, bb(26000), s.sr * 2, 0); flash.position.copy(pos); this.scene.add(flash);
    // tidal debris still in flight is caught by the shock and thrown out with the rest
    const caught: THREE.Vector3[] = [];
    for (const q of o.pmap.values()) {
      const T = q.stream; if (!T || T.done) continue;
      const A = T.pts.geometry.attributes.position, C = T.pts.geometry.attributes.aC; T.pts.updateMatrixWorld(true);
      T.st.forEach((m: any, k: number) => { if (m.dead || caught.length >= SN_CATCH) return; caught.push(new THREE.Vector3().fromBufferAttribute(A, k).applyMatrix4(T.pts.matrixWorld)); m.dead = true; C.setXYZ(k, 0, 0, 0); });
      C.needsUpdate = true;
    }
    // one budget across simultaneous destroys; the oldest gives way past the cap
    this.snPool = this.snPool || [];
    let live = 0; for (const q of this.remnants) if (q.kind === "sn") live += q.n;
    const N0 = Math.round(1600 * clamp((SN_BUDGET - live) / 1600, 0.25, 1)), N = N0 + caught.length;
    while (live + N > SN_BUDGET + 1600) { const old = this.remnants.find((q: any) => q.kind === "sn"); if (!old) break; live -= old.n; this.dropRemnant(old); }
    const st: any[] = [];
    const clumps = Array.from({ length: 46 }, () => { const u = r() * 2 - 1, th = r() * TAU, q2 = Math.sqrt(1 - u * u); return new THREE.Vector3(q2 * Math.cos(th), u, q2 * Math.sin(th)); });
    const A1 = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), A2 = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), J = new THREE.Vector3(r() - 0.5, r() * 0.6 + 0.4, r() - 0.5).normalize();
    const pts = this.snPool.pop() || this.snPoints();
    const PA = pts.geometry.attributes.position, CA = pts.geometry.attributes.aC, SA = pts.geometry.attributes.aS;
    for (let k = 0; k < N; k++) {
      let p: THREE.Vector3, d: THREE.Vector3, sp: number, kind: number;
      if (k < caught.length) {
        p = caught[k]; d = p.clone().sub(pos); if (d.lengthSq() < 1e-8) d.set(0, 1, 0); d.normalize();
        sp = V * (0.45 + 0.35 * r()); kind = r() < 0.3 ? 0 : 1;
      } else {
        const jet = r() < 0.07, c0 = clumps[(r() * clumps.length) | 0];
        d = (jet ? J.clone().multiplyScalar(r() < 0.5 ? 1 : -1) : c0.clone()).add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(jet ? 0.22 : 0.42)).normalize();
        const lump = 0.7 + 0.6 * (0.5 + 0.5 * Math.sin(d.dot(A1) * 3.1 + 1.3) * Math.sin(d.dot(A2) * 2.3 + 0.4));
        sp = V * (jet ? 0.6 + 1.2 * r() : lump * (0.93 + 0.12 * r())); kind = jet || r() < 0.12 ? 0 : r() < 0.3 ? 2 : 1;
        p = pos.clone();
      }
      // knots are dense and plough on; the thin gas stalls sooner and is taken first
      st.push({ p, v: d.multiplyScalar(sp), kind, kD: kind === 0 ? 0.28 : 0.55, tc: (kind === 0 ? 2 : 1.3) + 1.6 * r(), b: kind === 0 ? 1.3 : 0.85, pol: null, dead: false });
      PA.setXYZ(k, p.x, p.y, p.z); CA.setXYZ(k, 0, 0, 0);
      SA.setX(k, kind === 0 ? 3 + r() * 3 : 4 + r() * 5);
    }
    PA.needsUpdate = CA.needsUpdate = SA.needsUpdate = true;
    pts.geometry.setDrawRange(0, N); pts.material.uniforms.uPR.value = this.pr; pts.visible = true; this.scene.add(pts);
    o.sn = { kind: "sn", t0, pos, flash, pts, st, n: N, V, E, sr: s.sr, done: false };
    this.remnants.push(o.sn);
    // in the zoomed view the camera steps back so the blast fits
    if (ui().focus === s.name) { o.pull = true; this.refocus(); }
    this.wake();
  },
  snPoints() {
    const M = SN_BUDGET, g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(M * 3), 3)); g.setAttribute("aC", new THREE.BufferAttribute(new Float32Array(M * 3), 3)); g.setAttribute("aS", new THREE.BufferAttribute(new Float32Array(M), 1));
    const pts = new THREE.Points(g, pointsMat("near")); pts.frustumCulled = false;
    return pts;
  },
  drawEjecta(q: any, age: number, dt: number, rm: boolean) {
    // shock breakout: a white-blue flash that lights everything round it
    q.flash.scale.setScalar(q.sr * 2 + q.E * 4 * (1 - Math.exp(-age / 0.12)));
    q.flash.material.opacity = 1.3 * Math.exp(-age / 0.35);
    q.flash.material.color.copy(bb(lerp(26000, 9000, clamp(age / 1.2, 0, 1)), _c2));
    const A = q.pts.geometry.attributes.position, C = q.pts.geometry.attributes.aC, cam = this.cam.position;
    const boost = 1 + 4 * Math.exp(-age / 0.3), thin = 0.45 + 0.55 * Math.exp(-age / 2.5);
    let alive = 0, feed = 0;
    for (let k = 0; k < q.n; k++) {
      const m = q.st[k];
      if (m.dead) { C.setXYZ(k, 0, 0, 0); continue; }
      alive++;
      let x: number, y: number, z: number, R: number;
      if (!m.pol) {
        const p = m.p, v = m.v;
        // drag against the ISM, then the hole's pull takes over the velocity
        v.multiplyScalar(Math.exp(-m.kD * dt));
        const w = sstep(m.tc, m.tc + 2.2, age);
        if (w > 0) {
          R = Math.hypot(p.x, p.z); const a = Math.atan2(p.z, p.x), vr = this.flowVr(R), om = this.flowW(R, a) * R, ca = Math.cos(a), sa = Math.sin(a);
          _fv.set(-vr * ca - om * sa, -p.y * 0.9, -vr * sa + om * ca);
          v.lerp(_fv, 1 - Math.exp(-dt * 3 * w));
        }
        p.addScaledVector(v, dt);
        R = Math.hypot(p.x, p.z);
        if (age > m.tc + 3.2 || R < DISK_OUT) m.pol = { r: R, a: Math.atan2(p.z, p.x), y: p.y };
        x = p.x; y = p.y; z = p.z;
      } else {
        const P = m.pol;
        P.r = Math.max(RS, P.r - this.flowVr(P.r) * dt);
        P.a += this.flowW(P.r, P.a) * dt;
        P.y *= Math.exp(-dt * 0.9);
        R = P.r; x = Math.cos(P.a) * R; y = P.y; z = Math.sin(P.a) * R;
        if (R <= RS * 1.01) m.dead = true;
        else if (R < DISK_OUT) feed++;
      }
      A.setXYZ(k, x, y, z);
      // leaves white-hot, cools into line emission (knots stay warm), then heats again as it joins the infall
      const cool = clamp(age / (m.kind === 0 ? 4 : 1.6), 0, 1);
      bb(lerp(16000, m.kind === 0 ? 3000 : 5000, cool), _c1);
      if (m.kind) _c1.lerp(m.kind === 1 ? EM.ha : EM.o3, cool);
      _c1.multiplyScalar((m.kind === 0 ? 1.1 : 0.6) * boost * thin * Math.min(1, age / 0.08));
      const h = sstep(m.tc + 0.6, m.tc + 3.6, age);
      if (h > 0) { const I = this.diskLight(x, y, z, R, cam, _c2) * m.b; _c1.lerp(_c2.multiplyScalar(I), h); }
      C.setXYZ(k, _c1.r, _c1.g, _c1.b);
    }
    A.needsUpdate = C.needsUpdate = true;
    q.pts.visible = !rm;
    this.feedE = Math.min(1, (this.feedE || 0) + feed / 250);
    q.done = (!alive && age > 3) || age > 60;
  },
});
