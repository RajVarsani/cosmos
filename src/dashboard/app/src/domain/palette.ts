import { hash } from "@/lib/hash";

// the project decides the look: per backend and per service colours and planet looks arrive as data (overview.meta)
export type BackendLook = { c: string; core: string; star: number; guard?: boolean };
// one procedural identity per service; k picks the surface program
export type Look = { k: number; tilt: number; spin: number; atm: string | null; atmK: number; atmR?: number; ring?: boolean };
export type Meta = { backends?: Record<string, BackendLook>; services?: Record<string, string>; looks?: Record<string, Look>; steps?: { match: string; text: string; svc?: string }[] };

let BACKEND: Record<string, BackendLook> = {};
let SVC_C: Record<string, string> = {};
let LOOK: Record<string, Look> = {};
let STEPS: { re: RegExp; text: string; svc?: string }[] = [];
let seen = "";

export function applyMeta(m: Meta | undefined) {
  const key = JSON.stringify(m ?? {});
  if (key === seen) return;
  seen = key;
  BACKEND = m?.backends ?? {};
  SVC_C = m?.services ?? {};
  LOOK = m?.looks ?? {};
  STEPS = (m?.steps ?? []).flatMap((x) => { try { return [{ re: new RegExp(x.match), text: x.text, svc: x.svc }]; } catch { return []; } });
}

export const bk = (b: string): BackendLook => BACKEND[b] || { c: `hsl(${hash(b) % 360} 80% 70%)`, core: "#fff", star: 1 };
export const svcC = (s: string) => SVC_C[s] || `hsl(${hash(s) % 360} 60% 68%)`;
export const titleOf = (id: string) => id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
export const lookOf = (svc: string): Look => LOOK[svc] || { k: 0, tilt: ((hash(svc) % 60) / 100) - 0.3, spin: 0.05 + (hash(svc + "s") % 5) / 100, atm: null, atmK: 0 };
// a job line the project names as a step (seeding, migrations)
export const projectStep = (t: string) => STEPS.find((x) => x.re.test(t)) ?? null;

// log sources, in pick order
export const SRC_PAL = ["#ffc46b", "#8fa7ff", "#7bd88f", "#ff9ac1"];
