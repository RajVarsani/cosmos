import type { Canvas } from "../canvas";
import type { Style } from "../types";

// sample dots on a filled disc at the canvas' dot pitch
export function disc(cv: Canvas, cx: number, cy: number, r: number, pri: number, s: Style, ch: string, keep = false) {
  const sx = 1 / cv.subX, sy = 2 / cv.subY;
  for (let y = cy - r; y <= cy + r + 1e-6; y += sy)
    for (let x = cx - r; x <= cx + r + 1e-6; x += sx)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) cv.dot(x, y, pri, s, ch, keep);
}

// dotted ellipse; front (lower) half and back half styled apart for depth
export function ellipse(cv: Canvas, cx: number, cy: number, rx: number, ry: number, gap: number, pri: number, front: Style, back: Style) {
  const n = Math.max(12, Math.round((2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2)) / gap));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI, sin = Math.sin(a);
    cv.dot(cx + Math.cos(a) * rx, cy + sin * ry, pri, sin >= 0 ? front : back, ".");
  }
}
