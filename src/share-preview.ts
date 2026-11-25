// Preview builds for a share: watch the FE source, run the one-shot build container, publish releases/<ms> behind `current`.
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, watch, type FSWatcher } from "fs";
import { basename, join } from "path";
import { run } from "./sh";
import { vmAvailableMiB } from "./docker";
import { VM_FLOOR_MIB } from "./images";
import type { ProxyConfig, ShareStatus } from "./share-proxy";

export type PreviewConfig = NonNullable<ProxyConfig["preview"]>;
export type PreviewStatus = NonNullable<ShareStatus["preview"]>;

const DEBOUNCE_MS = 1500;
const MEMORY_RECHECK_MS = 30_000;
const KEEP = 2;

const tail = (text: string, lines: number, chars: number) => text.split("\n").map((l) => l.trim()).filter(Boolean).slice(-lines).join("\n").slice(-chars) || null;

export const releasesDir = (p: PreviewConfig) => join(p.dir, "releases");

// realpath of the release `current` points at, or null before the first build
export function currentRelease(p: PreviewConfig): string | null {
  try {
    return realpathSync(join(p.dir, "current"));
  } catch {
    return null;
  }
}

const releaseList = (p: PreviewConfig) => {
  try {
    return readdirSync(releasesDir(p)).filter((n) => /^\d+$/.test(n)).sort((a, b) => Number(b) - Number(a));
  } catch {
    return [];
  }
};

// realpaths of the other kept releases, newest first (old lazy chunks stay loadable after a swap)
export function previousReleases(p: PreviewConfig, current: string): string[] {
  const out: string[] = [];
  for (const n of releaseList(p)) {
    try {
      const r = realpathSync(join(releasesDir(p), n));
      if (r !== current) out.push(r);
    } catch {}
  }
  return out;
}

const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

const ignored = (rel: string, ignore: string[]) => rel.split(/[\\/]/).some((s) => ignore.includes(s));

function newerThan(dir: string, ignore: string[], ms: number): boolean {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (ignore.includes(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (newerThan(full, ignore, ms)) return true;
    } else if (e.isFile()) {
      try {
        if (statSync(full).mtimeMs > ms) return true;
      } catch {}
    }
  }
  return false;
}

export type Preview = { status: () => PreviewStatus; stop: () => Promise<void> };

// onRemoved gets the realpaths of pruned releases so the proxy can drop their cached bodies
export function startPreview(p: PreviewConfig, logFile: string, onChange: () => void, onRemoved: (dirs: string[]) => void): Preview {
  const cur = currentRelease(p);
  const builtMs = cur ? Number(basename(cur)) || statSync(cur).mtimeMs : null;
  const st: PreviewStatus = { state: cur ? "ready" : "idle", builds: 0, lastMs: null, builtAt: builtMs ? new Date(builtMs).toISOString() : null, lastError: null, pending: false };
  let building: ReturnType<typeof Bun.spawn> | null = null;
  let debounce: Timer | null = null;
  let memWait: Timer | null = null;
  let watcher: FSWatcher | null = null;
  let checking = false;
  let stopping = false;

  const set = (patch: Partial<PreviewStatus>) => {
    Object.assign(st, patch);
    onChange();
  };

  const request = () => {
    if (stopping) return;
    if (building) return set({ pending: true });
    if (checking || memWait) return;
    void attempt();
  };

  const attempt = async () => {
    memWait = null;
    if (stopping || building) return;
    checking = true;
    const m = await vmAvailableMiB().catch((e: Error) => ({ error: e.message }));
    checking = false;
    if (stopping) return;
    const need = p.needMiB + VM_FLOOR_MIB;
    if ("error" in m || m.mib < need) {
      const why = "error" in m ? `docker VM memory unknown: ${m.error}` : `docker VM has ${m.mib} MiB available, a preview build needs ${need} (${p.needMiB} + floor ${VM_FLOOR_MIB})`;
      set({ state: "waiting-memory", lastError: why });
      memWait = setTimeout(attempt, MEMORY_RECHECK_MS);
      return;
    }
    await build();
  };

  const build = async () => {
    const out = join(p.dir, "build");
    mkdirSync(out, { recursive: true });
    // empty the bind-mounted dir in place so a stale index.html never passes for a fresh build
    for (const n of readdirSync(out)) rmSync(join(out, n), { recursive: true, force: true });
    const fd = openSync(logFile, "w", 0o600);
    const started = Date.now();
    const proc = Bun.spawn(["docker", "start", "-a", p.container], { stdin: "ignore", stdout: fd, stderr: fd });
    closeSync(fd);
    building = proc;
    set({ state: "building", pending: false });
    const code = await proc.exited;
    building = null;
    if (stopping) return;
    if (code === 0 && existsSync(join(out, "index.html"))) {
      try {
        publish(out, started);
      } catch (e) {
        set({ state: "failed", lastError: `publishing the build failed: ${(e as Error).message}`.slice(0, 600) });
      }
    } else {
      const log = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
      const why = code === 0 ? "build exited 0 but build/index.html is missing" : tail(log, 5, 600) ?? `build exited ${code}`;
      set({ state: "failed", lastError: why });
    }
    if (st.pending && !stopping) {
      set({ pending: false });
      request();
    }
  };

  const publish = (out: string, started: number) => {
    const rel = releasesDir(p);
    mkdirSync(rel, { recursive: true });
    // named by build start, so a restart rebuilds when sources changed while this build ran
    const ms = started;
    cpSync(out, join(rel, String(ms)), { recursive: true });
    const tmp = join(p.dir, "current.tmp");
    rmSync(tmp, { force: true });
    symlinkSync(join("releases", String(ms)), tmp);
    renameSync(tmp, join(p.dir, "current"));
    const real = realpathSync(rel);
    const removed = releaseList(p).slice(KEEP).map((n) => join(real, n));
    for (const d of removed) rmSync(d, { recursive: true, force: true });
    if (removed.length) onRemoved(removed);
    set({ state: "ready", builds: st.builds + 1, lastMs: Date.now() - started, builtAt: new Date().toISOString(), lastError: null });
  };

  if (existsSync(p.srcDir)) {
    try {
      watcher = watch(p.srcDir, { recursive: true }, (_ev, file) => {
        if (stopping || (file && ignored(String(file), p.ignore))) return;
        // edits report the file itself; a bare directory event is metadata (Docker Desktop touches bind sources on each build start)
        if (file && isDir(join(p.srcDir, String(file)))) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          debounce = null;
          request();
        }, DEBOUNCE_MS);
      });
    } catch (e) {
      set({ lastError: `cannot watch ${p.srcDir}: ${(e as Error).message}` });
    }
  } else set({ lastError: `source dir ${p.srcDir} does not exist` });

  if (!cur || newerThan(p.srcDir, p.ignore, builtMs ?? 0)) request();

  return {
    status: () => ({ ...st }),
    async stop() {
      stopping = true;
      watcher?.close();
      if (debounce) clearTimeout(debounce);
      if (memWait) clearTimeout(memWait);
      const proc = building;
      if (proc) {
        await run(["docker", "stop", "-t", "5", p.container], { quiet: true, timeoutMs: 30_000 }).catch(() => {});
        await Promise.race([proc.exited, Bun.sleep(10_000)]);
        if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
      }
    },
  };
}
