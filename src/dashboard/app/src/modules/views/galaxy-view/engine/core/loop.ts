import { RM } from "@/lib/motion/reduced";
import { clamp } from "../util";
import { methods } from "@/modules/scene/types";

export const loop = methods({
  // ---------- loop ----------
  active() { return this.ok && !document.hidden && this.vis; },
  busyFx() { return this.births.length || this.remnants.length; },
  wake() {
    if (!this.ok) return;
    if (RM.matches && !this.falls?.length) return this.still();
    if (this.active() && !this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.loop(t)); }
  },
  still() {
    if (!this.ok) return;
    if (RM.matches || !this.raf) { cancelAnimationFrame(this.stillRaf); this.stillRaf = requestAnimationFrame(() => this.frame(performance.now(), 0)); }
  },
  loop(ts: number) {
    this.raf = 0;
    if (!this.active() || (RM.matches && !this.falls?.length)) return;
    const dt = clamp((ts - this.last) / 1000, 0, 0.1);
    this.last = ts;
    this.frame(ts, dt);
    // quality governor: step pixel ratio down when frames run long
    this.frames++;
    this.slowAcc = (this.slowAcc || 0) * 0.95 + (dt > 0.024 ? 1 : 0) * 0.05;
    if (this.frames > 120 && this.slowAcc > 0.6 && this.slow < 2) { this.slow++; this.frames = 0; this.resize(); }
    this.raf = requestAnimationFrame((t) => this.loop(t));
  },
});
