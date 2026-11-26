// Image builds: one at a time (build lock), memory-checked before and watched during, measured after.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import { BUILD_LOCK_DIR, projectStateDir } from "./paths";
import { withLock } from "./lock";
import { imageExists, vmAvailableMiB, watchVm } from "./docker";
import { run } from "./sh";
import { dockerEnv } from "./runtime";
import type { BuildSpec } from "./stack";

// Docker VM available memory (MemAvailable) that cosmos never goes below.
export const VM_FLOOR_MIB = 1536;
// Headroom a build needs on top of the floor before it may start.
export const BUILD_HEADROOM_MIB = 1536;

export class MemoryError extends Error {
  constructor(message: string, public detail: Record<string, unknown>) {
    super(message);
  }
}

// ---------- measurements ----------

const measureFile = () => join(projectStateDir(), "measure.json");
export type Measure = {
  builds: Record<string, { key: string; ms: number; sizeMB: number | null; vmBeforeMiB: number; vmMinMiB: number; at: string }>;
  // peakMiB: docker stats right after a cold start (vite/pnpm peaks included); steadyMiB is the old name for the same reading
  profiles: Record<string, { peakMiB?: number; steadyMiB?: number; at: string; instance: string }>;
};

export function readMeasure(): Measure {
  try {
    return JSON.parse(readFileSync(measureFile(), "utf8"));
  } catch {
    return { builds: {}, profiles: {} };
  }
}

export function recordMeasure(fn: (m: Measure) => void) {
  mkdirSync(projectStateDir(), { recursive: true });
  const m = readMeasure();
  fn(m);
  const tmp = `${measureFile()}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(m, null, 2) + "\n");
  renameSync(tmp, measureFile());
}

export async function imageSizeMB(tag: string): Promise<number | null> {
  const r = await run(["docker", "image", "inspect", "-f", "{{.Size}}", tag], { quiet: true });
  const n = Number(r.stdout.trim());
  return r.code === 0 && Number.isFinite(n) ? Math.round(n / 1e6) : null;
}

type Rep = { log: (m: string) => void; output?: (chunk: string, stream: "stdout" | "stderr") => void; inherit?: boolean };

// Builds spec.tag unless it exists. Refuses below floor+headroom; aborts the build if the VM drops under the floor.
export async function ensureImage(spec: BuildSpec, r: Rep, force = false): Promise<{ built: boolean; ms?: number }> {
  if (!force && (await imageExists(spec.tag))) return { built: false };
  const lockOpts = { staleMs: Infinity, waitMs: 90 * 60_000, onWait: () => r.log(`waiting for another cosmos build (${BUILD_LOCK_DIR})`) };
  return withLock(BUILD_LOCK_DIR, lockOpts, async () => {
    if (!force && (await imageExists(spec.tag))) {
      r.log(`${spec.tag} was built by another cosmos run`);
      return { built: false };
    }
    const probe = await vmAvailableMiB();
    if ("error" in probe) throw new MemoryError(`not building ${spec.tag}: cannot measure docker VM memory: ${probe.error}`, { vmProbeError: probe.error });
    const need = VM_FLOOR_MIB + BUILD_HEADROOM_MIB;
    if (probe.mib < need) {
      throw new MemoryError(`not building ${spec.tag}: the docker VM has ${probe.mib} MiB available, a build needs ${need} (floor ${VM_FLOOR_MIB} + headroom ${BUILD_HEADROOM_MIB})`, { vmAvailableMiB: probe.mib, needMiB: need });
    }
    r.log(`building ${spec.tag} (${spec.about}); VM available ${probe.mib} MiB`);
    const args = ["docker", "build", "--progress=plain", "-t", spec.tag, "--label", `cosmos.image=${spec.key}`, "-f", spec.dockerfile];
    for (const [k, v] of Object.entries(spec.args)) args.push("--build-arg", `${k}=${v}`);
    if (spec.target) args.push("--target", spec.target);
    args.push(spec.context);
    const t0 = Date.now();
    let breach: number | null = null;
    let vmMin = probe.mib;
    const proc = Bun.spawn(args, { stdout: r.inherit ? "inherit" : "pipe", stderr: r.inherit ? "inherit" : "pipe", env: dockerEnv() });
    const stop = watchVm((mib) => {
      vmMin = Math.min(vmMin, mib);
      if (mib < VM_FLOOR_MIB && breach === null) {
        breach = mib;
        r.log(`VM available ${mib} MiB < floor ${VM_FLOOR_MIB}; cancelling build of ${spec.tag}`);
        proc.kill("SIGINT");
      }
    });
    let tail = "";
    const pump = async (s: ReadableStream<Uint8Array> | null | number | undefined, stream: "stdout" | "stderr") => {
      if (!s || typeof s === "number") return;
      const dec = new TextDecoder();
      for await (const b of s) {
        const t = dec.decode(b, { stream: true });
        tail = (tail + t).slice(-4000);
        r.output?.(t, stream);
      }
    };
    await Promise.all([pump(proc.stdout as any, "stdout"), pump(proc.stderr as any, "stderr")]);
    const code = await proc.exited;
    stop();
    const ms = Date.now() - t0;
    if (breach !== null) throw new MemoryError(`build of ${spec.tag} cancelled: VM available fell to ${breach} MiB (floor ${VM_FLOOR_MIB})`, { vmAvailableMiB: breach });
    if (code !== 0) throw new Error(`docker build ${spec.tag} failed (${code}) after ${Math.round(ms / 1000)}s:\n${tail.trim().split("\n").slice(-25).join("\n")}`);
    const sizeMB = await imageSizeMB(spec.tag);
    recordMeasure((m) => void (m.builds[spec.tag] = { key: spec.key, ms, sizeMB, vmBeforeMiB: probe.mib, vmMinMiB: vmMin, at: new Date().toISOString() }));
    r.log(`built ${spec.tag} in ${Math.round(ms / 1000)}s (${sizeMB ?? "?"} MB; VM low ${vmMin} MiB)`);
    return { built: true, ms };
  });
}

export async function tagImage(from: string, to: string) {
  await run(["docker", "tag", from, to], { check: true });
}

export async function untagImages(tags: string[]) {
  const own = tags.filter((t) => t.startsWith("cosmos-") && t.endsWith(":local"));
  for (const t of own) await run(["docker", "image", "rm", "--no-prune", t], { quiet: true });
}

