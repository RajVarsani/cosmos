import { join } from "path";
import { existsSync } from "fs";
import * as ops from "../ops";
import { CosmosError } from "../ops";
import { resolveIdentity } from "../names";
import { readState, reservedNames, slotCandidates, type Instance } from "../state";
import { cosmosContainers, containerStats, vmMemory, type CosmosContainer, type MemStat, type VmMem } from "../docker";
import { projectDir } from "../paths";
import { BASE_PORT, MAX_SLOT, SLOT_STRIDE, OFFSETS } from "../offsets";
import { MIN_VM_MIB, VM_FLOOR_MIB } from "../ops";
import { manifest, svcDef, vendorDir } from "../catalog";
import { dashboardMeta } from "../recipe";
import type { DashboardMeta } from "../api";
import { run } from "../sh";
import { shareAlive } from "../share";
import { probe, probeKind, instanceState, serviceHealthy, type Probe } from "../status";

import { DIST } from "./build";

const PAGE = join(DIST, "index.html");
const STARTED_AT = new Date().toISOString();

// ---------- probes: cached, refreshed only while someone is looking ----------

type Git = Awaited<ReturnType<typeof ops.gitInfo>>;

const cache = {
  containers: [] as CosmosContainer[],
  stats: {} as Record<string, MemStat>,
  statsAt: 0,
  vm: null as VmMem | { error: string } | null,
  vmAt: 0,
  http: {} as Record<string, Probe>,
  git: {} as Record<string, Git & { at: number }>,
  catalog: null as null | Awaited<ReturnType<typeof ops.catalog>> | { error: string },
  catalogAt: 0,
  workers: {} as Record<string, Awaited<ReturnType<typeof ops.workers>>>,
  shares: {} as Record<string, ops.ShareView | null>,
  errors: {} as Record<string, { count: number; windowMin: number; at: number }>,
  pins: null as null | { project: { id: string; repo: string; head: string | null; vendored: string | null }; items: NonNullable<DashboardMeta["pins"]> },
  meta: {} as Omit<DashboardMeta, "pins">,
};

let lastSeen = 0;
const watching = () => Date.now() - lastSeen < 30_000;

async function refreshFast() {
  cache.containers = await cosmosContainers().catch(() => cache.containers);
  const insts = Object.values(readState().instances);
  const shares: typeof cache.shares = {};
  await Promise.all(insts.filter((i) => i.share).map(async (i) => {
    const fe = cache.containers.find((x) => x.instance === i.name && x.service === i.share!.fe);
    shares[i.name] = await ops.shareView(i, !!fe?.running).catch(() => null);
  }));
  cache.shares = shares;
  const probes = insts.flatMap((i) =>
    Object.entries(i.ports).map(async ([svc, port]) => {
      const c = cache.containers.find((x) => x.instance === i.name && x.service === svc);
      const p = await probe(svc, port, !!c?.running);
      if (p) cache.http[`${i.name}/${svc}`] = p;
    }),
  );
  await Promise.all(probes);
}

async function refreshCatalog() {
  cache.catalog = await ops.catalog().catch((e) => ({ error: `${(e as Error).message}\nrun cosmos doctor in a terminal for what to fix` }));
  cache.catalogAt = Date.now();
}

// portless workers (queue consumers, schedulers): only a process listing shows they died
async function refreshWorkers() {
  const running = new Set(cache.containers.filter((c) => c.running).map((c) => `${c.instance}/${c.service}`));
  for (const i of Object.values(readState().instances)) {
    if (!Object.keys(ops.WORKERS()).some((svc) => running.has(`${i.name}/${svc}`))) {
      delete cache.workers[i.name];
      continue;
    }
    cache.workers[i.name] = await ops.workers(i).catch(() => ({}));
  }
}

// Log lines that look like errors in the last 15 minutes, per running container (capped read; a hint, not a verdict).
const ERR_RE = /\b(error|exception|traceback|panic|fatal)\b/i;
async function refreshErrors() {
  for (const c of cache.containers.filter((x) => x.running)) {
    const r = await run(["docker", "logs", "--since", "15m", "--tail", "3000", c.name], { quiet: true });
    if (r.code !== 0) continue;
    const count = (r.stdout + "\n" + r.stderr).split("\n").filter((l) => ERR_RE.test(l)).length;
    cache.errors[c.name] = { count, windowMin: 15, at: Date.now() };
  }
}

async function refreshStats() {
  const running = cache.containers.filter((c) => c.running).map((c) => c.name);
  cache.stats = await containerStats(running).catch(() => cache.stats);
  cache.statsAt = Date.now();
}

async function refreshVm() {
  cache.vm = await vmMemory();
  cache.vmAt = Date.now();
}

async function refreshGit(force = false) {
  const dirs = new Set<string>();
  for (const i of Object.values(readState().instances)) for (const d of Object.values(i.src)) dirs.add(d);
  await Promise.all(
    [...dirs].map(async (d) => {
      const prev = cache.git[d];
      if (!force && prev && Date.now() - prev.at < 20_000) return;
      cache.git[d] = { ...(existsSync(d) ? await ops.gitInfo(d) : { branch: null, sha: null, dirty: null }), at: Date.now() };
    }),
  );
}

// the project checkout and its vendored worktree, plus cosmos.yaml's dashboard looks and pinned services
async function refreshPins() {
  const repo = projectDir();
  const [p, v] = await Promise.all([ops.gitInfo(repo), ops.gitInfo(vendorDir())]);
  const { pins, ...meta } = await dashboardMeta();
  cache.meta = meta;
  cache.pins = { project: { id: manifest().projectId, repo, head: p.sha, vendored: v.sha }, items: pins ?? [] };
}

function loop(fn: () => Promise<void>, everyMs: number) {
  let busy = false;
  const tick = async () => {
    if (busy || !watching()) return;
    busy = true;
    try {
      await fn();
    } catch (e) {
      console.error("[cosmos] probe failed:", (e as Error).message);
    } finally {
      busy = false;
    }
  };
  setInterval(tick, everyMs);
  return tick;
}

const kick = {
  fast: loop(refreshFast, 2000),
  stats: loop(refreshStats, 5000),
  vm: loop(refreshVm, 15_000),
  git: loop(() => refreshGit(), 10_000),
  pins: loop(refreshPins, 60_000),
  catalog: loop(refreshCatalog, 15_000),
  workers: loop(refreshWorkers, 5000),
  errors: loop(refreshErrors, 60_000),
};

// A share that is on and whose instance runs but whose proxy died comes back, with backoff; runs whether or not anyone watches.
const revive: Record<string, { tries: number; next: number }> = {};
async function superviseShares() {
  const cs = await cosmosContainers().catch(() => null);
  if (!cs) return;
  for (const i of Object.values(readState().instances)) {
    const sh = i.share;
    if (!sh || sh.unavailable || activeJobFor(i.name)) continue;
    if (!cs.find((c) => c.instance === i.name && c.service === sh.fe)?.running) continue;
    if (sh.proxyPid && (await shareAlive(sh)).proxy) {
      delete revive[i.name];
      continue;
    }
    const b = (revive[i.name] ??= { tries: 0, next: 0 });
    if (Date.now() < b.next) continue;
    b.tries++;
    b.next = Date.now() + Math.min(30_000 * 2 ** (b.tries - 1), 600_000);
    console.error(`[cosmos] share of ${i.name} is down; restarting it (try ${b.tries})`);
    // ifStill: share() re-checks under the op lock and gives up if this share was turned off or changed meanwhile
    await ops.share(i.name, { ifStill: { startedAt: sh.startedAt, proxyPid: sh.proxyPid } }, { log: (m) => console.error(`[cosmos] ${i.name}: ${m}`) }).catch((e) => {
      if ((e as { detail?: { stale?: boolean } }).detail?.stale) delete revive[i.name];
      console.error(`[cosmos] share of ${i.name}: ${(e as Error).message}`);
    });
  }
}
setInterval(() => void superviseShares().catch(() => {}), 15_000);

async function kickAll() {
  lastSeen = Date.now();
  await Promise.all([kick.fast(), kick.git(), kick.pins(), kick.vm(), kick.catalog()]);
  await Promise.all([kick.stats(), kick.workers()]);
  kick.errors();
}

// ---------- jobs: one action at a time per instance ----------

type Line = { t: number; kind: "log" | "out" | "done" | "error"; text: string };
type Job = {
  id: string;
  kind: "create" | "start" | "stop" | "remove" | "source";
  target: string | null;
  backend?: string;
  startedAt: string;
  endedAt?: string;
  ok?: boolean;
  error?: string;
  result?: unknown;
  lines: Line[];
  subs: Set<(l: Line) => void>;
};

const jobs = new Map<string, Job>();
const MAX_LINES = 4000;

const activeJobFor = (name: string) => [...jobs.values()].find((j) => !j.endedAt && j.target === name);

function push(job: Job, kind: Line["kind"], text: string) {
  const l = { t: Date.now(), kind, text };
  job.lines.push(l);
  if (job.lines.length > MAX_LINES) job.lines.splice(0, job.lines.length - MAX_LINES);
  for (const s of job.subs) s(l);
}

function reporterFor(job: Job): ops.Reporter {
  const partial = { stdout: "", stderr: "" };
  let prev = "";
  return {
    log: (m) => push(job, "log", m),
    output: (chunk, stream) => {
      const parts = (partial[stream] + chunk).split(/\r?\n|\r/);
      partial[stream] = parts.pop() ?? "";
      for (const raw of parts) {
        const line = stripAnsi(raw).trimEnd();
        // compose's plain progress repeats each event line
        if (line.trim() && line !== prev) push(job, "out", line);
        prev = line;
      }
    },
  };
}

function runJob(kind: Job["kind"], target: string | null, work: (r: ops.Reporter, job: Job) => Promise<unknown>, backend?: string): Job {
  const job: Job = { id: crypto.randomUUID().slice(0, 8), kind, target, backend, startedAt: new Date().toISOString(), lines: [], subs: new Set() };
  jobs.set(job.id, job);
  for (const [id, j] of jobs) if (j.endedAt && Date.now() - Date.parse(j.endedAt) > 30 * 60_000) jobs.delete(id);
  push(job, "log", `${kind}${target ? ` ${target}` : ""}`);
  (async () => {
    try {
      job.result = await work(reporterFor(job), job);
      job.ok = true;
      push(job, "done", `${kind} ok`);
    } catch (e) {
      job.ok = false;
      job.error = (e as Error).message;
      push(job, "error", job.error);
    } finally {
      job.endedAt = new Date().toISOString();
      lastSeen = Date.now();
      kick.fast();
      refreshGit(true).catch(() => {});
    }
  })();
  return job;
}

const jobView = (j: Job) => ({
  id: j.id, kind: j.kind, target: j.target, backend: j.backend, startedAt: j.startedAt, endedAt: j.endedAt ?? null, ok: j.ok ?? null, error: j.error ?? null,
  last: j.lines.at(-1)?.text ?? null,
});

const dashOwner = (): Instance["owner"] => ({ cwd: projectDir(), sessionId: null, pid: process.pid, via: "dashboard" });

// ---------- overview ----------

function derive(job: Job | undefined, main: CosmosContainer | undefined, http: Probe | undefined, up: number, of: number): string {
  if (job) return { create: "creating", start: "starting", stop: "stopping", remove: "removing", source: "switching" }[job.kind];
  return instanceState(main, http, up, of);
}

// contract shape for the sheet; the password is shown on this loopback-only console, never logged
function shareOut(i: Instance, v: ops.ShareView | null | undefined) {
  const s = i.share!;
  return {
    url: s.url, zrokName: s.zrokName, fe: s.fe, public: s.public, user: s.public ? null : s.user, password: s.public ? null : s.password,
    state: v?.state ?? (s.unavailable ? "unavailable" : "starting"), reason: v?.reason ?? s.unavailable ?? null, preview: v?.preview ?? null,
    remote: v?.remote ?? ops.remoteView(i, s.fe, s), notice: s.notice ?? null, exposeAdmin: !!s.exposeAdmin, warnings: s.warnings ?? [],
  };
}

function overview() {
  const s = readState();
  const insts = Object.values(s.instances).sort((a, b) => a.slot - b.slot);
  return {
    now: new Date().toISOString(),
    dashboard: { pid: process.pid, startedAt: STARTED_AT, port: PORT },
    formula: { base: BASE_PORT, stride: SLOT_STRIDE, maxSlot: MAX_SLOT, offsets: OFFSETS() },
    pins: cache.pins,
    meta: cache.meta,
    vm: cache.vm ? { ...cache.vm, at: cache.vmAt, minBuildMiB: MIN_VM_MIB } : null,
    statsAt: cache.statsAt,
    backends: ops.backends(),
    // every backend and profile (cosmos.yaml), with availability and the reason when unavailable
    catalog: cache.catalog ? { ...cache.catalog, at: cache.catalogAt } : null,
    floorMiB: VM_FLOOR_MIB,
    nextSlot: slotCandidates(s)[0] ?? null,
    instances: insts.map((i) => {
      const job = activeJobFor(i.name);
      const urls = ops.serviceUrls(i);
      const containers = i.services.map((svc) => {
        const c = cache.containers.find((x) => x.instance === i.name && x.service === svc);
        const http = cache.http[`${i.name}/${svc}`];
        const st = c ? cache.stats[c.name] : undefined;
        const kind = svcDef(svc).kind;
        const pk = probeKind(svc);
        const healthy = serviceHealthy(kind, c, http);
        const err = c ? cache.errors[c.name] : undefined;
        return {
          service: svc,
          kind,
          port: i.ports[svc] ?? null,
          url: urls[svc] ?? null,
          healthPath: svcDef(svc).health ?? null,
          container: c?.name ?? null,
          status: c?.status ?? "absent",
          running: !!c?.running,
          healthy,
          startedAt: c?.startedAt ?? null,
          finishedAt: c?.finishedAt ?? null,
          exitCode: c?.exitCode ?? null,
          restarts: c?.restarts ?? 0,
          oomKilled: !!c?.oomKilled,
          health: c?.health ?? null,
          http: pk === "http" ? http ?? null : null,
          // how health is judged: http on healthPath, tcp connect on the port, or none (one-shot / portless)
          probe: { kind: pk, path: pk === "http" ? svcDef(svc).health ?? "/" : null, ok: http?.ok ?? null, status: http?.status ?? null, ms: http?.ms ?? null, at: http?.at ?? null },
          errors: err ? { count: err.count, windowMin: err.windowMin, at: err.at } : null,
          memMiB: st?.usedMiB ?? null,
          memLimitMiB: st?.limitMiB ?? null,
          cpuPct: st?.cpuPct ?? null,
        };
      });
      const longRunning = containers.filter((c) => c.kind !== "init");
      const upCount = longRunning.filter((c) => c.running).length;
      const feSvc = ops.mainFe(i.services);
      const fe = cache.containers.find((x) => x.instance === i.name && x.service === feSvc);
      const corsBlocked = (i.cors ?? []).filter((c) => !c.allowed);
      return {
        ...i,
        label: i.label ?? i.name,
        profile: ops.profileOf(i),
        mode: ops.modeOf(i),
        mainService: feSvc,
        url: ops.serviceUrl(i),
        urls,
        state: derive(job, fe, cache.http[`${i.name}/${feSvc}`], upCount, longRunning.length),
        running: { up: upCount, of: longRunning.length, healthy: longRunning.filter((c) => c.healthy).length },
        memMiB: containers.reduce((n, c) => n + (c.memMiB ?? 0), 0) || null,
        containers,
        workers: cache.workers[i.name] ?? null,
        cors: i.cors ?? [],
        corsWarning: corsBlocked.length ? `${corsBlocked.map((c) => c.target).join(", ")} ${corsBlocked.length > 1 ? "do" : "does"} not allow ${corsBlocked[0].origin}; browser API calls will fail CORS` : null,
        git: Object.fromEntries(Object.entries(i.src).map(([svc, d]) => [svc, cache.git[d] ?? null])),
        job: job ? jobView(job) : null,
        // both share processes alive; null when not shared
        shareUp: i.share ? cache.shares[i.name]?.state === "live" : null,
        share: i.share ? shareOut(i, cache.shares[i.name]) : null,
      };
    }),
    // Creates that have not reserved a slot yet, and recent finished jobs for the activity strip.
    pending: [...jobs.values()].filter((j) => !j.endedAt && j.kind === "create" && !s.instances[j.target ?? ""]).map(jobView),
    jobs: [...jobs.values()].slice(-12).reverse().map(jobView),
  };
}

// ---------- http ----------

const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;
const stripAnsi = (s: string) => s.replace(ANSI, "");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const fail = (e: unknown, status = 400) =>
  json({ ok: false, error: (e as Error).message, ...(e instanceof CosmosError ? e.detail : {}) }, e instanceof CosmosError ? status : 500);

function sse(req: Request, open: (send: (event: string, data: unknown) => void, close: () => void) => () => void): Response {
  let cleanup = () => {};
  let closed = false;
  const stream = new ReadableStream({
    start(ctl) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(beat);
        cleanup();
        try {
          ctl.close();
        } catch {}
      };
      const beat = setInterval(() => {
        try {
          ctl.enqueue(enc.encode(": beat\n\n"));
        } catch {}
      }, 15_000);
      req.signal.addEventListener("abort", close);
      ctl.enqueue(enc.encode("retry: 3000\n\n"));
      cleanup = open(send, close);
    },
    cancel() {
      closed = true;
      cleanup();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } });
}

function logStream(req: Request, name: string, svc: string, tail: number): Response {
  return sse(req, (send, close) => {
    let proc: ReturnType<typeof ops.spawnLogs>;
    try {
      proc = ops.spawnLogs(name, svc, tail);
    } catch (e) {
      send("end", { reason: (e as Error).message });
      queueMicrotask(close);
      return () => {};
    }
    send("open", { name, svc, tail });
    const pump = async (s: ReadableStream<Uint8Array>, stream: "out" | "err") => {
      const dec = new TextDecoder();
      let partial = "";
      for await (const buf of s) {
        const parts = (partial + dec.decode(buf, { stream: true })).split("\n");
        partial = parts.pop() ?? "";
        const batch = parts.filter(Boolean).map((raw) => {
          const line = stripAnsi(raw).replace(/\r/g, "");
          const m = line.match(/^(\d{4}-\d\d-\d\dT[\d:.]+Z)\s(.*)$/);
          return m ? { ts: m[1], text: m[2], stream } : { ts: null, text: line, stream };
        });
        if (batch.length) send("lines", batch);
      }
    };
    Promise.all([pump(proc.stdout as ReadableStream, "out"), pump(proc.stderr as ReadableStream, "err")])
      .then(() => proc.exited)
      .then((code) => {
        send("end", { reason: code === 0 ? "container stopped" : `docker compose logs exited ${code}` });
        close();
      })
      .catch(() => close());
    return () => {
      try {
        proc.kill();
      } catch {}
    };
  });
}

function jobStream(req: Request, job: Job): Response {
  return sse(req, (send, close) => {
    send("job", jobView(job));
    if (job.lines.length) send("lines", job.lines);
    if (job.endedAt) {
      send("end", jobView(job));
      queueMicrotask(close);
      return () => {};
    }
    const sub = (l: Line) => {
      send("lines", [l]);
      if (l.kind === "done" || l.kind === "error") {
        setTimeout(() => {
          send("end", jobView(job));
          close();
        }, 0);
      }
    };
    job.subs.add(sub);
    return () => job.subs.delete(sub);
  });
}

// DAR-FB-172: browsers send Sec-Fetch-Site; anything but same-origin (or a direct navigation) is another site.
const crossSite = (req: Request) => {
  const s = req.headers.get("sec-fetch-site");
  return s !== null && s !== "same-origin" && s !== "none";
};

// {svc: ref}; empty refs mean "pinned" and are dropped, anything but a string is a 400
function branchesOf(x: unknown): Record<string, string> | undefined {
  if (x === undefined || x === null) return undefined;
  if (typeof x !== "object" || Array.isArray(x)) throw new CosmosError("branches must be an object of service: ref");
  const bad = Object.entries(x).find(([, v]) => typeof v !== "string");
  if (bad) throw new CosmosError(`branches.${bad[0]} must be a string (a branch, tag or sha), got ${bad[1] === null ? "null" : typeof bad[1]}`);
  const e = (Object.entries(x) as [string, string][]).filter(([, v]) => v.trim());
  return e.length ? Object.fromEntries(e.map(([k, v]) => [k, v.trim()])) : undefined;
}

// services allowed to mount the project clone live
function liveOf(x: unknown): string[] | undefined {
  if (x === undefined || x === null) return undefined;
  if (!Array.isArray(x) || x.some((v) => typeof v !== "string")) throw new CosmosError("live must be a list of service names");
  return x.length ? x : undefined;
}

async function body(req: Request): Promise<Record<string, any>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? b : {};
  } catch {
    return {};
  }
}

let PORT = BASE_PORT;

export function serve(hostname: string, port: number) {
  PORT = port;
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  kickAll().catch(() => {});

  return Bun.serve({
    hostname,
    port,
    idleTimeout: 255,
    async fetch(req) {
      const u = new URL(req.url);
      // DNS-rebinding guard: only answer to our own host names.
      if (!hosts.has(req.headers.get("host") ?? "")) return new Response("forbidden host", { status: 403 });
      if (req.method !== "GET") {
        const origin = req.headers.get("origin");
        // Custom header forces a CORS preflight we never answer, so other sites cannot drive actions.
        if (req.headers.get("x-cosmos") !== "1" || (origin && !hosts.has(origin.replace(/^https?:\/\//, "")))) {
          return json({ ok: false, error: "cross-origin request refused" }, 403);
        }
      }
      const p = u.pathname;

      if (p === "/" && req.method === "GET") {
        if (!existsSync(PAGE)) return new Response("dashboard not built: cd src/dashboard/app && bun install && bun run build", { status: 503 });
        return new Response(Bun.file(PAGE), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      }
      // hashed build output; names change with content, so it can be cached for good
      if (req.method === "GET" && /^\/assets\/[\w.-]+$/.test(p)) {
        const f = Bun.file(join(DIST, p));
        if (await f.exists()) return new Response(f, { headers: { "cache-control": "public, max-age=31536000, immutable" } });
      }
      if (p === "/api/ping") return json({ ok: true, pid: process.pid });
      if (p === "/api/overview") {
        const first = !cache.pins;
        lastSeen = Date.now();
        if (first) await kickAll();
        return json(overview());
      }

      if (p === "/api/catalog" && req.method === "GET") {
        lastSeen = Date.now();
        if (!cache.catalog || Date.now() - cache.catalogAt > 15_000) await refreshCatalog();
        return json(cache.catalog);
      }

      if (p === "/api/instances" && req.method === "POST") {
        const b = await body(req);
        try {
          const name = typeof b.name === "string" && b.name.trim() ? b.name.trim() : undefined;
          // a label resolves to its instance before the busy/exists checks
          let target: string | null = null;
          if (name) {
            const id = resolveIdentity(name, Object.values(readState().instances), reservedNames(readState()));
            if (id.explicit) target = id.name;
          }
          if (target) {
            // same guard as start/stop/remove: one job per instance name (DAR-FB-171)
            const busy = activeJobFor(target);
            if (busy) return json({ ok: false, error: `${target} is busy (${busy.kind} since ${busy.startedAt})`, job: jobView(busy) }, 409);
            if (readState().instances[target]) throw new CosmosError(`instance ${target} already exists; start it from its tile`);
          }
          const opts = {
            backend: typeof b.backend === "string" ? b.backend : "",
            profile: typeof b.profile === "string" && b.profile ? b.profile : undefined,
            name, branches: branchesOf(b.branches), live: liveOf(b.live), mode: b.mode === "direct" || b.direct === true ? ("direct" as const) : undefined, goMode: b.air === false ? ("image" as const) : undefined,
          };
          const v = ops.validateUp(opts);
          const job = runJob(
            "create",
            target,
            (r, j) => ops.up({ ...opts, owner: dashOwner(), onReserved: (inst) => (j.target = inst.name) }, r),
            v.backend,
          );
          return json({ ok: true, job: jobView(job), profile: v.profile }, 202);
        } catch (e) {
          return fail(e, e instanceof CosmosError && e.detail.busy ? 409 : 400);
        }
      }

      // branch list for a service's switcher; fetch=1 fetches origin first (at most once a minute)
      const rm = p.match(/^\/api\/sources\/([a-z0-9-]{1,40})\/refs$/);
      if (rm && req.method === "GET") {
        try {
          return json(await ops.sourceRefs(rm[1], { fetch: u.searchParams.get("fetch") === "1" }));
        } catch (e) {
          return fail(e);
        }
      }

      const m = p.match(/^\/api\/instances\/([a-z0-9][a-z0-9-]{0,40})\/(start|stop|remove|logs|sources|source|share|unshare)$/);
      if (m) {
        const [, name, action] = m;
        if (!readState().instances[name]) return json({ ok: false, error: `no instance ${name}` }, 404);
        if (action === "logs" && req.method === "GET") {
          if (crossSite(req)) return json({ ok: false, error: "cross-site request refused" }, 403);
          const svc = u.searchParams.get("svc") ?? ops.mainFe(ops.getInstance(name).services);
          const tail = Math.min(Math.max(Number(u.searchParams.get("tail") ?? 300) || 300, 0), 5000);
          return logStream(req, name, svc, tail);
        }
        if (action === "sources" && req.method === "GET") {
          try {
            return json(await ops.sources(name));
          } catch (e) {
            return fail(e);
          }
        }
        if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
        const busy = activeJobFor(name);
        if (busy) return json({ ok: false, error: `${name} is busy (${busy.kind} since ${busy.startedAt})`, job: jobView(busy) }, 409);
        // quick enough to answer inline (zrok prints its URL in a few seconds)
        if (action === "share" || action === "unshare") {
          const b = await body(req);
          const quiet: ops.Reporter = { log: () => {} };
          try {
            const out = action === "share"
              ? await ops.share(name, { public: typeof b.public === "boolean" ? b.public : undefined, exposeAdmin: typeof b.exposeAdmin === "boolean" ? b.exposeAdmin : undefined, fe: typeof b.fe === "string" ? b.fe : undefined }, quiet)
              : await ops.unshare(name, quiet);
            lastSeen = Date.now();
            await kick.fast();
            return json({ ok: true, ...out });
          } catch (e) {
            return fail(e, e instanceof CosmosError && e.detail.busy ? 409 : 400);
          }
        }
        const b = action === "remove" || action === "source" ? await body(req) : {};
        if (action === "remove" && b.confirm !== name) return json({ ok: false, error: `confirm must equal "${name}"` }, 400);
        if (action === "source" && (typeof b.svc !== "string" || (b.pinned !== true && (typeof b.ref !== "string" || !b.ref.trim())))) return json({ ok: false, error: "svc and ref (or pinned: true) are required" }, 400);
        if (action === "source" && b.live !== undefined && typeof b.live !== "boolean") return json({ ok: false, error: "live must be true or false" }, 400);
        const job =
          action === "start" ? runJob("start", name, (r) => ops.start(name, r, { owner: dashOwner() }))
          : action === "source" ? runJob("source", name, (r) => ops.switchSource(name, b.svc, b.pinned === true ? null : b.ref, r, undefined, { force: b.force === true, live: b.live === true }))
          : runJob(action === "stop" ? "stop" : "remove", name, (r) => ops.down([name], { remove: action === "remove", force: b.force === true }, r));
        return json({ ok: true, job: jobView(job) }, 202);
      }

      const jm = p.match(/^\/api\/jobs\/([0-9a-f]{8})(\/events)?$/);
      if (jm) {
        const job = jobs.get(jm[1]);
        if (!job) return json({ ok: false, error: "no such job" }, 404);
        if (jm[2] && crossSite(req)) return json({ ok: false, error: "cross-site request refused" }, 403);
        return jm[2] ? jobStream(req, job) : json({ ...jobView(job), lines: job.lines });
      }
      if (p === "/api/jobs") return json([...jobs.values()].reverse().map(jobView));

      return json({ ok: false, error: "not found" }, 404);
    },
  });
}
