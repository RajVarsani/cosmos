import { SERVICES } from "./catalog";
import { containerProcs } from "./docker";
import { CosmosError } from "./errors";
import { containerName } from "./generate";
import type { Instance } from "./state";

export async function waitHttp(u: string, timeoutMs: number, okStatus = (s: number) => s >= 200 && s < 400): Promise<number> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(30_000), redirect: "manual" });
      await r.arrayBuffer().catch(() => {});
      if (okStatus(r.status)) return Date.now() - t0;
    } catch {}
    await Bun.sleep(1000);
  }
  throw new CosmosError(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${u}`);
}

// Portless processes that must be alive for a service to work (manifest services[].workers).
export const WORKERS = (): Record<string, { name: string; match: RegExp }[]> =>
  Object.fromEntries(SERVICES().filter((d) => d.workers?.length).map((d) => [d.svc, d.workers!]));

export async function workers(i: Instance): Promise<Record<string, { name: string; alive: boolean; count: number }[] | null>> {
  const out: Record<string, { name: string; alive: boolean; count: number }[] | null> = {};
  for (const [svc, defs] of Object.entries(WORKERS())) {
    if (!i.services.includes(svc)) continue;
    const procs = await containerProcs(containerName(i.name, svc));
    out[svc] = procs === null ? null : defs.map((d) => {
      const count = procs.filter((p) => d.match.test(p)).length;
      return { name: d.name, alive: count > 0, count };
    });
  }
  return out;
}
