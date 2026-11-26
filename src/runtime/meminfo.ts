// Reading the engine VM's /proc/meminfo: through a throwaway container (any runtime), or a provider's own route.
import type { VmMem } from "../docker";
import { run } from "../sh";

export const PROBE_IMAGE = "alpine:3.20";
const PROBE_TIMEOUT_MS = 20_000;

export function parseMeminfo(text: string): VmMem | { error: string } {
  const kb = (k: string) => Number(text.match(new RegExp(`^${k}:\\s+(\\d+) kB`, "m"))?.[1]);
  const [total, free, avail] = [kb("MemTotal"), kb("MemFree"), kb("MemAvailable")];
  if (![total, free, avail].every(Number.isFinite)) return { error: "could not parse /proc/meminfo" };
  return { totalMiB: Math.round(total / 1024), freeMiB: Math.round(free / 1024), availableMiB: Math.round(avail / 1024), usedMiB: Math.round((total - avail) / 1024) };
}

// /proc/meminfo is not namespaced, so a container sees the VM's. Fails closed with the reason.
export async function containerMeminfo(): Promise<VmMem | { error: string }> {
  const name = `cosmos-vmprobe-${process.pid}-${crypto.randomUUID().slice(0, 6)}`;
  const r = await run(
    ["docker", "run", "--rm", "--name", name, "--label", "cosmos.probe=1", "--network", "none", "--log-driver", "none", PROBE_IMAGE, "cat", "/proc/meminfo"],
    { quiet: true, timeoutMs: PROBE_TIMEOUT_MS },
  ).catch((e: Error) => ({ code: -1, stdout: "", stderr: e.message }));
  if (r.code !== 0) {
    // a hung or killed probe can leave its container behind; clear it and any older leftovers
    await run(["docker", "rm", "-f", name], { quiet: true, timeoutMs: 10_000 }).catch(() => {});
    const left = await run(["docker", "ps", "-aq", "--filter", "label=cosmos.probe=1", "--filter", "status=exited", "--filter", "status=created"], { quiet: true, timeoutMs: 10_000 }).catch(() => null);
    const ids = left?.stdout.split("\n").filter(Boolean) ?? [];
    if (ids.length) await run(["docker", "rm", "-f", ...ids], { quiet: true, timeoutMs: 10_000 }).catch(() => {});
    return { error: r.code === 124 ? `docker run ${PROBE_IMAGE} timed out after ${PROBE_TIMEOUT_MS / 1000}s (docker daemon not answering?)` : `docker run ${PROBE_IMAGE} cat /proc/meminfo failed (${r.code}): ${r.stderr.trim().slice(-300) || "no output"}` };
  }
  return parseMeminfo(r.stdout);
}
