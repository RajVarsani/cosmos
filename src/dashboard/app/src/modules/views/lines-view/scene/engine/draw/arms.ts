import { methods } from "@/modules/scene/types";
import { GX } from "@/modules/scene/model/layout";
import { armStrokes } from "../ink/hand";
import type { Frame } from "../frame";

const TONE = [0.55, 0.4, 0.26];

export const arms = methods({
  drawArms(F: Frame) {
    const st = armStrokes(Math.max(GX.ARM0 * 3, this.m.bound.R * 0.92)), k = F.focus ? 0.35 : 1, paths = [new Path2D(), new Path2D(), new Path2D()];
    for (let i = 0; i < st.length; i += 7) {
      const a = this.pj(st[i], 0, st[i + 1]), b = this.pj(st[i + 2], 0, st[i + 3]), e = this.pj(st[i + 4], 0, st[i + 5]);
      if (a[2] <= 1 || b[2] <= 1 || e[2] <= 1) continue;
      const p = paths[st[i + 6]];
      p.moveTo(a[0], a[1]); p.quadraticCurveTo(b[0], b[1], e[0], e[1]);
    }
    paths.forEach((p, i) => this.scrawl(p, this.pal.pencil, TONE[i] * k, 0.9));
  },
});
