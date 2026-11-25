import type { Overview } from "@/domain/types";

// memory per service over the last polls, kept for the tab's life
export const HIST = 48;
export const hist = new Map<string, number[]>();
try { const h = JSON.parse(sessionStorage.getItem("cosmos-hist") || "{}"); for (const k in h) hist.set(k, h[k]); } catch {}

export function recordHist(d: Overview) {
  const live = new Set<string>();
  for (const i of d.instances) for (const c of i.containers) {
    const k = `${i.name}/${c.service}`;
    live.add(k);
    const a = hist.get(k) || [];
    a.push(c.running && c.memMiB != null ? Math.round(c.memMiB) : 0);
    while (a.length > HIST) a.shift();
    hist.set(k, a);
  }
  for (const k of [...hist.keys()]) if (!live.has(k)) hist.delete(k);
  try { sessionStorage.setItem("cosmos-hist", JSON.stringify(Object.fromEntries(hist))); } catch {}
}
