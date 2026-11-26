import type { Row } from "../../data/types";

export type Cols = { name: number; slot: number; profile: number; backend: number; status: number; mem: number; share: number; url: number };

const GAP = 2;
const MARK = 2;
const longest = (xs: string[], head: string) => Math.max(head.length, ...xs.map((x) => x.length));

// natural widths, then shrink url, name, profile, backend in that order until the row fits
export function layout(rows: Row[], width: number): Cols {
  const c: Cols = {
    name: Math.min(longest(rows.map((r) => r.label), "name"), 28),
    slot: 4,
    profile: Math.min(longest(rows.map((r) => r.profile), "profile"), 16),
    backend: Math.min(longest(rows.map((r) => r.backend), "backend"), 14),
    status: 12,
    mem: 6,
    share: 5,
    url: longest(rows.map((r) => r.url), "url"),
  };
  const total = () => MARK + Object.values(c).filter((w) => w > 0).reduce((n, w) => n + w + GAP, 0) - GAP;
  const floors: [keyof Cols, number][] = [["url", 12], ["name", 10], ["profile", 7], ["backend", 7], ["url", 0], ["share", 0], ["profile", 0], ["slot", 0], ["backend", 0], ["status", 9]];
  for (const [k, floor] of floors) {
    const over = total() - width;
    if (over <= 0) break;
    c[k] = k === "share" ? 0 : Math.min(c[k], Math.max(floor, c[k] - over));
  }
  return c;
}

export const COL_GAP = GAP;
