import type { Catalog, CatalogBackend, Combo, Profile } from "@/domain/types";

export type CatView = {
  bids: string[];
  bmeta: Map<string, CatalogBackend>;
  profiles: Profile[];
  kindOf: (id: string) => string;
  combo: (p: string, b: string) => Combo;
  defaults: NonNullable<Catalog["defaults"]>;
};

export function catalogView(c: Catalog | null): CatView | null {
  if (!c || !Array.isArray(c.profiles) || !c.profiles.length) return null;
  const raw = Array.isArray(c.backends) ? c.backends : [];
  const bmeta = new Map(raw.filter((b): b is CatalogBackend => !!b && typeof b === "object").map((b) => [b.id, b]));
  const bids = raw.map((b) => (typeof b === "string" ? b : b.id));
  if (!bids.includes("local")) bids.push("local");
  const kindOf = (id: string) => bmeta.get(id)?.kind || (id === "local" ? "local" : "remote");
  const combo = (p: string, b: string): Combo =>
    (Array.isArray(c.combos) && c.combos.find((k) => k.profile === p && k.backend === b)) || { profile: p, backend: b, available: false, reason: `${p} has no ${b} combination in the catalog` };
  return { bids, bmeta, profiles: c.profiles, kindOf, combo, defaults: c.defaults || {} };
}
