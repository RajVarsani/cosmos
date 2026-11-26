import { composeFile } from "./catalog";
import { overridePath, projectName } from "./generate";
import { runtime } from "./runtime";
import { run, type RunOpts } from "./sh";

export const composeArgs = (name: string) => ["docker", "compose", "-p", projectName(name), "-f", composeFile(), "-f", overridePath(name)];

export async function compose(name: string, args: string[], opts: Pick<RunOpts, "inherit" | "check" | "onOutput"> = {}) {
  return run([...composeArgs(name), ...args], opts);
}

export async function imageExists(image: string): Promise<boolean> {
  return (await run(["docker", "image", "inspect", image], { quiet: true })).code === 0;
}

export type CState = { status: string; running: boolean } | null;

export async function containerState(container: string): Promise<CState> {
  const r = await run(["docker", "inspect", "-f", "{{.State.Status}}", container], { quiet: true });
  if (r.code !== 0) return null;
  const status = r.stdout.trim();
  return { status, running: status === "running" };
}

export async function volumeExists(volume: string): Promise<boolean> {
  return (await run(["docker", "volume", "inspect", volume], { quiet: true })).code === 0;
}

export async function removeVolumes(volumes: string[]): Promise<void> {
  if (volumes.length) await run(["docker", "volume", "rm", ...volumes], { quiet: true });
}

export async function instanceVolumes(name: string): Promise<string[]> {
  const r = await run(["docker", "volume", "ls", "-q", "--filter", `label=cosmos.instance=${name}`], { quiet: true });
  return r.code === 0 ? r.stdout.split("\n").filter(Boolean) : [];
}

// Docker VM "available" memory (MemAvailable) in MiB; fails closed with the reason when it cannot be measured.
export async function vmAvailableMiB(): Promise<{ mib: number } | { error: string }> {
  const m = await vmMemory();
  return "error" in m ? m : { mib: m.availableMiB };
}

export type CosmosContainer = {
  name: string;
  instance: string;
  service: string;
  status: string;
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number;
  restarts: number;
  oomKilled: boolean;
  health: string | null;
};

// Only objects carrying the cosmos.instance label; never anything else on the daemon.
export async function cosmosContainers(): Promise<CosmosContainer[]> {
  const ids = await run(["docker", "ps", "-aq", "--filter", "label=cosmos.instance"], { quiet: true });
  const list = ids.code === 0 ? ids.stdout.split("\n").filter(Boolean) : [];
  if (!list.length) return [];
  const r = await run(["docker", "inspect", ...list], { quiet: true });
  if (!r.stdout.trim()) return [];
  const docs = JSON.parse(r.stdout) as any[];
  return docs
    .filter((d) => d.Name?.startsWith("/cosmos-") && d.Config?.Labels?.["cosmos.instance"])
    .map((d) => ({
      name: d.Name.slice(1),
      instance: d.Config.Labels["cosmos.instance"],
      service: d.Config.Labels["cosmos.service"] ?? "?",
      status: d.State.Status,
      running: !!d.State.Running,
      startedAt: d.State.StartedAt?.startsWith("0001") ? null : d.State.StartedAt,
      finishedAt: d.State.FinishedAt?.startsWith("0001") ? null : d.State.FinishedAt,
      exitCode: d.State.ExitCode ?? 0,
      restarts: d.RestartCount ?? 0,
      oomKilled: !!d.State.OOMKilled,
      health: d.State.Health?.Status ?? null,
    }));
}

export type MemStat = { usedMiB: number; limitMiB: number; cpuPct: number };

const toMiB = (s: string) => {
  const m = s.trim().match(/^([\d.]+)\s*([KMGT]?i?B)$/i);
  if (!m) return NaN;
  const k = { B: 1 / 1048576, KIB: 1 / 1024, KB: 1 / 1024, MIB: 1, MB: 1, GIB: 1024, GB: 1024, TIB: 1048576, TB: 1048576 }[m[2].toUpperCase()] ?? NaN;
  return Number(m[1]) * k;
};

// One call per container: a single missing name makes `docker stats` fail for all of them.
export async function containerStats(names: string[]): Promise<Record<string, MemStat>> {
  const own = names.filter((n) => n.startsWith("cosmos-"));
  const rows = await Promise.all(
    own.map(async (n) => {
      const r = await run(["docker", "stats", "--no-stream", "--format", "{{json .}}", n], { quiet: true });
      if (r.code !== 0) return null;
      try {
        const d = JSON.parse(r.stdout.trim().split("\n")[0]);
        const [used, limit] = String(d.MemUsage).split("/");
        return [d.Name, { usedMiB: toMiB(used), limitMiB: toMiB(limit), cpuPct: parseFloat(d.CPUPerc) }] as const;
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(rows.filter((x) => x !== null));
}

export type VmMem = { totalMiB: number; usedMiB: number; freeMiB: number; availableMiB: number };

let vmCache: { at: number; v: VmMem } | null = null;

// Memory of the Linux VM the engine runs in, read the active runtime's way. Cached for 3s; fails closed with the reason.
export async function vmMemory(): Promise<VmMem | { error: string }> {
  if (vmCache && Date.now() - vmCache.at < 3000) return vmCache.v;
  const v = await runtime().vmMemory();
  if (!("error" in v)) vmCache = { at: Date.now(), v };
  return v;
}

export { PROBE_IMAGE } from "./runtime/meminfo";

// Polls VM available memory until stopped; each reading goes to onReading.
export function watchVm(onReading: (availableMiB: number) => void, everyMs = 4000): () => void {
  let live = true;
  (async () => {
    while (live) {
      const m = await vmMemory();
      if (!live) break;
      if (!("error" in m)) onReading(m.availableMiB);
      await Bun.sleep(everyMs);
    }
  })();
  return () => void (live = false);
}

// Sum of docker stats memory for an instance's running containers, MiB.
export async function instanceMemMiB(instance: string): Promise<{ total: number; byService: Record<string, number> }> {
  const cs = (await cosmosContainers()).filter((c) => c.instance === instance && c.running);
  const st = await containerStats(cs.map((c) => c.name));
  const byService: Record<string, number> = {};
  for (const c of cs) if (st[c.name]) byService[c.service] = Math.round(st[c.name].usedMiB);
  return { total: Object.values(byService).reduce((a, b) => a + b, 0), byService };
}

// Processes inside a container (docker top), for services whose workers have no port.
export async function containerProcs(container: string): Promise<string[] | null> {
  // docker top needs a PID column in custom ps output
  const r = await run(["docker", "top", container, "-eo", "pid,args"], { quiet: true });
  if (r.code !== 0) return null;
  return r.stdout.split("\n").slice(1).map((l) => l.trim().replace(/^\d+\s+/, "")).filter(Boolean);
}
