import * as THREE from "three";
import { ui } from "@/state/ui-store";
import { RM } from "@/lib/motion/reduced";
import type { Insets } from "@/modules/scene/handle";
import { clamp, ease3, lerp } from "../math";
import { methods } from "../types";

// camera polar angle: nearly the whole sphere, a hair off each pole so lookAt never flips
export const PHI_MIN = 0.02, PHI_MAX = Math.PI - 0.02;

export const camera = methods({
  // ---------- camera ----------
  fitDist(R: number, availW: number, availH: number, phi: number) {
    const vt = Math.tan((this.cam.fov * Math.PI) / 360), ht = vt * this.cam.aspect;
    const elev = Math.PI / 2 - phi;
    // a point on the near rim sits R*cos(elev) closer to the camera, so it projects further out
    const dh = R / (ht * availW / this.W), dv = (R * Math.abs(Math.sin(elev)) + 24) / (vt * availH / this.H);
    return Math.max(dh, dv) + R * Math.cos(elev) * 0.85;
  },
  // panels cover the right (r) and bottom (b) edges; goals frame the free area and shift the view onto its centre
  free() { const { r, b } = this.ins; return { w: Math.max(160, this.W - r), h: Math.max(160, this.H - b), ox: r / 2, oy: b / 2 }; },
  homeGoal() {
    const m = this.m, narrow = this.W < 600;
    const phi = narrow ? 0.78 : 1.0;
    const b = m ? m.bound : { R: 200 }, f = this.free();
    // camera target is always the core (world origin) so it stays dead centre of the free area at every zoom
    return { tgt: new THREE.Vector3(0, 0, 0), dist: this.fitDist(b.R, f.w, f.h, phi), phi, ox: f.ox, oy: f.oy };
  },
  // the system's outer edge spans about 60% of the area left between the top bar and the sheet, centred in it
  focusGoal(s: any) {
    const phi = 0.9, { r, b, top } = this.ins, w = Math.max(160, this.W - r), h = Math.max(160, this.H - b - top);
    const vt = Math.tan((this.cam.fov * Math.PI) / 360), fill = 0.6;
    const dh = s.gext / (fill * (w / this.W) * vt * this.cam.aspect);
    const dv = (s.gext * Math.max(0.45, Math.sin(Math.PI / 2 - phi))) / (fill * (h / this.H) * vt);
    const pull = (this.sys.get(s.name) || {}).pull ? 1.6 : 1;
    return { tgt: new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z), dist: Math.max(dh, dv) * pull, phi, ox: r / 2, oy: (b - top) / 2 };
  },
  // a planet, its rings and satellite fill about a third of the free area; the target tracks it along its orbit
  planetGoal(name: string, svc: string) {
    const q = this.planetOf(name, svc);
    if (!q) return null;
    const f = this.free(), phi = this.ctl.phi;
    const vt = Math.tan((this.cam.fov * Math.PI) / 360), frac = Math.min(f.h / this.H, (f.w / this.W) * this.cam.aspect) / 3;
    return { tgt: this.planetPos(name, svc, new THREE.Vector3()), dist: (q.p.reach * (this.sys.get(name).s.k || 1)) / (vt * frac), phi, ox: f.ox, oy: f.oy, track: [name, svc] };
  },
  // the pose carries across a view switch, so toggling at an angle keeps the angle
  savePose() { const c = this.ctl; return { tgt: [c.tgt.x, c.tgt.y, c.tgt.z], theta: c.theta, phi: c.phi, dist: c.dist, ox: c.ox, oy: c.oy, homeLock: this.homeLock, lastInput: this.lastInput }; },
  loadPose(p: any) {
    const c = this.ctl;
    c.tgt.set(p.tgt[0], p.tgt[1], p.tgt[2]);
    Object.assign(c, { theta: p.theta, phi: p.phi, dist: p.dist, ox: p.ox, oy: p.oy, vt: 0, vp: 0 });
    this.homeLock = p.homeLock; this.lastInput = p.lastInput; this.flight = null; this.easeHome = false;
    if (this.m) this.home = this.homeGoal();
    this.still();
  },
  setLayout(ins: Insets, fly?: boolean) {
    this.ins = ins;
    if (!this.ok || !this.m) return;
    this.home = this.homeGoal();
    if (fly) this.refocus(); else this.still();
  },
  refocus(snap?: boolean) {
    if (!this.ok || !this.m) return;
    const s = ui().focus && (this.m.systems.find((x: any) => x.name === ui().focus) || (this.sys.get(ui().focus!) || {}).s);
    const pg = s && ui().planet ? this.planetGoal(s.name, ui().planet) : null;
    const goal = pg || (s ? this.focusGoal(s) : (this.home = this.homeGoal()));
    this.homeLock = !s;
    this.easeHome = false;
    const c = this.ctl;
    if (snap || RM.matches) { c.tgt.copy(goal.tgt); c.dist = goal.dist; c.phi = goal.phi; c.ox = goal.ox; c.oy = goal.oy; this.flight = null; this.still(); return; }
    const span = c.tgt.distanceTo(goal.tgt);
    this.flight = {
      from: { tgt: c.tgt.clone(), dist: c.dist, phi: c.phi, ox: c.ox, oy: c.oy }, to: goal,
      t0: performance.now(), dur: clamp(700 + span * 2.2 + Math.abs(Math.log(goal.dist / c.dist)) * 260, 800, 1900),
      bump: Math.min(span * 0.55, 420),
    };
    this.markBusy(false);
    this.wake();
  },
  updateCam(dt: number, now: number) {
    const c = this.ctl;
    if (this.flight) {
      const f = this.flight, k = clamp((now - f.t0) / f.dur, 0, 1), e = ease3(k);
      if (f.to.track) this.planetPos(f.to.track[0], f.to.track[1], f.to.tgt);
      c.tgt.lerpVectors(f.from.tgt, f.to.tgt, e);
      c.dist = Math.exp(lerp(Math.log(f.from.dist), Math.log(f.to.dist), e)) + f.bump * Math.sin(Math.PI * k);
      c.phi = lerp(f.from.phi, f.to.phi, e);
      c.ox = lerp(f.from.ox, f.to.ox, e); c.oy = lerp(f.from.oy, f.to.oy, e);
      if (k >= 1) this.flight = null;
    } else if (this.easeHome && this.home) {
      const k = 1 - Math.exp(-dt * 1.4);
      // idle drift home keeps whatever tilt the viewer chose
      c.tgt.lerp(this.home.tgt, k); c.dist = lerp(c.dist, this.home.dist, k);
      c.ox = lerp(c.ox, this.home.ox, k); c.oy = lerp(c.oy, this.home.oy, k);
      if (Math.abs(c.dist - this.home.dist) < 1 && c.tgt.distanceTo(this.home.tgt) < 0.5) this.easeHome = false;
    }
    if (!this.flight && ui().focus && ui().planet) this.planetPos(ui().focus, ui().planet, c.tgt);
    if (!this.down) {
      c.theta += c.vt * dt; c.phi = clamp(c.phi + c.vp * dt, PHI_MIN, PHI_MAX);
      const damp = Math.exp(-dt * 3.2); c.vt *= damp; c.vp *= damp;
      const hovering = this.hover || this.hoverSat || this.hoverFree || this.hoverCore;
      if (!RM.matches && !hovering && now - this.lastInput > 5000 && Math.abs(c.vt) < 0.02) c.theta += dt * (ui().focus ? 0.045 : 0.028);
      if (!ui().focus && this.homeLock && now - this.lastInput > 20000 && !this.flight && this.home) this.easeHome = true;
    }
    const sp = Math.sin(c.phi);
    this.cam.position.set(c.tgt.x + c.dist * sp * Math.cos(c.theta), c.tgt.y + c.dist * Math.cos(c.phi), c.tgt.z + c.dist * sp * Math.sin(c.theta));
    this.cam.lookAt(c.tgt);
    const ox = c.ox, oy = c.oy;
    if (Math.abs(ox) + Math.abs(oy) > 0.2) this.cam.setViewOffset(this.W, this.H, ox, oy, this.W, this.H);
    else this.cam.clearViewOffset();
    this.cam.far = c.dist * 4 + 12000;
    this.cam.updateProjectionMatrix();
    // lookAt leaves matrixWorldInverse on the new position but the previous rotation; proj() and the lens need this frame's
    this.cam.updateMatrixWorld(true);
  },

  // ---------- interaction fade: hide in-scene labels + core overlay while the camera is dragged, zoomed or flying ----------
  // the HUD chrome (bar, gauge, dock) never fades for this; only \ (ui-off) hides it
  markBusy(_user = true) {
    this.held && this.held.clear();
    if (this.settleTimer) { clearTimeout(this.settleTimer); this.settleTimer = 0; }
    if (!this.camBusy) { this.camBusy = true; this.host && this.host.classList.add("cz-busy"); }
  },
  scheduleSettle() {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = 0;
      this.still(); // reposition once before the fade-in (matters under reduced-motion, where the loop isn't continuous)
      requestAnimationFrame(() => { this.camBusy = false; this.host && this.host.classList.remove("cz-busy"); });
    }, 150);
  },
});
