import { THREE } from "../three";
import { hash, rng } from "@/lib/hash";
import { TAU, clamp, lerp, sstep, _v3 } from "../util";
import { DUST } from "../shaders/blackbody";
import { envMat } from "../shaders/envelope";
import { ppMat } from "../shaders/proto";
import { jetMat } from "../shaders/jet";
import { pointsMat } from "../shaders/points";
import { methods } from "@/modules/scene/types";

export const protostar = methods({
  // gravitational infall onto the protostar. Each parcel keeps its angular momentum about the spin axis, so it cannot
  // fall straight in: it swings round, loses its vertical motion in the midplane and settles where j^2 = GM r, which
  // is how the envelope flattens into a disk. The central mass grows with the real fraction up; parcels that reach the
  // star come back from the envelope edge only while envelope is left (1 - fraction), so the cloud visibly depletes
  drawInfall(o: any, s: any, a: any, dt: number, lk: number, lum: number, rm: boolean) {
    if (!o.inf) {
      const N = 1400, R0 = Math.max(s.gext * 1.4, 42);
      const pos = new Float32Array(N * 3), c = new Float32Array(N * 3), sz = new Float32Array(N);
      const r = rng(hash(s.name + "cloud"));
      for (let k = 0; k < N; k++) sz[k] = 2 + r() ** 2 * 4;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("aC", new THREE.BufferAttribute(c, 3));
      g.setAttribute("aS", new THREE.BufferAttribute(sz, 1));
      const pts = new THREE.Points(g, pointsMat("near"));
      pts.material.uniforms.uPR.value = this.pr; pts.frustumCulled = false;
      o.g.add(pts);
      // GM so that the free-fall time from the envelope edge is ~5.5s, inside a typical create: t_ff = pi/2 sqrt(R^3 / 2GM)
      const GM = (Math.PI / 2) ** 2 * R0 ** 3 / (2 * 30);
      o.inf = { pts, N, R0, GM, r, vel: new Float32Array(N * 3), th: new Float32Array(N), live: new Uint8Array(N) };
      for (let k = 0; k < N; k++) { o.inf.th[k] = r(); this.spawn(o, s, k, true); }
    }
    const I = o.inf, P = I.pts.geometry.attributes.position, C = I.pts.geometry.attributes.aC, pa = P.array, v = I.vel;
    if (a.env <= 0.001 && dt) { o.g.remove(I.pts); I.pts.geometry.dispose(); I.pts.material.dispose(); o.inf = null; return; }
    I.pts.visible = !rm;
    if (rm) return;
    const GM = I.GM * (0.3 + 0.7 * lk), rAcc = s.sr * 1.1, eps = 4, disp = a.disp;
    const n = 2, h = Math.min(dt, 0.05) / n;
    for (let st = 0; st < n && h > 0; st++) for (let k = 0; k < I.N; k++) {
      if (!I.live[k]) continue;
      const j3 = k * 3;
      let x = pa[j3], y = pa[j3 + 1], z = pa[j3 + 2], vx = v[j3], vy = v[j3 + 1], vz = v[j3 + 2];
      const r2 = x * x + y * y + z * z + eps, rr = Math.sqrt(r2), f = GM / (r2 * rr);
      vx -= x * f * h; vy -= y * f * h; vz -= z * f * h;
      if (disp) { const out = 40 * disp / rr; vx += x * out * h; vy += y * out * h; vz += z * out * h; }
      // midplane collisions damp vertical motion; viscosity damps radial motion (circularises) and slowly bleeds j
      const rho = Math.hypot(x, z) || 1e-3, ux = x / rho, uz = z / rho;
      const vr = vx * ux + vz * uz, vt = -vx * uz + vz * ux;
      const near = Math.exp(-Math.abs(y) / 6);
      vy *= Math.exp(-h * 1.3 * near);
      const vr2 = vr * Math.exp(-h * 0.5 * near), vt2 = vt * Math.exp(-h * 0.012);
      vx = vr2 * ux - vt2 * uz; vz = vr2 * uz + vt2 * ux;
      x += vx * h; y += vy * h; z += vz * h;
      pa[j3] = x; pa[j3 + 1] = y; pa[j3 + 2] = z; v[j3] = vx; v[j3 + 1] = vy; v[j3 + 2] = vz;
      if (rr < rAcc || rr > I.R0 * 3) this.spawn(o, s, k, I.th[k] > lk && a.env > 0.5 && !disp);
    }
    // dust scattering the protostar's light, reddened; brightest where it has piled into the disk near the star
    const sc = o.bbC, ev = a.env * a.fade * (1 - disp * 0.7);
    for (let k = 0; k < I.N; k++) {
      const j3 = k * 3;
      if (!I.live[k]) { C.setXYZ(k, 0, 0, 0); continue; }
      const r2 = pa[j3] ** 2 + pa[j3 + 1] ** 2 + pa[j3 + 2] ** 2, pol = Math.abs(pa[j3 + 1]) / Math.sqrt(r2 + 1);
      // light escapes up the outflow cavities (the L1527 hourglass); the midplane stays dark
      const b = (0.03 + (1.1 * lum + 0.2) / (1 + r2 / 260)) * (0.35 + 2.2 * sstep(0.35, 0.85, pol)) * ev * 0.5;
      C.setXYZ(k, sc.r * DUST.r * b, sc.g * DUST.g * b, sc.b * DUST.b * b);
    }
    P.needsUpdate = C.needsUpdate = true;
    I.pts.material.uniforms.uO.value = 1;
  },
  spawn(o: any, s: any, k: number, live: boolean) {
    const I = o.inf, r = I.r, j3 = k * 3, P = I.pts.geometry.attributes.position.array;
    I.live[k] = live ? 1 : 0;
    if (!live) { P[j3] = P[j3 + 1] = P[j3 + 2] = 0; return; }
    // a lumpy, slightly oblate envelope
    const rr = I.R0 * (0.5 + 0.5 * Math.cbrt(r())), ct = r() * 2 - 1, st = Math.sqrt(1 - ct * ct), ph = r() * TAU;
    const x = rr * st * Math.cos(ph), y = rr * ct * 0.7, z = rr * st * Math.sin(ph), rho = Math.hypot(x, z) || 1;
    // where it will circularise sets its specific angular momentum: j = sqrt(GM rc)
    const Rd = Math.max(12, (s.planets.length ? Math.max(...s.planets.map((p: any) => p.orbit)) : 8) * 1.15);
    const rc = Math.min(rho * 0.85, 2 + (Rd - 2) * Math.pow(r(), 0.8)), vt = Math.sqrt(I.GM * rc) / rho;
    const vd = 0.6;
    P[j3] = x; P[j3 + 1] = y; P[j3 + 2] = z;
    I.vel[j3] = -z / rho * vt + (r() - 0.5) * vd; I.vel[j3 + 1] = (r() - 0.5) * vd; I.vel[j3 + 2] = x / rho * vt + (r() - 0.5) * vd;
  },
  drawEnv(o: any, s: any, a: any, lk: number, lum: number, cam: THREE.PerspectiveCamera) {
    const on = a.env > 0.001;
    if (!on) { if (o.env) o.env.visible = false; return; }
    if (!o.env) { o.env = new THREE.Mesh(this.stripGeo, envMat()); o.env.renderOrder = -1; o.env.material.uniforms.uSeed.value = (hash(s.name) % 100) / 9; o.g.add(o.env); }
    const U = o.env.material.uniforms, R = Math.max(s.gext * 1.5, 44) * (1 - 0.35 * lk) * (1 + 0.8 * a.disp);
    o.env.visible = true; o.env.scale.setScalar(R); o.env.quaternion.copy(cam.quaternion);
    // the spin axis as the camera sees it
    _v3.set(0, 1, 0).transformDirection(cam.matrixWorldInverse);
    const l2 = Math.hypot(_v3.x, _v3.y) || 1;
    U.uAx.value.set(_v3.x / l2, _v3.y / l2); U.uSin.value = clamp(l2, 0, 1);
    U.uOpen.value = lerp(0.12, 0.75, lk); U.uD.value = (1 - 0.85 * lk) * (1 - a.disp);
    U.uC.value.copy(o.bbC).multiply(DUST); U.uL.value = (0.25 + 1.4 * lum) * (1 - 0.75 * lk);
    U.uO.value = a.env * a.fade;
  },
  // the disk seen at HL Tau's resolution: gaps sit on the lanes and deepen as their services come up
  drawDisk(o: any, s: any, a: any, _lk: number, lum: number, up: boolean) {
    const on = a.env > 0.001;
    if (!on) { if (o.pp) o.pp.visible = false; return; }
    if (!o.pp) { o.pp = new THREE.Mesh(this.ppGeo, ppMat()); o.pp.rotation.x = -Math.PI / 2; o.pp.renderOrder = 1; o.g.add(o.pp); }
    const U = o.pp.material.uniforms, qs = [...o.pmap.values()];
    const Rd = Math.max(12, ...qs.map((q) => q.orbitCur * 1.12)), sc = Rd * 1.25, ex = o.pg.scale.x;
    o.pp.visible = true; o.pp.scale.setScalar(sc * ex); U.uSc.value = sc; U.uRd.value = Rd; U.uIn.value = s.sr * 1.3;
    const depth: Record<number, number> = { 0: 0.2, 1: 0.55, 2: 0.8, 3: 0.95, [-1]: 0.5 };
    for (let k = 0; k < 12; k++) {
      const q = qs[k];
      U.uG.value[k] = q ? q.orbitCur : -100;
      U.uGD.value[k] = q ? (up ? depth[q.p.phase] ?? 0.9 : 0.95) * (q.life ? 1 - q.life.decay : 1) : 0;
      U.uGW.value[k] = q ? Math.max(0.6, q.p.reach * 0.45) : 1;
    }
    U.uC.value.copy(o.bbC).multiply(DUST);
    U.uL.value = 0.35 + 0.9 * lum;
    U.uO.value = a.env * a.fade * (1 - a.disp) * lerp(0.6, 1, a.detail);
  },
  knot(o: any) { o.knots.push({ d: 1.5, I: 1 }); if (o.knots.length > 8) o.knots.shift(); },
  // Herbig-Haro outflow: a faint collimated beam while it accretes, and a bow-shock knot pair for each service that passes
  drawHH(o: any, s: any, a: any, dt: number, lk: number, creating: boolean, cam: THREE.PerspectiveCamera) {
    const beam = creating ? 0.22 * a.env * (1 - 0.6 * lk) : 0;
    o.knots = o.knots.filter((q: any) => q.d < (o.hhLen || 60));
    if (!beam && !o.knots.length) { if (o.hh) o.hh.visible = false; return; }
    if (!o.hh) {
      o.hh = new THREE.Mesh(this.stripGeo, jetMat("#ff5a44", "#b81c2c", false)); o.hh.renderOrder = 4; o.g.add(o.hh);
    }
    const len = o.hhLen = Math.max(s.gext * 1.8, 50), U = o.hh.material.uniforms;
    o.hh.visible = true;
    o.hh.scale.set(8, len, 1); U.uLen.value = len; U.uWid.value = 8; U.uW0.value = 0.35; U.uOpen.value = 0.05;
    o.hh.rotation.y = Math.atan2(cam.position.x - o.g.position.x, cam.position.z - o.g.position.z);
    for (let k = 0; k < 8; k++) {
      const q = o.knots[k];
      if (q && dt) q.d += 11 * dt;
      U.uK.value[k] = q ? q.d : -1;
      U.uKI.value[k] = q ? 0.9 / (1 + q.d / 14) : 0;
    }
    U.uBeam.value = beam;
    U.uO.value = a.fade;
  },
});
