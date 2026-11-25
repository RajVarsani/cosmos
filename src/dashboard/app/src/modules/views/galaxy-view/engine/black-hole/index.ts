import { THREE } from "../three";
import { hash, rng } from "@/lib/hash";
import { GX, armAngle } from "@/modules/scene/model/layout";
import { TAU, RS, DISK_IN, DISK_OUT, clamp, lerp, sstep, _v3, _fd, _c1 } from "../util";
import { bb } from "../shaders/blackbody";
import { pointsMat } from "../shaders/points";
import { methods } from "@/modules/scene/types";

export const blackHole = methods({
  // the hole's pull outside the disk: drift in along the nearest arm (angle falls with r, the disk's spin), Kepler inside
  flowVr(r: number) { return r > DISK_IN ? 8 + 900 / r + 0.08 * r : 60; },
  flowW(r: number, a: number) {
    const kep = -400 * Math.pow(r, -1.5), f = sstep(DISK_OUT, DISK_OUT + 24, r);
    if (!f) return kep;
    let off = Math.PI;
    for (let n = 0; n < GX.ARMS; n++) { let d = (armAngle(r, n) - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; if (Math.abs(d) < Math.abs(off)) off = d; }
    return lerp(kep, -this.flowVr(r) / (GX.PITCH * r) + off * 0.4, f);
  },
  // disk light for gas falling in: T ~ r^-3/4 (dull red -> orange -> white-blue at the ISCO), the approaching side
  // Doppler-beamed brighter and bluer, and inside the ISCO gravitational redshift (g = sqrt(1-rs/r)) dims and reddens it
  // to nothing at the horizon. Sets out, returns the intensity
  diskLight(x: number, y: number, z: number, r: number, cam: THREE.Vector3, out: THREE.Color) {
    const grav = r > DISK_IN ? 1 : Math.sqrt(Math.max(0, 1 - RS / r) / (1 - RS / DISK_IN));
    const beta = 0.55 * Math.sqrt(RS / Math.max(r, RS));
    _v3.set(z, 0, -x).normalize();
    const mu = _v3.dot(_fd.set(cam.x - x, cam.y - y, cam.z - z).normalize()), D = 1 / (1 - beta * mu) * Math.sqrt(1 - beta * beta);
    const T = 13000 * Math.pow(Math.max(r, DISK_IN) / DISK_IN, -0.75) * D * grav;
    bb(clamp(T, 1000, 40000), out);
    return clamp(Math.pow(T / 4000, 1.6), 0.18, 2.4) * Math.pow(D, 1.5) * grav ** 3 * 0.8;
  },
  // reduced motion: no blast, the system's gas just settles into the disk plane and spirals in at Keplerian speed
  fall(pos: THREE.Vector3, s: any) {
    const N = 640, r = rng(hash(s.name + "fall")), pts = new Float32Array(N * 3), c = new Float32Array(N * 3), sz = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pts, 3)); g.setAttribute("aC", new THREE.BufferAttribute(c, 3)); g.setAttribute("aS", new THREE.BufferAttribute(sz, 1));
    const P = new THREE.Points(g, pointsMat("near")); P.material.uniforms.uPR.value = this.pr; P.frustumCulled = false; this.scene.add(P);
    const r0 = Math.hypot(pos.x, pos.z), a0 = Math.atan2(pos.z, pos.x), st: any[] = [];
    for (let k = 0; k < N; k++) { sz[k] = 3 + r() * 4; st.push({ r: r0 + (r() - 0.5) * 14, a: a0 + (r() - 0.5) * 0.12, y: pos.y + (r() - 0.5) * 8, d: r() * 1.5, t: 0, dead: false }); }
    this.falls = this.falls || [];
    this.falls.push({ P, st });
  },
  drawFalls(dt: number) {
    this.feed = this.feedE || 0;
    if (!this.falls) return;
    const cam = this.cam.position;
    for (const f of [...this.falls]) {
      let feed = 0;
      const A = f.P.geometry.attributes.position, C = f.P.geometry.attributes.aC;
      let alive = 0;
      f.st.forEach((q: any, k: number) => {
        q.t += dt;
        if (q.dead || q.t < q.d) { C.setXYZ(k, 0, 0, 0); if (!q.dead) alive++; return; }
        alive++;
        // viscous drift in, faster close to the hole; plunge inside the ISCO
        const vr = q.r > DISK_IN ? 5 + 900 / q.r : 60;
        q.r = Math.max(RS, q.r - vr * dt);
        q.a -= 400 * Math.pow(q.r, -1.5) * dt;
        q.y *= Math.exp(-dt * 0.9);
        const x = Math.cos(q.a) * q.r, z = Math.sin(q.a) * q.r;
        A.setXYZ(k, x, q.y, z);
        const I = this.diskLight(x, q.y, z, q.r, cam, _c1) * 0.6 * Math.min(1, (q.t - q.d) / 1.5);
        C.setXYZ(k, _c1.r * I, _c1.g * I, _c1.b * I);
        if (q.r <= RS * 1.01) q.dead = true;
        else if (q.r < DISK_OUT) feed++;
      });
      A.needsUpdate = C.needsUpdate = true;
      // gas reaching the disk heats its inner part in the shader
      this.feed = Math.min(1, this.feed + feed / 250);
      if (!alive) { this.scene.remove(f.P); f.P.geometry.dispose(); f.P.material.dispose(); this.falls.splice(this.falls.indexOf(f), 1); }
    }
  },
});
