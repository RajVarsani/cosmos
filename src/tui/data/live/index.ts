import * as ops from "../../../ops";
import { svcDef, manifest } from "../../../catalog";
import { readState, type Instance } from "../../../state";
import { cosmosContainers, containerStats, type CosmosContainer, type MemStat } from "../../../docker";
import { probe, serviceHealthy, instanceState, type Probe } from "../../../status";
import { streamLogs } from "./logs";
import type { Action, Row, Snapshot, Source, SvcRow } from "../types";

// dashboard cadence: containers, shares and probes every 2s, memory every 5s
const FAST_MS = 2000;
const STATS_MS = 5000;
const quiet: ops.Reporter = { log: () => {}, inherit: false };

export function liveSource(): Source {
  const subs = new Set<(s: Snapshot) => void>();
  let containers: CosmosContainer[] = [];
  let stats: Record<string, MemStat> = {};
  let http: Record<string, Probe | null> = {};
  let shares: Record<string, ops.ShareView | null> = {};
  let error: string | null = null;
  let last: Snapshot | null = null;

  const project = (() => { try { return manifest().projectId; } catch { return ""; } })();

  function svcRows(i: Instance): SvcRow[] {
    const urls = ops.serviceUrls(i);
    return i.services.map((svc) => {
      const c = containers.find((x) => x.instance === i.name && x.service === svc);
      const h = http[`${i.name}/${svc}`];
      const kind = (() => { try { return svcDef(svc).kind as string; } catch { return "app"; } })();
      const healthy = serviceHealthy(kind, c, h);
      return { service: svc, kind, port: i.ports[svc] ?? null, url: urls[svc] ?? null, status: c?.status ?? "absent", running: !!c?.running, healthy, memMiB: c ? stats[c.name]?.usedMiB ?? null : null };
    });
  }

  function build(): Snapshot {
    const insts = Object.values(readState().instances).sort((a, b) => a.slot - b.slot);
    const rows: Row[] = insts.map((i) => {
      const services = svcRows(i);
      const long = services.filter((s) => s.kind !== "init");
      const up = long.filter((s) => s.running).length;
      const main = ops.mainFe(i.services);
      const fe = containers.find((x) => x.instance === i.name && x.service === main);
      const sv = shares[i.name];
      return {
        name: i.name, label: i.label ?? i.name, slot: i.slot, profile: ops.profileOf(i), backend: i.backend, mode: ops.modeOf(i),
        state: instanceState(fe, http[`${i.name}/${main}`], up, long.length), up, of: long.length,
        memMiB: services.reduce((n, s) => n + (s.memMiB ?? 0), 0) || null,
        mainService: main, url: ops.serviceUrl(i), services, warnings: i.warnings ?? [],
        share: i.share ? { url: i.share.url, fe: i.share.fe, public: i.share.public, user: i.share.public ? null : i.share.user, state: sv?.state ?? (i.share.unavailable ? "unavailable" : "starting"), reason: sv?.reason ?? i.share.unavailable ?? null } : null,
      };
    });
    return { project, rows, at: Date.now(), error };
  }

  function publish() {
    try {
      last = build();
    } catch (e) {
      last = { project, rows: last?.rows ?? [], at: Date.now(), error: (e as Error).message };
    }
    for (const s of subs) s(last);
  }

  async function fast() {
    try {
      containers = await cosmosContainers();
      error = null;
    } catch (e) {
      error = (e as Error).message;
    }
    const insts = Object.values(readState().instances);
    const nextShares: typeof shares = {};
    const nextHttp: typeof http = {};
    await Promise.all([
      ...insts.filter((i) => i.share).map(async (i) => {
        const fe = containers.find((x) => x.instance === i.name && x.service === i.share!.fe);
        nextShares[i.name] = await ops.shareView(i, !!fe?.running).catch(() => null);
      }),
      ...insts.flatMap((i) => Object.entries(i.ports).map(async ([svc, port]) => {
        const c = containers.find((x) => x.instance === i.name && x.service === svc);
        nextHttp[`${i.name}/${svc}`] = await probe(svc, port, !!c?.running);
      })),
    ]);
    shares = nextShares;
    http = nextHttp;
  }

  async function slow() {
    stats = await containerStats(containers.filter((c) => c.running).map((c) => c.name)).catch(() => stats);
  }

  function loop(fn: () => Promise<void>, ms: number) {
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        await fn();
      } catch (e) {
        error = (e as Error).message;
      } finally {
        busy = false;
      }
      publish();
    };
    const t = setInterval(tick, ms);
    return { tick, stop: () => clearInterval(t) };
  }

  const fastLoop = loop(fast, FAST_MS);
  const slowLoop = loop(slow, STATS_MS);
  void fastLoop.tick().then(() => slowLoop.tick());

  return {
    subscribe(cb) {
      subs.add(cb);
      if (last) cb(last);
      return () => void subs.delete(cb);
    },
    async act(action: Action, name: string) {
      try {
        if (action === "share") {
          const out = await ops.share(name, {}, quiet);
          return out.warnings.length ? `${name} shared, with warnings: ${out.warnings.join(" · ")}` : `${name} shared`;
        }
        if (action === "unshare") return (await ops.unshare(name, quiet), `${name} unshared`);
        const r = await ops.down([name], { remove: false }, quiet);
        return r.warnings.length ? `${name} stopped, with warnings: ${r.warnings.join(" · ")}` : `${name} stopped`;
      } finally {
        await fastLoop.tick();
      }
    },
    logs: streamLogs,
    close() {
      fastLoop.stop();
      slowLoop.stop();
      subs.clear();
    },
  };
}
