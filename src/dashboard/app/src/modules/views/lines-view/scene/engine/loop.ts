import { RM } from "@/lib/motion/reduced";
import { clamp } from "@/modules/scene/math";
import { methods } from "@/modules/scene/types";

// on demand: every frame while something moves, 20 fps while orbits only turn, nothing at rest
const TICK_MS = 50;

export const loop = methods({
  active() { return this.ok && !document.hidden && this.vis; },
  ticks() { return this.active() && !RM.matches && document.hasFocus(); },
  busy() {
    const c = this.ctl;
    return !!(this.flight || this.easeHome || (this.down && this.down.moved) || Math.abs(c.vt) > 0.02 || Math.abs(c.vp) > 0.02 || this.births.length || this.fx);
  },
  wake() { if (this.ok && !this.raf && !this.tmr) this.next(); },
  still() {
    if (!this.ok || this.raf) return;
    clearTimeout(this.tmr); this.tmr = 0;
    this.raf = requestAnimationFrame((t) => this.tick(t));
  },
  next() {
    if (!this.active()) return;
    if (this.busy()) { this.raf = requestAnimationFrame((t) => this.tick(t)); return; }
    if (!this.ticks() || !this.moving) return;
    this.tmr = setTimeout(() => { this.tmr = 0; this.raf = requestAnimationFrame((t) => this.tick(t)); }, Math.max(0, TICK_MS - (performance.now() - this.lastDraw)));
  },
  tick(ts: number) {
    this.raf = 0;
    const live = this.active() && (this.busy() || this.ticks());
    const dt = live ? clamp((ts - this.last) / 1000, 0, 0.1) : 0;
    this.last = ts;
    this.draw(ts, dt);
    this.next();
  },
});
