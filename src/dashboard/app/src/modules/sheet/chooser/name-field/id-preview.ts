import type { Instance } from "@/domain/types";

// the id the server will mint from what is typed (mirrors resolveIdentity in src/names.ts; the server's answer wins)
export const slugOf = (t: string) => t.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 41).replace(/-+$/, "");

type Src = { instances?: Instance[]; nextName?: string | null } | null | undefined;

export function idPreview(name: string, d: Src) {
  const t = (name || "").trim(), inst = d?.instances || [];
  if (!t) return d?.nextName ? `id ${d.nextName}` : "id: the next free star name";
  if (/^[a-z0-9][a-z0-9-]{0,40}$/.test(t)) return inst.some((i) => i.name === t) ? `id ${t} · already exists` : `id ${t}`;
  const sl = slugOf(t);
  if (!sl) return "needs a letter or digit";
  const lb = t.replace(/\s+/g, " ").slice(0, 60).trim().toLowerCase();
  const same = inst.find((i) => (i.label ? i.label.toLowerCase() === lb : i.name === sl));
  if (same) return `id ${same.name} · already exists`;
  const taken = new Set(inst.map((i) => i.name));
  let id = sl;
  for (let n = 2; taken.has(id); n++) id = sl.slice(0, 41 - String(n).length - 1).replace(/-+$/, "") + `-${n}`;
  return `id ${id}`;
}
