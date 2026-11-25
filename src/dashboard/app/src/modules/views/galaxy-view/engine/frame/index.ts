import { THREE } from "../three";
import { ui } from "@/state/ui-store";
import { esc, mib } from "@/lib/format";
import { lifeLine } from "@/domain/life";
import { RM } from "@/lib/motion/reduced";
import { SAT_R } from "@/modules/scene/model/layout";
import { TAU, RS, clamp, lerp, ease3, angDiff, sstep, _c1, _v3, _eul, _m4, _q4 } from "../util";
import { bhMat } from "../shaders/black-hole";
import { sweepMat } from "../shaders/sweep";
import { bb } from "../shaders/blackbody";
import { SAT_BUS, SAT_SPAN } from "../shaders/sat";
import { shareMark, sysLabel } from "@/modules/scene/labels";
import { methods } from "@/modules/scene/types";

export const frame = methods({
  frame(ts: number, dt: number) {
    if (!this.m || !this.W) return;
    const rm = RM.matches;
    this.t = rm ? 38 : ts / 1000;
    const t = this.t;
    this.updateCam(dt, ts);
    // dragging or coasting on inertia still counts as camera movement; flight already marks busy on start
    const dragMoving = !!(this.down && this.down.moved);
    const coasting = !dragMoving && !this.down && (Math.abs(this.ctl.vt) > 0.02 || Math.abs(this.ctl.vp) > 0.02);
    if (dragMoving || coasting) this.markBusy();
    else if (this.flight) this.markBusy(false);
    else if (this.camBusy && !this.settleTimer) this.scheduleSettle();
    const cam = this.cam, m = this.m;
    const BU = bhMat.uniforms;
    BU.uT.value = t;
    // the horizon answers a hover (and a birth): the disk brightens and the lensed sky ripples
    const nowS = ts / 1000;
    let jetI = 0;
    const bj = this.bhJet.material.uniforms;
    const jb = this.births.filter((b: any) => nowS - b.t0 < 4.5);
    jb.forEach((b: any, k: number) => { const age = nowS - b.t0; jetI = Math.max(jetI, Math.min(1, age / 0.3) * Math.max(0, 1 - age / 4.5)); if (k < 8) { bj.uK.value[k] = age * 55; bj.uKI.value[k] = 1.2 / (1 + age); } });
    for (let k = jb.length; k < 8; k++) bj.uK.value[k] = -1;
    this.hc = dt ? lerp(this.hc, this.hoverCore ? 1 : 0, 1 - Math.exp(-dt * 6)) : this.hoverCore ? 1 : 0;
    BU.uHov.value = Math.max(this.hc, jetI * 0.5);
    BU.uRip.value = rm ? 0 : this.hc;
    BU.uRipT.value = t;
    BU.uFeed.value = this.feed || 0;
    this.bh.quaternion.copy(cam.quaternion);
    BU.uVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    // step budget follows the hole's size on screen: coarse in the galaxy view, fine when it fills the view
    const bhPx = (BU.uRb.value / (cam.position.length() * Math.tan((cam.fov * Math.PI) / 360))) * (this.H / 2) * this.pr, bl = clamp(bhPx / 700, 0, 1);
    BU.uSteps.value = lerp(90, 200, bl); BU.uK.value = lerp(0.16, 0.07, bl);
    bj.uBeam.value = jetI * 0.5; bj.uO.value = rm ? 0 : 1;
    this.bhJet.visible = jetI > 0.002 && !rm;
    this.bhJet.rotation.y = Math.atan2(cam.position.x, cam.position.z);
    // pulsar: one sweep per real poll of /api/overview
    const period = ui().pollEvery || 2000, since = ui().pollAt ? ts - ui().pollAt : 0;
    const phase = rm ? 0.3 : clamp(since / period, 0, 1);
    const A = -Math.PI / 2 + phase * TAU;
    sweepMat.uniforms.uA.value = A;
    sweepMat.uniforms.uI.value = rm ? 0.35 : ui().err ? 0.5 : phase >= 1 ? 0.35 : 1;
    sweepMat.uniforms.uC.value.set(ui().err ? "#ff5b7a" : "#bfe8ff");
    const prevA = this.prevA ?? A;
    this.prevA = A;

    const focus = ui().focus && this.sys.get(ui().focus!);
    const camDist = (p: THREE.Vector3) => cam.position.distanceTo(p);
    const W = this.W, H = this.H;
    const proj = (v: THREE.Vector3) => { const p = v.clone().project(cam); return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, z: p.z }; };
    const pxPer = (v: THREE.Vector3, world: number) => { const d = camDist(v); return (world / (d * Math.tan((cam.fov * Math.PI) / 360))) * (H / 2); };
    this.hits = [];
    const labels: any[] = [];

    // black hole
    const bh = proj(new THREE.Vector3(0, 0, 0));
    this.coreGlow.material.opacity = 0.2;
    // core stays unlabelled in-scene (duplicates the header's "core :port · pid"); hover still shows the tooltip
    this.hits.push({ type: "core", x: bh.x, y: bh.y, r: Math.max(18, pxPer(new THREE.Vector3(), RS * 2)) });

    // inside a system the galaxy's dust steps back
    const du = this.dust.material.uniforms.uO;
    du.value = dt ? lerp(du.value, focus ? 0.4 : 1, 1 - Math.exp(-dt * 3)) : focus ? 0.4 : 1;
    for (const [name, o] of this.sys) {
      const s = o.s, a = this.anim.get(name);
      const isF = focus && focus === o, other = focus && !isF, hov = this.hover === name && !focus;
      const wp = o.g.position;
      const near = camDist(wp) < s.gext * 11;
      a.detail = lerp(a.detail, isF || hov || near ? 1 : 0, dt ? 1 - Math.exp(-dt * 6) : 1);
      // one size in every view; the camera comes closer instead
      const lod = s.k, ex = lod;
      o.pg.scale.setScalar(ex);
      o.aura.scale.setScalar(s.gext * 2.6);
      a.fade = lerp(a.fade, other ? 0.22 : 1, dt ? 1 - Math.exp(-dt * 5) : 1);
      // pulsar crossing
      const sa = Math.atan2(wp.z, wp.x);
      if (!rm && a.fresh && dt && angDiff(prevA, sa) <= 0 && angDiff(A, sa) > -0.001 === false) {}
      if (!rm && a.fresh && dt) { const d0 = ((sa - prevA) % TAU + TAU) % TAU, span = ((A - prevA) % TAU + TAU) % TAU; if (span > 0 && span < 1.5 && d0 <= span) { a.flare = 1; a.fresh = false; } }
      a.flare = Math.max(0, a.flare - dt * 1.3);
      const alive = s.st === "ok", go = s.st === "go", bad = s.st === "bad", off = s.st === "off";
      // life stage, from the real job and containers: fraction up (or gone), per-service phase
      const L = s.life, failed = !!(L && L.failed), mode = L && !failed ? L.kind : null;
      const up = mode === "create" || mode === "start", creating = mode === "create", removing = mode === "remove";
      const kf = L ? L.frac : 1;
      if (a.mode !== mode) { a.mode = mode; a.lk = mode === "remove" ? 0 : kf; }
      a.lk = dt ? lerp(a.lk ?? kf, kf, 1 - Math.exp(-dt * 1.2)) : kf;
      const lk = a.lk, shed = removing && kf >= 0.999 && lk >= 0.97;
      // envelope + disk exist while a create runs and clear over a few seconds once it is ready; a failed create disperses
      a.env = dt ? clamp((a.env ?? (creating ? 1 : 0)) + (creating ? dt / 1.5 : -dt / (failed ? 7 : 5)), 0, 1) : creating ? 1 : 0;
      a.disp = failed && L.up ? Math.min(1, (a.disp || 0) + dt / 5) : 0;
      // the star: blackbody temperature and luminosity follow the fraction; the backend colour is its main-sequence identity
      const sc = o.starC;
      let lum = 1, swell = 1, surf = 1;
      // dust scatters the protostar's blackbody light, not the backend's identity colour
      bb(up ? lerp(creating ? 2300 : 2100, 6200, Math.pow(lk, 0.8)) : 5200, o.bbC || (o.bbC = new THREE.Color()));
      if (up) { sc.copy(o.bbC).lerp(o.col, sstep(0.55, 1, lk)); lum = creating ? 0.06 + 0.94 * Math.pow(lk, 1.5) : 0.25 + 0.75 * lk; }
      else if (shed) { bb(38000, sc); swell = 0.22; surf = 1; lum = 0.6; }
      else if (removing) { sc.copy(o.col).lerp(bb(3100, _c1), sstep(0, 0.6, lk)); swell = 1 + 2.6 * ease3(lk); surf = 1 - 0.35 * lk; }
      else if (mode === "stop") { sc.copy(o.col).lerp(bb(2000, _c1), lk); lum = 1 - 0.75 * lk; swell = 1 - 0.45 * lk; }
      else sc.copy(o.col);
      if (shed && !o.sn && !rm) this.supernova(o);
      for (const sp of [o.glow, o.glow2, o.spike, o.aura]) sp.material.color.copy(sc);
      o.core.material.color.copy(o.coreC).lerp(sc, removing ? 0.85 : mode ? 0.55 : 0);
      if (a.env > 0.001 || o.inf) this.drawInfall(o, s, a, dt, lk, lum, rm);
      this.drawEnv(o, s, a, lk, lum, cam);
      this.drawDisk(o, s, a, lk, lum, up);
      this.drawHH(o, s, a, dt, lk, creating, cam);
      const flick = bad ? 0.55 + 0.45 * Math.abs(Math.sin(t * 11 + s.slot) * Math.sin(t * 2.7)) : 1;
      const fl = a.flare * a.flare;
      o.glow.material.opacity = (off ? 0.5 : 0.9) * a.fade * flick * lum * surf;
      // the star steps back when you are inside its system, so it lights the planets without blowing them out
      a.quiet = dt ? lerp(a.quiet ?? 0, isF ? 1 : 0, 1 - Math.exp(-dt * 4)) : isF ? 1 : 0;
      const qs = lerp(1, 0.42, a.quiet * (removing ? 1 - lk : 1));
      o.glow.scale.setScalar(s.k * s.sr * (off ? 5 : 10) * qs * swell * (0.3 + 0.7 * Math.sqrt(lum)) * (1 + fl * 0.9));
      // the photosphere itself swells into a red giant during a destroy
      o.core.scale.setScalar(s.k * s.sr * 1.7 * lerp(1, 0.7, a.quiet) * (0.45 + 0.55 * Math.sqrt(lum)) * (removing ? swell : Math.min(1.5, swell)));
      o.aura.material.opacity = (off ? 0.025 : 0.06) * a.fade * (1 - a.detail * 0.6) * lum;
      o.glow2.material.opacity = (off ? 0.03 : 0.1 + fl * 0.16) * a.fade * lerp(1, 0.35, a.quiet) * lum;
      o.core.material.opacity = a.fade * (off ? 0.85 : 1) * flick * (0.2 + 0.8 * Math.sqrt(lum)) * surf;
      o.spike.visible = (alive || go) && !shed;
      o.spike.material.opacity = (0.4 + fl * 0.5) * a.fade * lerp(1, 0.5, a.quiet) * lum * surf;
      o.spike.material.rotation = (rm ? 0.2 : t * 0.02) + s.slot;
      o.spike.scale.setScalar(s.k * s.sr * 10 * qs * (1 + fl * 0.6) * Math.sqrt(swell));
      const fr = 1 - a.flare;
      o.flare.material.opacity = a.flare * 0.7 * a.fade;
      o.flare.scale.setScalar(s.k * s.sr * (3 + fr * 10));
      if (o.guard) { o.guard.material.opacity = 0.5 * a.fade; o.guard.material.rotation = t * 0.1; o.guard.scale.setScalar(s.k * s.sr * 7); }
      // planets: one lane each, golden-angle phases on one rigid rotation per system
      const show = a.detail > 0.02;
      o.pg.visible = show;
      const moving = !off && !bad;
      if (dt && moving && !rm) a.rot = (a.rot || 0) + s.w * dt;
      const kk = dt ? 1 - Math.exp(-dt * 2) : 1, starR = s.sr * 1.7 * 0.5 * lerp(1, 0.7, a.quiet) * swell;
      for (const q of [...o.pmap.values()]) {
        const p = q.p;
        const pl = q.life || (q.life = { decay: 0, fail: 0, last: p.phase, grow: up ? 0 : 1 });
        // a health check lands during a create: the protostar throws a knot up its jets
        if (up && p.phase === 3 && pl.last !== 3) this.knot(o);
        pl.last = p.phase;
        const goneP = q.leave || (!!mode && !up && (L.per[p.svc] === 0 || (removing ? p.phase === 0 : !p.running)));
        pl.decay = dt ? clamp(pl.decay + (goneP ? dt / 2.8 : -dt / 1.5), 0, 1) : goneP ? 1 : 0;
        pl.fail = dt ? lerp(pl.fail, p.phase === -1 ? 1 : 0, 1 - Math.exp(-dt * 3)) : p.phase === -1 ? 1 : 0;
        // accretion: a body condenses as its container is created, runs, then passes its check
        const growT = up ? (({ 0: 0, 1: 0.45, 2: 0.8, 3: 1 } as Record<number, number>)[p.phase] ?? 0.8) : 1;
        pl.grow = dt ? lerp(pl.grow, growT, 1 - Math.exp(-dt * 1.4)) : growT;
        const engulfing = removing || (q.leave && shed);
        // torn apart inner orbit first, spread over the time the job gives
        if (goneP && engulfing && !rm && pl.tearT == null) pl.tearT = nowS + 0.35 + 1.3 * clamp(q.orbitCur / Math.max(s.ext, 1), 0, 1);
        const heat = pl.tearT != null ? sstep(pl.tearT - 0.35, pl.tearT, nowS) : 0, torn = pl.tearT != null ? clamp((nowS - pl.tearT) / 0.45, 0, 1) : 0;
        if (pl.tearT != null && nowS >= pl.tearT && !q.stream) q.stream = this.tear(o, q);
        if (q.stream && !q.stream.done) this.drawTear(q, dt, starR);
        q.vis = dt ? clamp(q.vis + (q.leave && !engulfing ? -dt / 0.9 : dt / 0.9), 0, 1) : q.leave ? 0 : 1;
        if (q.leave && (engulfing ? (rm ? pl.decay >= 1 : !!(q.stream && q.stream.done)) : q.vis <= 0)) { this.dropPlanet(o, q); continue; }
        q.orbitCur = lerp(q.orbitCur, p.orbit, kk); q.sizeCur = lerp(q.sizeCur, p.size, kk);
        const ang = p.ph + (a.rot || 0);
        // destruction: dark first as the container stops, then the orbit decays into the swollen star
        const inward = engulfing && rm ? ease3(clamp((pl.decay - 0.3) / 0.7, 0, 1)) : 0;
        const orb = lerp(q.orbitCur, starR * 0.5, inward);
        const x = Math.cos(ang) * orb, z = Math.sin(ang) * orb, y = Math.sin(ang * 0.5 + p.ph) * q.orbitCur * 0.03 * (1 - inward);
        const size = q.sizeCur * (up ? lerp(0.3, 1, pl.grow) : 1);
        q.mesh.position.set(x, y, z); q.halo.position.set(x, y, z);
        q.mesh.scale.setScalar(size); q.halo.scale.setScalar(size * 5);
        q.line.scale.setScalar(q.orbitCur);
        const U = q.mesh.material.uniforms, lk2 = q.look;
        const spin = p.ph * 2 + (rm ? 0 : t * lk2.spin * (p.running ? 1 : 0.2));
        _eul.set(0, spin, lk2.tilt, "ZYX"); _m4.makeRotationFromEuler(_eul);
        U.uR.value.setFromMatrix4(_m4).transpose();
        const lodT = isF && ui().planet === p.svc ? 1 : 0;
        q.lod = dt ? lerp(q.lod, lodT, 1 - Math.exp(-dt * 5)) : lodT;
        U.uQ.value = q.lod; U.uT.value = t;
        U.uS.value.copy(wp);
        const phO = up ? clamp(pl.grow / 0.4, 0, 1) : 1, engulf = 1 - sstep(0.75, 1, inward);
        const O = a.detail * a.fade * phO * q.vis * engulf * (1 - torn);
        U.uO.value = O;
        const dim = up ? lerp(0.92, 0, clamp((pl.grow - 0.45) / 0.55, 0, 1)) : mode && !up ? Math.max(pl.decay, p.running ? 0 : 0.85) : p.running ? 0 : 0.85;
        U.uD.value = dim;
        U.uF.value = Math.max(pl.fail, heat);
        q.mesh.visible = O > 0.01;
        if (q.atmo) { const A = q.atmo.material.uniforms; A.uS.value.copy(wp); A.uO.value = O * (0.35 + 0.65 * q.lod) * (1 - dim * 0.7); }
        if (q.ring) {
          const RU = q.ring.material.uniforms;
          q.mesh.updateWorldMatrix(true, true);
          RU.uS.value.copy(wp); RU.uO.value = O; RU.uD.value = dim; RU.uQ.value = q.lod;
          q.mesh.getWorldPosition(RU.uPC.value);
          RU.uPR.value = q.mesh.getWorldScale(_v3).x;
          RU.uRN.value.set(0, 0, 1).applyQuaternion(q.ring.getWorldQuaternion(_q4));
        }
        q.halo.material.color.set(p.phase === -1 ? "#ff5b7a" : p.ok ? p.c : p.running ? "#ff9a6b" : "#555555");
        let ho = p.running ? (p.ok ? 0.42 : 0.26) : 0.08;
        if (p.phase === -1) ho = 0.4;
        ho *= (1 - dim * 0.85);
        if (isF && this.hlSvc === p.svc) ho = Math.max(ho, 0.9);
        q.halo.material.opacity = ho * O;
        q.line.material.opacity = (isF ? (ui().planet ? 0.05 : 0.09) : hov ? 0.06 : 0) * a.fade * q.vis * (1 - inward) * (up ? 0.4 + 0.6 * phO : 1);
        let satW: any = null;
        if (q.sat) {
          // tight orbit (planet radius is 1 here); the bus faces along its direction of travel
          const k = SAT_R / SAT_BUS / size, sr = (lk2.ring ? 2.5 : 1.2) + k * SAT_SPAN;
          const sang = p.ph * 6 + (moving && p.running ? t * 1.4 : 0);
          const lp = new THREE.Vector3(Math.cos(sang) * sr, Math.sin(sang * 0.6) * 0.18, Math.sin(sang) * sr);
          q.sat.g.scale.setScalar(k); q.sat.halo.scale.setScalar(SAT_R * 4 / size);
          q.sat.g.position.copy(lp); q.sat.halo.position.copy(lp);
          q.sat.g.rotation.set(0.18, -sang, 0);
          satW = q.sat.g.getWorldPosition(new THREE.Vector3());
          for (const m of q.sat.mats) {
            m.uniforms.uS.value.copy(wp);
            m.uniforms.uO.value = O;
            m.uniforms.uD.value = dim;
          }
          // slow blink: a short flash every ~2.6s, dim when the frontend is down
          const blink = p.running ? 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(t * 2.4 + p.ph)), 12) : 0.12;
          q.sat.beacon.material.opacity = blink * O;
          q.sat.halo.material.opacity = 0.15 * blink * O;
        }
        if (isF && show && !q.leave) {
          const sp = proj(q.mesh.getWorldPosition(new THREE.Vector3()));
          const pr = Math.max(4, pxPer(q.mesh.getWorldPosition(new THREE.Vector3()), size * ex));
          this.hits.push({ type: "planet", name, svc: p.svc, x: sp.x, y: sp.y, r: pr + 9 });
          // system level labels only the hovered or selected planet; planet level labels the focused one
          if (ui().planet ? ui().planet === p.svc : this.hlSvc === p.svc || ui().sel === p.svc) labels.push({ key: `p:${name}/${p.svc}`, x: sp.x, y: sp.y, r: pr * (q.ring ? 2.36 : 1) + 2, prio: p.kind === "fe" ? 3 : 4 + (1 - Math.min(1, (p.mem || 0) / 2000)), cls: `pl${ui().sel === p.svc || this.hlSvc === p.svc ? " sel" : ""}${p.running ? "" : " dim"}`, html: `<b>${esc(p.svc)}</b><span>${p.running ? mib(p.mem) : esc(p.status)}</span>`, pos: ["right", "left"], c: p.c });
          if (q.sat && satW) {
            const ssp = proj(satW), sid = `${name}/${p.svc}`;
            const spr = Math.max(5, pxPer(satW, (SAT_R * SAT_SPAN) / SAT_BUS));
            this.hits.push({ type: "sat", id: sid, backend: p.sat.name, edgePort: p.sat.edgePort, x: ssp.x, y: ssp.y, r: spr + 5 });
            if (this.hoverSat === sid) labels.push({ key: `sat:${sid}`, x: ssp.x, y: ssp.y, r: spr, prio: 0, hold: true, cls: "sat", html: `<b>${esc(p.sat.name)}${p.sat.edgePort ? ` · via edge :${p.sat.edgePort}` : ""}</b>`, pos: ["right", "left", "below", "above"], c: p.sat.col });
          }
        }
      }
      if (o.belt) {
        o.beltCur = lerp(o.beltCur, s.belt.r1, kk);
        o.belt.scale.setScalar(ex * o.beltCur);
        o.belt.visible = a.detail > 0.02 || isF;
        o.belt.material.uniforms.uO.value = (0.35 + 0.65 * a.detail) * a.fade * (removing ? 1 - lk : 1) * (up ? 0.3 + 0.7 * lk : 1);
        o.belt.rotation.y = moving ? -t * 0.03 : 0;
      }
      // screen + label
      const sp = proj(wp);
      if (sp.z > 1) continue;
      const ext = pxPer(wp, s.gext);
      this.hits.push({ type: "sys", name, x: sp.x, y: sp.y, r: Math.max(20, isF ? 0 : ext * 0.8) });
      if (isF) {
        if (s.belt) {
          const bp = proj(wp.clone().add(new THREE.Vector3(0, 0, 0)).add(new THREE.Vector3().subVectors(cam.position, wp).setY(0).normalize().multiplyScalar(s.belt.r1 * s.k)));
          labels.push({ key: `b:${name}`, x: bp.x, y: bp.y, r: 4, prio: 5, cls: "pl belt", html: `<b>Infra belt</b><span>${s.belt.up * s.belt.count | 0} of ${s.belt.count} up</span>`, pos: ["below", "right", "left"] });
        }
      } else if (L && !focus) {
        const ln = lifeLine(L)!;
        labels.push({ key: `s:${name}`, x: sp.x, y: sp.y, r: Math.max(8, ext) + 2, prio: 0, cls: `sys life ${ln.cls}`, html: `<b>${esc(s.label || s.name)}</b><span><i class="${ln.cls}"></i><em>${esc(ln.word)}</em> · ${esc(ln.detail)}</span>`, pos: ["right", "left", "below", "above"], c: s.col, focus: name });
      } else if (!focus && hov) {
        labels.push({ key: `s:${name}`, x: sp.x, y: sp.y, r: Math.max(8, ext) + 2, prio: 0, hold: true, cls: `sys ${s.st}`, html: sysLabel(s), pos: ["right", "left", "below", "above"], c: s.col, focus: name });
      } else if (!focus && s.shared) {
        // galaxy names systems only on hover; a shared one keeps a quiet mark
        labels.push({ key: `s:${name}`, x: sp.x, y: sp.y, r: Math.max(6, ext * 0.7), prio: 6, cls: "share", html: shareMark(s), pos: ["below", "right", "left", "above"] });
      }
    }
    // next free slot: a dormant wisp; once a create is accepted, a dark globule gathers at that seat
    const nx = m.next, pend = !!(m.pending && m.pending.length);
    this.newMark.visible = !!nx && (!focus || pend);
    if (nx) {
      const v = new THREE.Vector3(nx.pos.x, nx.pos.y, nx.pos.z);
      this.newMark.position.copy(v);
      this.wisp = dt ? lerp(this.wisp || 0, this.hoverFree ? 1 : 0, 1 - Math.exp(-dt * 5)) : this.hoverFree ? 1 : 0;
      this.pendK = dt ? lerp(this.pendK || 0, pend ? 1 : 0, 1 - Math.exp(-dt * 0.8)) : pend ? 1 : 0;
      this.newDot.material.opacity = (0.035 + 0.2 * this.wisp) * (1 - this.pendK);
      this.newDot.scale.setScalar(14 + 6 * this.wisp);
      this.newDark.material.opacity = 0.55 * this.pendK; this.newDark.scale.setScalar(96);
      this.newRim.material.opacity = 0.07 * this.pendK; this.newRim.scale.setScalar(80);
      const sp = proj(v);
      if (!focus && sp.z < 1) this.hits.push({ type: "free", x: sp.x, y: sp.y, r: Math.max(18, pxPer(v, 10)) });
      if (pend && nx.pending && !focus && sp.z < 1) labels.push({ key: "pend", x: sp.x, y: sp.y, r: Math.max(8, pxPer(v, 24)), prio: 0, cls: "sys life go", html: `<b>${esc(nx.pending)}</b><span><i class="go"></i><em>creating</em> · queued</span>`, pos: ["right", "left", "below", "above"], c: nx.col });
    }
    this.drawRemnants(nowS, dt, rm, labels, proj);
    for (const [n, o] of [...this.sys]) if (o.ghost && performance.now() / 1000 - o.ghost > 5.5) this.leave(o, n, null);
    this.drawBirths(nowS, dt, rm);
    this.drawFalls(dt, rm);
    const rd = this.renderer;
    rd.setRenderTarget(this.rt); rd.setClearColor(0x050507, 1); rd.clear();
    cam.layers.set(1); rd.render(this.scene, cam);
    rd.setRenderTarget(null); rd.clear();
    rd.render(this.postScene, this.postCam);
    rd.clearDepth();
    cam.layers.set(0); rd.render(this.scene, cam);
    this.place(labels);
  },
});
