import type { Ink } from "./ink";
import { TAU } from "@/modules/scene/math";
import { methods } from "@/modules/scene/types";

export type Pt = [number, number, number];

// real 3D points through the shared camera to css px; the third value is view depth (<= 0 is behind the eye)
export const pen = methods({
  syncProj() {
    const cam = this.cam;
    this.vpm.set(cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse).elements);
    this.tanH = Math.tan((cam.fov * Math.PI) / 360);
  },
  pj(x: number, y: number, z: number): Pt {
    const e = this.vpm, w = e[3] * x + e[7] * y + e[11] * z + e[15];
    const iw = 1 / (Math.abs(w) < 1e-6 ? 1e-6 : w);
    return [((e[0] * x + e[4] * y + e[8] * z + e[12]) * iw * 0.5 + 0.5) * this.W, (-(e[1] * x + e[5] * y + e[9] * z + e[13]) * iw * 0.5 + 0.5) * this.H, w];
  },
  // css px per world unit at a view depth
  ppu(w: number) { return this.H / 2 / (Math.max(w, 0.01) * this.tanH); },
  // ink cut at scale g lies in the disk plane at C: the projection's local linear map, so edge-on and from below just work
  flatM(cx: number, cy: number, cz: number, d: number, g: number) {
    const p0 = this.pj(cx, cy, cz), px = this.pj(cx + d, cy, cz), pz = this.pj(cx, cy, cz + d), k = d * g;
    return new DOMMatrix([(px[0] - p0[0]) / k, (px[1] - p0[1]) / k, (pz[0] - p0[0]) / k, (pz[1] - p0[1]) / k, p0[0], p0[1]]);
  },
  // bodies face the viewer
  upM(X: number, Y: number, r: number) { return new DOMMatrix([r, 0, 0, r, X, Y]); },
  px() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); },
  // the path is mapped, then stroked in px, so a stroke keeps its weight however hard the shape is foreshortened
  paint(k: Ink, m: DOMMatrix, col: string, a: number, w: number, hatchCol?: string, hatchA?: number) {
    const c = this.ctx;
    this.px();
    if (a > 0.003) { const p = new Path2D(); p.addPath(k.line, m); c.globalAlpha = Math.min(1, a); c.strokeStyle = col; c.lineWidth = w; c.stroke(p); }
    if (k.hatch && hatchCol && (hatchA ?? 0) > 0.003) { const p = new Path2D(); p.addPath(k.hatch, m); c.globalAlpha = Math.min(1, hatchA!); c.strokeStyle = hatchCol; c.lineWidth = w * 0.6; c.stroke(p); }
  },
  scrawl(p: Path2D, col: string, a: number, w: number, m?: DOMMatrix) {
    const c = this.ctx;
    this.px();
    let q = p;
    if (m) { q = new Path2D(); q.addPath(p, m); }
    c.globalAlpha = Math.min(1, a); c.strokeStyle = col; c.lineWidth = w; c.stroke(q);
  },
  dot(X: number, Y: number, r: number, col: string, a: number, ring?: string) {
    const c = this.ctx;
    this.px(); c.globalAlpha = Math.min(1, a); c.fillStyle = col;
    c.beginPath(); c.arc(X, Y, r, 0, TAU); c.fill();
    if (ring) { c.strokeStyle = ring; c.lineWidth = 0.9; c.stroke(); }
  },
  // reveal (or erase) a share k of a turn around X,Y; stays until the caller restores
  wedge(X: number, Y: number, R: number, a0: number, k: number) {
    const c = this.ctx;
    this.px(); c.beginPath(); c.moveTo(X, Y); c.arc(X, Y, R, a0, a0 + Math.max(0.0001, k) * TAU); c.closePath(); c.clip();
  },
});
