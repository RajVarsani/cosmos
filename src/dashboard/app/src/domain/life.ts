import { EDGE_SVC, svcHealth, svcKind } from "./services";
import { projectStep } from "./palette";
import type { Container, Instance, Job, Overview } from "./types";

// creation and destruction, read from the running job and the containers, never a timer
const LIFE_WORD: Record<string, string> = { create: "creating", start: "starting", stop: "stopping", remove: "destroying", source: "switching" };
const STALL_MS = 8000;
const lifeSeen = new Map<string, { step: string; job: string; at: number }>();
const lifeGone = new Map<string, Set<string>>();

type Step = { text: string; svc?: string; hold?: string; list?: string[] };
function stepOf(i: Instance, job: NonNullable<Instance["job"]>): Step {
  const t = String(job.last || "").trim(), pre = `cosmos-${i.name}-`;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(Container|Volume|Network)\s+(\S+)\s+(\w+)/))) {
    const id = m[2].startsWith(pre) ? m[2].slice(pre.length) : m[2], verb = m[3].toLowerCase();
    if (m[1] === "Container") return { text: `${id} ${verb}`, svc: id };
    return { text: `${verb === "removed" ? "removed" : "removing"} ${m[1].toLowerCase()}s` };
  }
  if (/waiting for another cosmos build/.test(t)) return { text: "waiting for another build", hold: "another cosmos build" };
  if ((m = t.match(/^building (\S+)/))) return { text: `building ${m[1].replace(/^cosmos-/, "")}` };
  if ((m = t.match(/^built (\S+)/))) return { text: `built ${m[1].replace(/^cosmos-/, "")}` };
  if ((m = t.match(/^stage (\S+): (.+)$/))) return { text: `starting ${m[2]}`, list: m[2].split(/,\s*/) };
  if ((m = t.match(/^starting (.+?) on /))) return { text: `starting ${m[1].replace(/ \+ /g, ", ")}`, list: m[1].split(/\s*\+\s*/) };
  const ps = projectStep(t);
  if (ps) return { text: ps.text, svc: ps.svc };
  if (/^seed schema/.test(t)) return { text: "checking the seed schema" };
  if ((m = t.match(/^(\S+) answering on/))) return { text: `${m[1]} answering` };
  if (/expected to need/.test(t)) return { text: "checking VM memory" };
  if (/^edge :/.test(t)) return { text: "opening the edge" };
  if ((m = t.match(/^(stopping|removing) \S+$/))) return { text: m[1] === "stopping" ? "stopping containers" : "removing containers" };
  if (/^(create|start|stop|remove|source)( \S+)?$/.test(t)) return { text: "queued" };
  return { text: t.length > 64 ? `${t.slice(0, 61)}…` : t || "queued" };
}

// per service: 0 no container, 1 created, 2 running, 3 up and healthy, -1 failed
export function svcPhase(c: Container, i: Instance) {
  if (svcKind(c) === "init") return c.status === "exited" ? (c.exitCode === 0 ? 3 : -1) : c.running ? 2 : c.container ? 1 : 0;
  if (!c.container) return 0;
  if (!c.running) return c.status === "exited" && c.exitCode ? -1 : 1;
  const h = svcHealth(c, i).cls;
  return h === "ok" ? 3 : h === "bad" ? -1 : 2;
}

export type Life = {
  kind: string; up: boolean; jobId: string; frac: number; per: Record<string, number>;
  step: string; wait?: string | null; stalled?: boolean; done?: number; of?: number; failed?: boolean; error?: string;
};
export function lifeOf(i: Instance, d: Overview): Life | null {
  const cs = i.containers.filter((c) => c.service !== EDGE_SVC);
  const per: Record<string, number> = Object.fromEntries(cs.map((c) => [c.service, svcPhase(c, i)]));
  const job = i.job;
  if (job) {
    const up = job.kind === "create" || job.kind === "start", n = cs.length || 1;
    const st = stepOf(i, job);
    // compose reports each container as it goes; remember between polls, and once it moves on to networks and volumes every container is gone
    const gk = `${i.name}:${job.id}`, gone = lifeGone.get(gk) || new Set<string>();
    lifeGone.set(gk, gone);
    if (!up && st.svc && /(stopped|removed)$/.test(st.text)) gone.add(st.svc);
    if (job.kind === "remove" && /networks|volumes/.test(st.text)) cs.forEach((c) => gone.add(c.service));
    const off = (c: Container) => gone.has(c.service) || (job.kind === "stop" ? !c.running : !c.container);
    const frac = up ? cs.reduce((a, c) => a + Math.max(0, per[c.service]), 0) / (3 * n) : cs.filter(off).length / n;
    if (!up) for (const c of cs) if (off(c)) per[c.service] = 0;
    const byName = (x: string) => cs.find((c) => c.service === x);
    const pending = (x: string) => { const c = byName(x); return !!c && (up ? per[x] !== 3 : !off(c)); };
    const wait = st.hold || (st.list || []).find(pending) || (st.svc && pending(st.svc) ? st.svc : null) || cs.map((c) => c.service).find(pending) || null;
    const seen = lifeSeen.get(i.name), now = Date.now();
    if (!seen || seen.step !== st.text || seen.job !== job.id) lifeSeen.set(i.name, { step: st.text, job: job.id, at: now });
    const stalled = now - lifeSeen.get(i.name)!.at > STALL_MS;
    const done = up ? cs.filter((c) => per[c.service] === 3).length : cs.filter(off).length;
    return { kind: job.kind, up, jobId: job.id, frac, per, step: st.text, wait, stalled, done, of: cs.length };
  }
  lifeSeen.delete(i.name);
  for (const k of lifeGone.keys()) if (k.startsWith(`${i.name}:`)) lifeGone.delete(k);
  const fj = (d.jobs || []).find((j: Job) => j.target === i.name && j.endedAt && j.ok === false && Date.now() - Date.parse(j.endedAt) < 180000);
  if (fj) return { kind: fj.kind, up: fj.kind === "create" || fj.kind === "start", jobId: fj.id, frac: 0, per, failed: true, step: "failed", error: fj.error || "failed" };
  return null;
}

export type LifeLine = { word: string; cls: "go" | "bad"; detail: string };
// one line for labels and the HUD: word, then the step or who it waits on
export function lifeLine(L: Life | null): LifeLine | null {
  if (!L) return null;
  if (L.failed) return { word: "failed", cls: "bad", detail: L.error || "" };
  const detail = L.stalled && L.wait ? `waiting on ${L.wait}` : L.step;
  return { word: LIFE_WORD[L.kind] || L.kind, cls: "go", detail: `${detail}${(L.of || 0) > 1 ? ` · ${L.done}/${L.of}` : ""}` };
}
