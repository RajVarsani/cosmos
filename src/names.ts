// Default instance names: well-known stars in a fixed shuffled order; one word, so NAME_RE and docker names hold.
const STARS = [
  "vega", "rigel", "altair", "deneb", "antares", "sirius", "polaris", "capella", "arcturus", "betelgeuse",
  "aldebaran", "spica", "procyon", "canopus", "regulus", "fomalhaut", "castor", "pollux", "bellatrix", "mira",
  "algol", "alcor", "mizar", "dubhe", "merak", "alioth", "alkaid", "shaula", "sargas", "achernar",
  "hadar", "acrux", "mimosa", "adhara", "wezen", "alnilam", "alnitak", "mintaka", "saiph", "elnath",
  "alphard", "denebola", "algieba", "markab", "scheat", "alpheratz", "mirach", "hamal", "menkar", "diphda",
  "enif", "sadr", "albireo", "rasalhague", "kochab", "thuban", "alderamin", "nunki", "kaus", "vindemiatrix",
];

export function pickStarName(taken: Iterable<string>): string {
  const t = new Set(taken);
  return STARS.find((n) => !t.has(n)) ?? `${STARS[0]}-2`;
}

export const NAME_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
export const LABEL_MAX = 60;

export function slugify(s: string, room = 41): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, room).replace(/-+$/, "");
}

// -2, -3 on collision; the base gives up room for the suffix so the id stays NAME_RE-safe
export function uniqueName(base: string, taken: Iterable<string>): string {
  const t = new Set(taken);
  if (!t.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const c = base.slice(0, 41 - suffix.length).replace(/-+$/, "") + suffix;
    if (!t.has(c)) return c;
  }
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// A valid slug is an id (explicit: may name an existing instance). Free text reuses the instance already carrying that label
// (or an unlabelled one whose id is its slug); otherwise it mints a fresh id from the slug.
export function resolveIdentity(input: string | undefined, existing: Iterable<{ name: string; label?: string }>): { name: string; label: string; explicit: boolean } {
  const inst = [...existing];
  const taken = inst.map((i) => i.name);
  const typed = input?.trim();
  if (!typed) {
    const name = pickStarName(taken);
    return { name, label: capitalise(name), explicit: false };
  }
  if (NAME_RE.test(typed)) return { name: typed, label: typed, explicit: true };
  const slug = slugify(typed);
  if (!slug) throw new Error(`name "${typed}" has no letters or digits`);
  const label = typed.replace(/\s+/g, " ").slice(0, LABEL_MAX).trim();
  const same = inst.find((i) => (i.label && i.label !== i.name ? i.label.toLowerCase() === label.toLowerCase() : i.name === slug));
  if (same) return { name: same.name, label: same.label ?? label, explicit: true };
  return { name: uniqueName(slug, taken), label, explicit: false };
}

// An instance ref is an id, else a label (trimmed, case-insensitive). Several label matches is an error, never a guess.
export function findByRef<T extends { name: string; label?: string }>(ref: string, instances: T[]): T | undefined {
  const exact = instances.find((i) => i.name === ref);
  if (exact) return exact;
  const want = ref.replace(/\s+/g, " ").trim().toLowerCase();
  const hits = instances.filter((i) => (i.label ?? i.name).toLowerCase() === want);
  if (hits.length > 1) throw new Error(`"${ref}" matches ${hits.length} instances (${hits.map((h) => h.name).join(", ")}); use the id`);
  return hits[0];
}
