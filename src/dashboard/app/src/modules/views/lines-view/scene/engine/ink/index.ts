import rough from "roughjs";
import type { Drawable, OpSet } from "roughjs/bin/core";

export type Gen = ReturnType<typeof rough.generator>;
// outline strokes and hatching, kept apart so each takes its own weight and tone
export type Ink = { line: Path2D; hatch: Path2D | null };

const gen = rough.generator();
const memo = new Map<string, unknown>();

function trace(p: Path2D, set: OpSet) {
  for (const { op, data: d } of set.ops) {
    if (op === "move") p.moveTo(d[0], d[1]);
    else if (op === "bcurveTo") p.bezierCurveTo(d[0], d[1], d[2], d[3], d[4], d[5]);
    else p.lineTo(d[0], d[1]);
  }
}

// every shape is generated once per key (seed, size bucket, boil frame), so lines never shimmer at rest
export function once<T>(key: string, make: () => T): T {
  let v = memo.get(key) as T | undefined;
  if (v !== undefined) return v;
  if (memo.size > 4000) memo.clear();
  v = make();
  memo.set(key, v);
  return v;
}

export function ink(key: string, make: (g: Gen) => Drawable | Drawable[]): Ink {
  return once(key, () => {
    const out: Ink = { line: new Path2D(), hatch: null };
    for (const d of [make(gen)].flat()) for (const set of d.sets) {
      if (set.type === "fillSketch") trace((out.hatch ||= new Path2D()), set);
      else if (set.type === "path") trace(out.line, set);
    }
    return out;
  });
}
