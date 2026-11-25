import { esc } from "@/lib/format";
import { hash } from "@/lib/hash";
import { lifeLine } from "@/domain/life";
import { RM } from "@/lib/motion/reduced";
import { TAU, clamp, ease3, lerp, sstep } from "@/modules/scene/math";
import { shareMark, sysLabel } from "@/modules/scene/labels";
import { methods } from "@/modules/scene/types";
import { GHOST_MS } from "../model";
import { ink } from "../ink";
import { beltTicks } from "../ink/hand";
import { bucket, type Frame } from "../frame";

const toward = (v: number, to: number, step: number) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));

// a star system: hand-drawn orbits and a dotted infra belt in its plane, then the star and its bodies far to near
export const system = methods({
  drawSystem(name: string, o: any, F: Frame) {
    const s = o.s, P = this.pal, c = this.ctx, rm = RM.matches, now = F.now;
    const el = clamp((now - (o.lt ?? now)) / 1000, 0, 2);
    o.lt = now;
    const L = s.life, failed = !!(L && L.failed), mode = L && !failed ? L.kind : null;
    const creating = mode === "create", removing = mode === "remove";
    const kf = L ? L.frac : 1;
    if (o.mode !== mode) { o.mode = mode; o.lk = removing ? 0 : kf; }
    o.lk = rm ? kf : lerp(o.lk, kf, 1 - Math.exp(-el * 1.2));
    const lk = o.lk;
    // destroy: crossed out while the job runs, then erased into the hole once the instance is gone
    let scrib = removing ? sstep(0.05, 0.85, lk) : 0, erase = 0;
    if (o.ghost) {
      const gk = (now - o.ghost) / GHOST_MS;
      if (gk >= 1) return this.dropSys(name);
      scrib = Math.max(o.scrib || 0, sstep(0, 0.4, gk)); erase = sstep(0.35, 1, gk); this.fx = true;
    }
    o.scrib = scrib;
    const moving = s.st !== "off" && s.st !== "bad";
    if (moving && s.planets.length) o.rot += s.w * F.dt;
    const boil = !rm && (creating || removing || !!o.ghost);
    const vr = boil ? F.boil : 0, e = ease3(erase), seed = hash(name);
    const cx = s.pos.x * (1 - e), cy = s.pos.y * (1 - e), cz = s.pos.z * (1 - e), [X, Y, w] = this.pj(cx, cy, cz);
    const ppu = this.ppu(w), g = bucket(ppu), u = s.k * g, extPx = s.gext * ppu, pad = extPx * 1.6 + 80;
    const onScreen = w > 1 && X > -pad && Y > -pad && X < this.W + pad && Y < this.H + pad;
    const isF = F.focus === name, other = !!F.focus && !isF, hov = this.hover === name && !F.focus;
    const A = (other ? 0.28 : 1) * (s.st === "off" ? 0.62 : 1) * (mode === "stop" ? 1 - 0.4 * lk : 1) * (1 - 0.95 * e);
    const fm = onScreen ? this.flatM(cx, cy, cz, s.gext, g) : null;
    const bodies: { q: any; X: number; Y: number; w: number }[] = [];
    c.save();
    if (erase > 0 && onScreen) this.wedge(X, Y, extPx * 1.7 + 24, -Math.PI / 2, 1 - erase);
    // a create draws its star first, then each orbit once its container exists, then the body once it runs
    for (const q of [...o.pmap.values()]) {
      const p = q.p, made = p.phase >= 1 || p.phase === -1, runs = p.phase >= 2 || p.phase === -1;
      const rT = creating && !made ? 0 : 1, bT = creating && !runs ? 0 : 1;
      q.rev = rm ? rT : toward(q.rev, rT, el / 1.1); q.pv = rm ? bT : toward(q.pv, bT, el / 0.6);
      q.vis = rm ? (q.leave ? 0 : 1) : toward(q.vis, q.leave ? 0 : 1, el / 0.9);
      if (q.leave && q.vis <= 0) { o.pmap.delete(p.svc); continue; }
      if ((q.rev > 0 && q.rev < 1) || (q.pv > 0 && q.pv < 1) || (q.vis > 0 && q.vis < 1)) this.fx = true;
      const kk = 1 - Math.exp(-el * 2);
      q.orbitCur = lerp(q.orbitCur, p.orbit, kk); q.sizeCur = lerp(q.sizeCur, p.size, kk);
      if (!onScreen) continue;
      const ang = p.ph + o.rot, orb = q.orbitCur * s.k * (1 - e);
      const pp = this.pj(cx + Math.cos(ang) * orb, cy + Math.sin(ang * 0.5 + p.ph) * q.orbitCur * 0.03 * s.k * (1 - e), cz + Math.sin(ang) * orb);
      bodies.push({ q, X: pp[0], Y: pp[1], w: pp[2] });
      if (q.rev <= 0.001) continue;
      const R = q.orbitCur * u;
      const ok = ink(`o:${name}/${p.svc}:${Math.round(R * 2)}:${vr}`, (G) => G.circle(0, 0, R * 2, { roughness: 0.7 + Math.min(1.4, R / 260), bowing: 0.8 + Math.min(3, R / 200), maxRandomnessOffset: 2 + Math.min(4, R / 220), seed: hash(`${name}/${p.svc}`) + vr * 7919 }));
      c.save();
      if (q.rev < 1) this.wedge(X, Y, q.orbitCur * s.k * ppu * 1.3 + 12, Math.atan2(pp[1] - Y, pp[0] - X), q.rev);
      this.paint(ok, fm!, isF ? P.chalk : P.pencil, A * q.vis * (isF ? (this.hlSvc === p.svc ? 0.8 : 0.5) : hov ? 0.42 : 0.22) * (1 - scrib * 0.5), 1);
      c.restore();
    }
    if (onScreen && s.belt) {
      const bt = beltTicks(name, s.belt.r0, s.belt.r1, s.belt.count, s.belt.up), bA = A * (creating ? 0.3 + 0.7 * lk : removing ? 1 - lk * 0.6 : 1);
      const bm = this.flatM(cx, cy, cz, s.gext, 1 / s.k);
      this.scrawl(bt.on, P.infra, bA * (isF ? 0.85 : 0.55), 1.1, bm);
      this.scrawl(bt.off, P.lead, bA * 0.5, 1, bm);
    }
    if (onScreen) {
      // bodies behind the star first, then the star, then the ones in front
      bodies.sort((a, b) => b.w - a.w);
      let starDone = false;
      const star = () => {
        starDone = true;
        const rs = Math.max(3.4, s.sr * 0.55 * u), rays = s.st === "off" ? 0 : 5;
        const sk = ink(`s:${name}:${Math.round(rs * 2)}:${rays}:${vr}`, (G) => {
          const out = [G.circle(0, 0, rs * 2, { roughness: Math.min(1.2, 0.5 + rs / 14), bowing: 1, seed: seed + vr * 31 })];
          for (let k = 0; k < rays; k++) {
            const a = (k / rays) * TAU + (seed % 100) / 60 + ((seed >> (k + 3)) % 7) * 0.05, r0 = rs * 1.45, r1 = rs * (2.1 + ((seed >> k) % 5) * 0.12);
            out.push(G.line(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1, { roughness: 0.6, bowing: 0.5, seed: seed + k + vr * 17 }));
          }
          return out;
        });
        const born = creating ? clamp((now - o.born) / 900, 0, 1) : 1, r = ppu / g;
        c.save();
        if (born < 1) { this.wedge(X, Y, rs * r * 2.8 + 6, -Math.PI / 2, born); this.fx = true; }
        const sc = s.st === "bad" || failed ? P.red : L && L.stalled ? P.amb : P.chalk;
        this.paint(sk, this.upM(X, Y, r), sc, A * (isF || hov ? 1 : 0.82), 1.1);
        c.restore();
        // the focused system carries its backend colour as one flat dot
        if (isF) this.dot(X, Y, Math.min(4.5, Math.max(2, rs * r * 0.38)), s.col, A, P.chalk);
      };
      for (const b of bodies) {
        if (!starDone && b.w < w) star();
        this.drawBody(name, o, b.q, F, { X: b.X, Y: b.Y, w: b.w, A, isF, vr, moving });
      }
      if (!starDone) star();
    }
    if (onScreen && scrib > 0.001) {
      const xr = s.gext * g * 1.05;
      const xk = ink(`x:${name}:${Math.round(xr)}:${vr}`, (G) => G.circle(0, 0, xr * 2, { fill: "x", fillStyle: "zigzag", hachureGap: Math.max(5, xr / 7), hachureAngle: -28, roughness: 1.8, fillWeight: 1, seed: seed + 5 + vr }));
      c.save();
      this.wedge(X, Y, extPx * 1.3 + 12, -Math.PI * 0.75, scrib);
      if (xk.hatch) this.scrawl(xk.hatch, P.chalk, A * 0.7, 1.2, this.upM(X, Y, ppu / g));
      c.restore();
    }
    c.restore();
    if (o.ghost || !onScreen) return;
    this.hits.push({ type: "sys", name, x: X, y: Y, r: Math.max(20, isF ? 0 : extPx * 0.8) });
    if (isF) {
      if (s.belt) {
        const cp = this.cam.position, hx = cp.x - cx, hz = cp.z - cz, hl = Math.hypot(hx, hz) || 1, br = s.belt.r1 * s.k;
        const [bx, by] = this.pj(cx + (hx / hl) * br, cy, cz + (hz / hl) * br);
        F.labels.push({ key: `b:${name}`, x: bx, y: by, r: 4, prio: 5, cls: "pl belt", html: `<b>Infra belt</b><span>${(s.belt.up * s.belt.count) | 0} of ${s.belt.count} up</span>`, pos: ["below", "right", "left"] });
      }
    } else if (L && !F.focus) {
      const ln = lifeLine(L)!;
      F.labels.push({ key: `s:${name}`, x: X, y: Y, r: Math.max(8, extPx) + 2, prio: 0, cls: `sys life ${ln.cls}`, html: `<b>${esc(s.label || s.name)}</b><span><i class="${ln.cls}"></i><em>${esc(ln.word)}</em> · ${esc(ln.detail)}</span>`, pos: ["right", "left", "below", "above"], c: s.col, focus: name });
    } else if (!F.focus && hov) {
      F.labels.push({ key: `s:${name}`, x: X, y: Y, r: Math.max(8, extPx) + 2, prio: 0, hold: true, cls: `sys ${s.st}`, html: sysLabel(s), pos: ["right", "left", "below", "above"], c: s.col, focus: name });
    } else if (!F.focus) {
      // a map wants its names written on it; the quiet tag gives way to any other label
      F.labels.push({ key: `s:${name}`, x: X, y: Y, r: Math.max(6, extPx * 0.7), prio: 6, cls: `sys tag ${s.st}`, html: `<b>${esc(s.label || s.name)}${shareMark(s)}</b>`, pos: ["below", "right", "left", "above"] });
    }
  },
});
