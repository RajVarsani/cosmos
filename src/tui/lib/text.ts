const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;
export const stripAnsi = (s: string) => s.replace(ANSI, "");

// fit to exactly w cells: truncate with an ellipsis, else pad
export function fit(s: string, w: number, align: "left" | "right" = "left"): string {
  if (w <= 0) return "";
  const t = s.length > w ? (w === 1 ? "…" : `${s.slice(0, w - 1)}…`) : s;
  return align === "right" ? t.padStart(w) : t.padEnd(w);
}

export const mem = (mib: number | null) => (mib === null ? "–" : mib >= 1024 ? `${(mib / 1024).toFixed(1)}G` : `${Math.round(mib)}M`);
