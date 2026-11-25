import { methods } from "@/modules/scene/types";
import { GX } from "@/modules/scene/model/layout";
import { ink } from "../ink";
import { bucket, type Frame } from "../frame";

// the console: a scribbled horizon over a hatched disk, cross-hatched toward the centre, inside two loose disk rings; all of it lies in the disk plane
export const hole = methods({
  drawHole(F: Frame) {
    const P = this.pal, [X, Y, w] = this.pj(0, 0, 0);
    if (w <= 1) return;
    const ppu = this.ppu(w), g = bucket(ppu), hov = this.hoverCore, k = F.focus ? 0.5 : 1;
    const disk = ink(`bd:${g}`, (G) => [
      G.circle(0, 0, GX.DISK_IN * 2 * g, { roughness: 1.3, bowing: 2, seed: 13 }),
      G.circle(0, 0, GX.DISK_OUT * 2 * g, { roughness: 1.7, bowing: 4, seed: 14 }),
    ]);
    const m = this.flatM(0, 0, 0, GX.DISK_OUT, g);
    this.paint(disk, m, P.lead, (hov ? 0.75 : 0.45) * k, 0.9);
    const rs = GX.RS * g;
    const body = ink(`bh:${g}`, (G) => [
      G.circle(0, 0, rs * 2.2, { roughness: 1.1, bowing: 1.5, seed: 11, fill: "x", fillStyle: "hachure", hachureGap: 4, hachureAngle: -38, fillWeight: 1 }),
      G.circle(0, 0, rs * 1.25, { roughness: 1, seed: 12, fill: "x", fillStyle: "cross-hatch", hachureGap: 3.2, hachureAngle: 52, fillWeight: 1 }),
    ]);
    this.paint(body, m, P.chalk, (hov ? 1 : 0.8) * k, 1.1, P.pencil, (hov ? 0.8 : 0.55) * k);
    this.hits.push({ type: "core", x: X, y: Y, r: Math.max(18, GX.RS * 1.1 * ppu) });
  },
});
