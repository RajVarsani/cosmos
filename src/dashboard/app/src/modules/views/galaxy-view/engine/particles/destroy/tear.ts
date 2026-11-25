import { THREE } from "../../three";
import { hash, rng } from "@/lib/hash";
import { clamp, _c1 } from "../../util";
import { bb } from "../../shaders/blackbody";
import { pointsMat } from "../../shaders/points";
import { methods } from "@/modules/scene/types";

export const tear = methods({
  // a stopped container: its planet heats, then is torn into a hot stream that wraps round the star and falls in
  tear(o: any, q: any) {
    const N = 520, r = rng(hash(o.s.name + q.p.svc + "tear")), P = new Float32Array(N * 3), C = new Float32Array(N * 3), S = new Float32Array(N), st: any[] = [];
    const a = this.anim.get(o.s.name), ang0 = q.p.ph + ((a && a.rot) || 0), R0 = q.orbitCur, sz = Math.max(q.sizeCur, 0.6);
    for (let k = 0; k < N; k++) {
      const f = r();
      // debris closer to the star leads (it orbits faster) and debris further out trails: the stream shears into an arc
      const dr = (f - 0.5) * sz * 2.2;
      st.push({ r: R0 + dr, a: ang0 - f * 0.9 + (r() - 0.5) * 0.05, y: (r() - 0.5) * sz * 0.35, w: 0.8 + 1.2 * (1 - f), vr: (0.5 + 0.5 * r()) * R0 / 2.6, T0: 3200 + 1800 * r(), life: 2 + 0.9 * r(), dead: false });
      S[k] = 1.6 + r() * 2.2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("aC", new THREE.BufferAttribute(C, 3)); g.setAttribute("aS", new THREE.BufferAttribute(S, 1));
    const pts = new THREE.Points(g, pointsMat("near")); pts.material.uniforms.uPR.value = this.pr; pts.frustumCulled = false; o.pg.add(pts);
    return { pts, st, t: 0, R0, done: false };
  },
  drawTear(q: any, dt: number, starR: number) {
    const T = q.stream; T.t += dt;
    const A = T.pts.geometry.attributes.position, C = T.pts.geometry.attributes.aC;
    let alive = 0;
    T.st.forEach((m: any, k: number) => {
      if (m.dead) { C.setXYZ(k, 0, 0, 0); return; }
      alive++;
      // angular momentum kept as it falls, so it whips round faster the deeper it goes
      m.r = Math.max(starR * 0.8, m.r - m.vr * dt * (1 + T.t * 1.4));
      m.a += m.w * dt * Math.pow(T.R0 / m.r, 2);
      m.y *= Math.exp(-dt * 2.5);
      A.setXYZ(k, Math.cos(m.a) * m.r, m.y, Math.sin(m.a) * m.r);
      const Tk = Math.min(6500, m.T0 * Math.pow(T.R0 / m.r, 0.45)), I = clamp(Math.pow(Tk / 4500, 2), 0.25, 1.8) * 0.3 * Math.min(1, T.t / 0.12);
      bb(clamp(Tk, 1500, 30000), _c1);
      C.setXYZ(k, _c1.r * I, _c1.g * I, _c1.b * I);
      if (m.r <= starR * 0.85 || T.t >= 8) m.dead = true;
    });
    A.needsUpdate = C.needsUpdate = true;
    if (!alive) T.done = true;
  },
});
