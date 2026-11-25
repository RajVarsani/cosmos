import { ui } from "@/state/ui-store";
import { RM } from "@/lib/motion/reduced";
import { methods } from "@/modules/scene/types";

// what one frame's drawers share: focus, step, clock, the boil frame and the label list it builds
export type Frame = { focus: string | null; dt: number; t: number; now: number; boil: number; labels: any[] };
// ink is cut at half-octave steps of on-screen scale, so a stroke's wobble stays about the same in px
export const bucket = (ppu: number) => 2 ** (Math.round(Math.log2(Math.max(ppu, 1e-3)) * 2) / 2);

export const frame = methods({
  draw(ts: number, dt: number) {
    if (!this.m || !this.W) return;
    this.lastDraw = performance.now();
    this.updateCam(dt, ts);
    const k = this.ctl, dragging = !!(this.down && this.down.moved), coasting = !dragging && !this.down && (Math.abs(k.vt) > 0.02 || Math.abs(k.vp) > 0.02);
    if (dragging || coasting) this.markBusy();
    else if (this.flight) this.markBusy(false);
    else if (this.camBusy && !this.settleTimer) this.scheduleSettle();
    this.syncProj();
    const c = this.ctx, rm = RM.matches, now = performance.now();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    c.lineCap = "round"; c.lineJoin = "round";
    // the shared camera drifts on its own when idle, so the view keeps ticking unless motion is reduced
    this.fx = false; this.moving = !rm; this.hits = [];
    const F: Frame = { focus: ui().focus, dt, t: rm ? 38 : ts / 1000, now, boil: Math.floor(now / 140) % 3, labels: [] };
    this.drawArms(F);
    // far to near, the hole among the systems
    const items: { w: number; name?: string; o?: any }[] = [{ w: this.pj(0, 0, 0)[2] }];
    for (const [name, o] of this.sys) items.push({ w: this.pj(o.s.pos.x, o.s.pos.y, o.s.pos.z)[2], name, o });
    items.sort((a, b) => b.w - a.w);
    for (const it of items) { if (it.o) this.drawSystem(it.name, it.o, F); else this.drawHole(F); }
    this.drawNext(F);
    this.drawBirths(F);
    c.globalAlpha = 1;
    this.place(F.labels);
  },
});
