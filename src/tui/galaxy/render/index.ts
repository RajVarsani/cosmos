import type { Frame, GalaxyBody } from "../types";
import { Canvas } from "../canvas";
import { S, planet } from "../palette";
import { drawStars } from "../starfield";
import { PLANET_R, STAR_R, place } from "../orbit";
import { disc, ellipse } from "./shapes";

export type GalaxyInput = { bodies: GalaxyBody[]; width: number; height: number; selectedId?: string; t: number; ascii: boolean; emptyText: string };

const P = { stars: 0, ringBack: 1, ring: 2, halo: 3, star: 4, select: 5, planet: 6, label: 7 };

export function renderGalaxy(i: GalaxyInput): Frame {
  const w = Math.max(1, i.width), h = Math.max(1, i.height);
  const cv = new Canvas(w, h, i.ascii);
  const cx = w / 2, cy = h; // units: the canvas is h*2 units tall
  drawStars(cv, i.t, P.stars);

  const placed = place(i.bodies, cx, cy, i.t);
  const gap = i.ascii ? 1 : 1.1;
  for (const p of placed) ellipse(cv, cx, cy, p.ring.rx, p.ring.ry, gap, p.body.id === i.selectedId ? P.ring : P.ringBack, S.ringFront, S.ringBack);

  if (i.ascii) {
    const row = Math.floor(cy / 2), col = Math.floor(cx) - 1;
    cv.text(col, row - 1, "...", P.halo, S.halo);
    cv.text(col - 1, row, "(", P.star, S.corona); cv.text(col, row, "*@*", P.star, S.core); cv.text(col + 3, row, ")", P.star, S.corona);
    cv.text(col, row + 1, "'''", P.halo, S.halo);
  } else {
    ellipse(cv, cx, cy, STAR_R + 1.5, STAR_R + 1.5, 0.9, P.halo, S.halo, S.halo);
    disc(cv, cx, cy, STAR_R, P.star, S.corona, "*");
    disc(cv, cx, cy, STAR_R - 0.9, P.star + 1, S.core, "@", true);
  }

  for (const p of placed) {
    // behind the star: hidden while it crosses the disc
    if (p.behind && Math.abs(p.x - cx) < STAR_R + 0.6 && Math.abs(p.y - cy) < STAR_R) continue;
    const beat = p.body.busy && Math.floor(i.t) % 2 === 0 ? 1 : 0; // two-state pulse, 1 s each
    const r = PLANET_R[p.size] + beat * 0.45;
    const sel = p.body.id === i.selectedId;
    const st = planet(p.body.health, sel || beat > 0.5);
    if (i.ascii) {
      const col = Math.floor(p.x), row = Math.floor(p.y / 2);
      if (sel) { cv.text(col - 1, row, "[", P.select, S.select); cv.text(col + 1, row, "]", P.select, S.select); }
      cv.text(col, row, "oO0@"[Math.min(3, p.size + (beat > 0.5 ? 1 : 0))], P.planet, st);
    } else {
      if (sel) ellipse(cv, p.x, p.y, r + 1.6, r + 1.6, 0.7, P.select, S.select, S.select);
      disc(cv, p.x, p.y, r, P.planet, st, "o");
    }
    if (sel) label(cv, p.x, p.y, i.ascii ? 2 : r + 2, p.body.name);
  }

  if (!i.bodies.length) {
    const row = Math.min(h - 1, Math.floor(cy / 2) + 4);
    cv.text(Math.floor((w - i.emptyText.length) / 2), row, i.emptyText, P.label, S.empty);
  }
  return cv.frame();
}

function label(cv: Canvas, x: number, y: number, pad: number, name: string) {
  const row = Math.floor(y / 2);
  const right = Math.ceil(x + pad);
  const col = right + name.length + 1 < cv.w ? right : Math.floor(x - pad) - name.length;
  cv.text(Math.max(0, col), row, name, P.label, S.select);
}
