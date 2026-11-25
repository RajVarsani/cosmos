import { esc, mib } from "@/lib/format";
import { hash } from "@/lib/hash";
import { lookOf } from "@/domain/palette";
import { ui } from "@/state/ui-store";
import { clamp } from "@/modules/scene/math";
import { methods } from "@/modules/scene/types";
import { ink } from "../ink";
import { bucket, type Frame } from "../frame";

type At = { X: number; Y: number; w: number; A: number; isF: boolean; vr: number; moving: boolean };

// a planet: a scribbled circle, hatched once it is big enough, ringed if its look has rings, and its service-kind dot
export const body = methods({
  drawBody(name: string, o: any, q: any, F: Frame, x: At) {
    if (x.w <= 1) return;
    const p = q.p, s = o.s, P = this.pal, look = lookOf(p.svc), { X, Y } = x;
    const ppu = this.ppu(x.w), g = bucket(ppu), rpx = q.sizeCur * s.k * ppu, a = x.A * q.vis * q.pv;
    if (a > 0.01) {
      const dead = !p.running, fail = p.phase === -1, hl = x.isF && (this.hlSvc === p.svc || ui().sel === p.svc);
      if (rpx >= 3.2) {
        const rg = (rpx * g) / ppu, sd = hash(`${name}/${p.svc}:b`) + x.vr * 13, hatch = rpx > 9, m = this.upM(X, Y, ppu / g);
        const bk = ink(`p:${name}/${p.svc}:${Math.round(rg * 2)}:${x.vr}`, (G) => {
          const out = [G.circle(0, 0, rg * 2, { roughness: clamp(rg / 12, 0.35, 1.1), bowing: 0.6, seed: sd, ...(hatch ? { fill: "x", fillStyle: "hachure", hachureGap: Math.max(2.6, rg / 4.5), hachureAngle: -55 + (sd % 40), fillWeight: 1 } : {}) })];
          if (look.ring) out.push(G.ellipse(0, 0, rg * 4.6, rg * 1.25, { roughness: 0.7, bowing: 0.5, seed: sd + 3 }));
          return out;
        });
        this.paint(bk, m, dead ? P.lead : P.chalk, a * (x.isF ? 0.95 : 0.72), 1, P.pencil, a * 0.45);
        if (hl) {
          const hk = ink(`h:${Math.round(rg)}:${x.vr}`, (G) => G.circle(0, 0, rg * 2 + 14 * (g / ppu), { roughness: 1.2, bowing: 2, seed: 99 + x.vr }));
          this.paint(hk, m, P.chalk, a * 0.75, 1);
        }
      }
      this.dot(X, Y, Math.min(3.8, Math.max(1.6, rpx * 0.3)), fail ? P.red : dead ? P.lead : p.kind === "fe" ? P.fe : P.be, a);
      if (x.isF && p.sat) {
        // a remote frontend's satellite: a tiny cross on a tight orbit, with the backend's colour as its beacon
        const sa = p.ph * 6 + (x.moving && p.running ? F.t * 1.4 : 0), sr = rpx * (look.ring ? 2.5 : 1.35) + 7;
        const sx = X + Math.cos(sa) * sr, sy = Y + Math.sin(sa) * sr * 0.45, c = this.ctx;
        this.px(); c.globalAlpha = a; c.strokeStyle = P.chalk; c.lineWidth = 1;
        c.beginPath(); c.moveTo(sx - 3, sy); c.lineTo(sx + 3.4, sy + 0.4); c.moveTo(sx + 0.2, sy - 3); c.lineTo(sx - 0.2, sy + 3.2); c.stroke();
        this.dot(sx, sy, 1.7, p.sat.col, a, P.chalk);
        const sid = `${name}/${p.svc}`;
        this.hits.push({ type: "sat", id: sid, backend: p.sat.name, edgePort: p.sat.edgePort, x: sx, y: sy, r: 10 });
        if (this.hoverSat === sid) F.labels.push({ key: `sat:${sid}`, x: sx, y: sy, r: 4, prio: 0, hold: true, cls: "sat", html: `<b>${esc(p.sat.name)}${p.sat.edgePort ? ` · via edge :${p.sat.edgePort}` : ""}</b>`, pos: ["right", "left", "below", "above"], c: p.sat.col });
      }
    }
    if (!x.isF || q.leave || q.pv < 0.5 || o.ghost) return;
    this.hits.push({ type: "planet", name, svc: p.svc, x: X, y: Y, r: Math.max(4, rpx) + 9 });
    if (ui().planet ? ui().planet === p.svc : this.hlSvc === p.svc || ui().sel === p.svc) {
      F.labels.push({ key: `p:${name}/${p.svc}`, x: X, y: Y, r: rpx * (look.ring ? 2.36 : 1) + 2, prio: p.kind === "fe" ? 3 : 4 + (1 - Math.min(1, (p.mem || 0) / 2000)), cls: `pl${ui().sel === p.svc || this.hlSvc === p.svc ? " sel" : ""}${p.running ? "" : " dim"}`, html: `<b>${esc(p.svc)}</b><span>${p.running ? mib(p.mem) : esc(p.status)}</span>`, pos: ["right", "left"], c: p.c });
    }
  },
});
