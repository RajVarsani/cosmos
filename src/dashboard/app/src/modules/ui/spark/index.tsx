import { mib } from "@/lib/format";
import { HIST } from "@/state/hist";

// memory over the last polls, and its peak; the svg is styled by its container
export function Spark({ h, peak = true }: { h: number[]; peak?: boolean }) {
  const max = Math.max(0, ...h), lo = Math.min(...h), rng = max - lo;
  if (!max) return null;
  const w = 64, bw = w / HIST, pts = h.map((v, k) => `${((HIST - h.length + k) * bw).toFixed(1)},${(rng ? 13 - ((v - lo) / rng) * 12 : 7).toFixed(1)}`).join(" ");
  return (
    <>
      <svg viewBox={`0 0 ${w} 14`} aria-hidden="true"><polyline points={pts} /></svg>
      {peak && <span>peak {mib(max)}</span>}
    </>
  );
}
