import { esc } from "@/lib/format";
import { clamp, sstep } from "@/modules/scene/math";
import { methods } from "@/modules/scene/types";
import { GX } from "@/modules/scene/model/layout";
import { ink } from "../ink";
import { sketchLine } from "../ink/hand";
import { bucket, type Frame } from "../frame";

// the next free seat: an open pencil loop in the disk plane that wakes on hover; once a create is queued it is hatched in
export const next = methods({
  drawNext(F: Frame) {
    const nx = this.m.next, pend = !!(this.m.pending && this.m.pending.length);
    if (!nx || (F.focus && !pend)) return;
    const P = this.pal, [X, Y, w] = this.pj(nx.pos.x, nx.pos.y, nx.pos.z);
    if (w <= 1) return;
    const ppu = this.ppu(w), g = bucket(ppu), r = Math.max(7, 10 * ppu), rg = 10 * g, vr = pend ? F.boil : 0;
    const nk = ink(`n:${g}:${pend ? 1 : 0}:${vr}`, (G) => (pend ? G.circle(0, 0, rg * 2, { roughness: 1.2, bowing: 1, seed: 77 + vr, fill: "x", fillStyle: "hachure", hachureGap: Math.max(3, rg / 4), hachureAngle: 30, fillWeight: 1 }) : G.arc(0, 0, rg * 2, rg * 2, -2.6, 2.9, false, { roughness: 1.6, bowing: 2, seed: 77 })));
    if (pend) this.moving = true;
    this.paint(nk, this.flatM(nx.pos.x, nx.pos.y, nx.pos.z, 10, g), this.hoverFree || pend ? P.chalk : P.lead, this.hoverFree ? 0.9 : pend ? 0.7 : 0.45, 1, P.pencil, 0.55);
    if (!F.focus) this.hits.push({ type: "free", x: X, y: Y, r: Math.max(18, r) });
    if (pend && nx.pending && !F.focus) F.labels.push({ key: "pend", x: X, y: Y, r: r + 4, prio: 0, cls: "sys life go", html: `<b>${esc(nx.pending)}</b><span><i class="go"></i><em>creating</em> · queued</span>`, pos: ["right", "left", "below", "above"], c: nx.col });
  },
  // an accepted create: one stroke drawn out of the hole to the seat the server will use
  drawBirths(F: Frame) {
    this.births = this.births.filter((b: any) => F.now - b.t0 < 2200);
    const nx = this.m.next;
    if (!this.births.length || !nx) return;
    const [x0, y0, w0] = this.pj(0, 0, 0), [x1, y1] = this.pj(nx.pos.x, nx.pos.y, nx.pos.z), dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, rim = GX.RS * 1.2 * this.ppu(w0);
    const c = this.ctx;
    for (const b of this.births) {
      const age = F.now - b.t0, k = clamp(age / 900, 0, 1), fade = 1 - sstep(1300, 2200, age);
      const { p, L } = sketchLine(b.t0 | 0, x0 + (dx / d) * rim, y0 + (dy / d) * rim, x1, y1);
      c.save(); c.setLineDash([L * k, L * 2]);
      this.scrawl(p, this.pal.chalk, 0.8 * fade, 1.1);
      c.restore();
    }
  },
});
