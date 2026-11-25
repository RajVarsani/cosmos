import { TRANSIT } from "./states";
import type { Container, Instance } from "./types";

export const INFRA = new Set(["pg", "postgres", "redis", "mongo", "mongodb", "localstack"]);
const FE_RE = /(^|-)(fe|web|ui|frontend)$/;
// cosmos's own Caddy edge in front of a remote backend: plumbing, never a planet, never counted
export const EDGE_SVC = "edge";
// edge listens per upstream host (ports["edge:<host>"]); the first is "the edge port"
export const edgePortOf = (i: Instance) => {
  const keys = Object.keys(i.ports || {}).filter((k) => k.startsWith("edge:")).sort();
  return keys.length ? i.ports[keys[0]] : null;
};
// kind comes from the API; name rules only cover an older server
export function svcKind(c: Pick<Container, "service" | "kind">) {
  if (c.kind) return c.kind;
  const s = c.service;
  if (/-init$|bootstrap$/.test(s)) return "init";
  if (INFRA.has(s)) return "infra";
  return FE_RE.test(s) ? "fe" : "app";
}
export const httpProbed = (c: Container) => (c.healthPath !== undefined ? c.healthPath != null : !["infra", "init"].includes(svcKind(c)));
export function runCount(i: Instance) {
  if (i.running && typeof i.running === "object") return i.running;
  const lr = i.containers.filter((c) => svcKind(c) !== "init");
  return { up: lr.filter((c) => c.running).length, of: lr.length };
}

export type Health = { cls: "" | "ok" | "go" | "bad"; text: string };
export function svcHealth(c: Container, i: Instance): Health {
  const k = svcKind(c);
  if (k === "init") {
    if (c.running) return { cls: "go", text: "init · running" };
    if (c.status === "exited") return c.exitCode === 0 ? { cls: "ok", text: "init · done" } : { cls: "bad", text: `init · exit ${c.exitCode ?? "?"}` };
    return { cls: "", text: "init · pending" };
  }
  if (c.running) {
    // never show an HTTP result for a service that does not speak HTTP
    if (!httpProbed(c)) {
      if (c.health === "healthy") return { cls: "ok", text: "healthy" };
      if (c.health === "unhealthy") return { cls: "bad", text: "unhealthy" };
      if (c.health === "starting") return { cls: "go", text: "starting" };
      return { cls: "ok", text: "container up" };
    }
    if (c.http && c.http.ok) return { cls: "ok", text: `${c.http.status} · ${c.http.ms}ms` };
    const young = c.startedAt && Date.now() - Date.parse(c.startedAt) < 10 * 60_000;
    return young || TRANSIT.has(i.state) ? { cls: "go", text: "booting" } : { cls: "bad", text: "no answer" };
  }
  if (c.status === "exited") return c.exitCode === 0 ? { cls: "", text: "exited 0" } : { cls: "bad", text: `exit ${c.exitCode ?? "?"}${c.oomKilled ? " oom" : ""}` };
  return { cls: "", text: c.status };
}

export const BANDS = [["fe", "frontends"], ["app", "backends"], ["infra", "infra"]] as const;
export type Band = [kind: string, title: string, list: Container[]];
export const svcList = (i: Instance): Band[] => {
  const cs = i.containers.filter((c) => c.service !== EDGE_SVC);
  return BANDS.map(([k, t]): Band => [k, t, cs.filter((c) => (k === "infra" ? ["infra", "init"].includes(svcKind(c)) : svcKind(c) === k))]).filter((g) => g[2].length);
};
export const feOf = (i: Instance) => i.containers.find((c) => c.running && svcKind(c) === "fe" && (c.url || c.port));
export const urlOf = (i: Instance) => { const fe = feOf(i); return i.url || (fe && (fe.url || `http://localhost:${fe.port}`)) || null; };
export const svcUrl = (c: Container) => c.url || (c.port ? `http://localhost:${c.port}` : null);
// the container whose logs open first: a frontend, else anything with a container
export const mainOf = (i: Instance) => i.containers.find((c) => c.container && svcKind(c) === "fe") || i.containers.find((c) => c.container);
export const upCmd = (i: Instance) => ["cosmos up", i.profile && `--profile ${i.profile}`, `--backend ${i.backend}`, `--name ${i.name}`].filter(Boolean).join(" ");
