import { mib } from "@/lib/format";
import { HIST } from "@/state/hist";

// memory over the last polls, and its peak; the svg is styled by its container
export function Spark({ h, peak = true }: { h: number[]; peak?: boolean }) {
  if (!h.length) return null;
  const max = Math.max(0, ...h), top = Math.max(max, 1);
  const w = 64, bw = w / HIST, pts = h.map((v, k) => `${((HIST - h.length + k) * bw).toFixed(1)},${(13 - (Math.max(0, v) / top) * 12).toFixed(1)}`).join(" ");
  return (
    <>
      <svg viewBox={`0 0 ${w} 14`} aria-hidden="true"><polyline points={pts} /></svg>
      {peak && max > 0 && <span>peak {mib(max)}</span>}
    </>
  );
}
