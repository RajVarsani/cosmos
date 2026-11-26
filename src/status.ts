// Instance status and health rules shared by the dashboard and the TUI. No side effects on import.
import type { CosmosContainer } from "./docker";
import { svcDef } from "./catalog";

export type Probe = { ok: boolean; status: number | null; ms: number | null; at: number };

// http on the health path (some apps 500 on /), tcp for infra, nothing for one-shots and portless services
export function probeKind(svc: string): "http" | "tcp" | "none" {
  try {
    const d = svcDef(svc);
    if (d.kind === "init" || d.offset === undefined) return "none";
    return d.health ? "http" : "tcp";
  } catch {
    return "none";
  }
}

async function probeHttp(port: number, path: string): Promise<Probe> {
  const t0 = performance.now();
  try {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(2000), redirect: "manual" });
    await r.arrayBuffer().catch(() => {});
    return { ok: r.status < 500, status: r.status, ms: Math.round(performance.now() - t0), at: Date.now() };
  } catch {
    return { ok: false, status: null, ms: null, at: Date.now() };
  }
}

// tcp connect for services without HTTP (postgres, redis, mongo; localstack's edge is HTTP)
function probeTcp(port: number): Promise<Probe> {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const done = (ok: boolean) => resolve({ ok, status: null, ms: ok ? Math.round(performance.now() - t0) : null, at: Date.now() });
    const timer = setTimeout(() => done(false), 2000);
    const fail = () => { clearTimeout(timer); done(false); };
    Bun.connect({ hostname: "127.0.0.1", port, socket: { open(s) { clearTimeout(timer); s.end(); done(true); }, data() {}, error: fail, connectError: fail } }).catch(fail);
  });
}

export async function probe(svc: string, port: number, running: boolean): Promise<Probe | null> {
  const kind = probeKind(svc);
  if (kind === "none") return null;
  if (!running) return { ok: false, status: null, ms: null, at: Date.now() };
  return kind === "http" ? probeHttp(port, svcDef(svc).health ?? "/") : probeTcp(port);
}

// null for an init container that has not run
export function serviceHealthy(kind: string, c: CosmosContainer | undefined, p: Probe | null | undefined): boolean | null {
  if (kind === "init") return c ? c.status === "exited" && c.exitCode === 0 : null;
  if (!c?.running) return false;
  return p ? p.ok : c.health ? c.health === "healthy" : true;
}

// instance state from its main frontend container; the dashboard layers its job states on top
export function instanceState(main: CosmosContainer | undefined, p: Probe | null | undefined, up: number, of: number): string {
  if (!main) return up ? "partial" : "stopped";
  if (main.status === "restarting") return "restarting";
  if (!main.running) return "exited";
  const started = main.startedAt ? Date.now() - Date.parse(main.startedAt) : 0;
  if (p?.ok) return up < of ? "partial" : "running";
  return started < 10 * 60_000 ? "booting" : "unresponsive";
}
