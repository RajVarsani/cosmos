import type { Canvas } from "../canvas";
import { S } from "../palette";
import { hash, rng } from "../hash";

// fixed per terminal size; a few stars swap brightness every 2 s
export function drawStars(cv: Canvas, t: number, pri: number) {
  const r = rng(cv.w * 1000 + cv.h);
  const n = Math.floor(cv.w * cv.h * 0.03);
  const epoch = Math.floor(t / 2);
  for (let i = 0; i < n; i++) {
    const x = r() * cv.w, y = r() * cv.h * 2;
    let b = r() < 0.12 ? 2 : r() < 0.4 ? 1 : 0;
    if (hash(`${i}:${epoch}`) % 23 === 0) b = Math.min(2, b + 1);
    cv.dot(x, y, pri, S.stars[b], b === 2 ? "+" : ".");
  }
}
