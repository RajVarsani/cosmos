import type { Line } from "../logs-store";

const W = 60;
const SPANS: [number, string][] = [[60, "60s"], [300, "5m"], [900, "15m"], [3600, "1h"], [21600, "6h"], [86400, "24h"], [604800, "7d"]];
export type Bar = { x: string; y: string; w: string; h: string; fill: string };

// window stretches to cover the buffer, so the chart counts the same lines as the level chips
export function volumeBins(buf: Line[], now: number) {
  const bins = Array.from({ length: W }, () => [0, 0, 0]);
  const oldest = buf.length ? buf[0].t : now;
  const [span, spanT] = SPANS.find(([s]) => now - oldest < s * 1000) || SPANS[SPANS.length - 1];
  const bin = (span * 1000) / W;
  for (let k = buf.length - 1; k >= 0; k--) {
    const x = buf[k], age = Math.max(0, Math.floor((now - x.t) / bin));
    if (age >= W) break;
    bins[W - 1 - age][x.lv === "error" ? 2 : x.lv === "warn" ? 1 : 0]++;
  }
  const max = Math.max(4, ...bins.map((b) => b[0] + b[1] + b[2]));
  const bw = 100 / W;
  const bars: Bar[] = [];
  bins.forEach((b, k) => {
    let y = 22;
    for (const [v, fill] of [[b[0], "var(--vol-line)"], [b[1], "var(--amb)"], [b[2], "var(--red)"]] as const) {
      if (!v) continue;
      const h = Math.max(1, (v / max) * 20);
      y -= h;
      bars.push({ x: (k * bw + 0.1).toFixed(2), y: y.toFixed(2), w: (bw - 0.35).toFixed(2), h: h.toFixed(2), fill });
    }
  });
  const tot = bins.reduce((a, b) => a + b[0] + b[1] + b[2], 0);
  return { bars, tot, all: buf.length, spanT };
}
