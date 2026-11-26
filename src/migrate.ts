// One-time move from the 0.1 layout (one HOME/.state/state.json for the machine, HOME/{instances,envs,vendor}) to
// HOME/projects/<projectId>. Runs on the first command of a project, under the registry lock. Lossless and idempotent:
// - takes the 0.1 instances whose services all belong to this project; others stay in the old file (and stay reserved)
// - renames their dirs (bind mounts of running containers follow a rename) and leaves a symlink at each old path, so a
//   container docker restarts before its next cosmos up still finds its mounts
// - rewrites absolute paths in the records, compose overrides and share configs; repairs moved git worktrees
// - keeps the old state file as state.json.migrated once nothing is left in it
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync, copyFileSync, readlinkSync } from "fs";
import { dirname, join } from "path";
import { withLock } from "./lock";
import { EDGE_SVC, manifest } from "./catalog";
import { LEGACY, REGISTRY_LOCK_DIR, envsDir, instancesDir, projectHome, projectStateDir, stateFile, vendorRoot } from "./paths";
import { mutateState, type Instance } from "./state";
import { GIT_ENV, run } from "./sh";

const LOCK_OPTS = { staleMs: 10 * 60_000, waitMs: 120_000 };

const isRealDir = (p: string) => {
  try {
    return lstatSync(p).isDirectory();
  } catch {
    return false;
  }
};
const isLink = (p: string) => {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

type Plan = { take: Instance[]; keep: Record<string, Instance>; legacy: { instances: Record<string, Instance>; pendingRelease?: string[] } | null; dirs: [string, string][] };

// services a 0.1 record may list and still be this project's
function ownServices(): Set<string> {
  const m = manifest();
  return new Set([...m.services.map((s) => s.svc), ...m.retiredServices, EDGE_SVC]);
}

function readLegacy(): Plan["legacy"] {
  if (!existsSync(LEGACY.stateFile)) return null;
  const l = JSON.parse(readFileSync(LEGACY.stateFile, "utf8"));
  return { instances: l.instances ?? {}, pendingRelease: l.pendingRelease };
}

export function plan(): Plan {
  const m = manifest();
  const legacy = readLegacy();
  const own = ownServices();
  const take: Instance[] = [];
  const keep: Record<string, Instance> = {};
  for (const [k, i] of Object.entries(legacy?.instances ?? {})) (i.services?.every((s) => own.has(s)) ? take.push(i) : (keep[k] = i));
  const dirs: [string, string][] = [];
  for (const i of take) dirs.push([join(LEGACY.instances, i.name), join(instancesDir(), i.name)]);
  const bundles = new Set([...Object.keys(m.envSources), ...(m.composeEnvFiles ? [m.composeEnvFiles.bundle] : [])]);
  for (const b of bundles) dirs.push([join(LEGACY.envs, b), join(envsDir(), b)]);
  for (const v of [m.projectId, ...m.extras.map((x) => x.id)]) dirs.push([join(LEGACY.vendor, v), join(vendorRoot(), v)]);
  return { take, keep, legacy, dirs: dirs.filter(([from]) => isRealDir(from)) };
}

export const migrationPending = (): boolean => {
  const p = plan();
  return p.take.length > 0 || p.dirs.length > 0 || (!!p.legacy && !Object.keys(p.keep).length);
};

// old absolute prefix -> new one, applied to strings in records and to generated files
function rewriter(pairs: [string, string][]): { str: (s: string) => string; deep: <T>(v: T) => T } {
  const sorted = [...pairs].sort((a, b) => b[0].length - a[0].length);
  const str = (s: string) => {
    for (const [from, to] of sorted) if (s === from || s.startsWith(from + "/")) return to + s.slice(from.length);
    return s;
  };
  const text = (t: string) => sorted.reduce((acc, [from, to]) => acc.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=[/\"'\\s:,]|$)", "gm"), to), t);
  const deep = <T>(v: T): T => (typeof v === "string" ? (str(v) as T) : Array.isArray(v) ? (v.map(deep) as T) : v && typeof v === "object" ? (Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)])) as T) : v);
  return { str: (s) => text(s), deep };
}

function moveDir(from: string, to: string, log: (m: string) => void): boolean {
  if (existsSync(to)) {
    log(`warning: ${from} not moved: ${to} already exists; both are kept`);
    return false;
  }
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
  symlinkSync(to, from);
  log(`moved ${from} -> ${to}`);
  return true;
}

function rewriteFile(file: string, rw: (t: string) => string): void {
  if (!existsSync(file)) return;
  const t = readFileSync(file, "utf8");
  const n = rw(t);
  if (n !== t) writeFileSync(file, n);
}

// git dirs below a moved dir whose worktree link points back at the old path
function linkedWorktrees(dir: string, depth = 3): string[] {
  if (!isRealDir(dir)) return [];
  const g = join(dir, ".git");
  if (existsSync(g) && !lstatSync(g).isDirectory()) return [dir];
  if (!depth || existsSync(g)) return [];
  return readdirSync(dir).flatMap((d) => linkedWorktrees(join(dir, d), depth - 1));
}

export async function migrateLegacy(log: (m: string) => void = () => {}): Promise<{ moved: string[]; kept: string[] } | null> {
  if (!migrationPending()) return null;
  return withLock(REGISTRY_LOCK_DIR, LOCK_OPTS, async () => {
    const p = plan();
    if (!(p.take.length || p.dirs.length || p.legacy)) return null;
    log(`migrating the cosmos 0.1 layout in ${dirname(LEGACY.stateFile)} to ${projectHome()}`);
    const pairs: [string, string][] = [...p.dirs, ...p.take.map((i) => [join(LEGACY.instances, i.name), join(instancesDir(), i.name)] as [string, string])];
    for (const i of p.take) pairs.push([join(LEGACY.shares, i.name), join(projectStateDir(), "shares", i.name)]);
    for (const i of p.take) for (const ext of ["json", "status.json", "proxy.log", "zrok.log", "preview.log"]) pairs.push([join(LEGACY.shares, `${i.name}.${ext}`), join(projectStateDir(), "shares", `${i.name}.${ext}`)]);
    const rw = rewriter(pairs);

    const moved: string[] = [];
    for (const [from, to] of p.dirs) if (moveDir(from, to, log)) moved.push(to);
    for (const to of moved) {
      for (const wt of linkedWorktrees(to)) {
        const r = await run(["git", "-C", wt, "worktree", "repair"], { quiet: true, env: GIT_ENV });
        if (r.code !== 0) log(`warning: git worktree repair in ${wt}: ${r.stderr.trim()}`);
      }
    }
    // generated files carry absolute paths
    for (const i of p.take) {
      const dir = join(instancesDir(), i.name);
      if (isRealDir(dir)) for (const f of readdirSync(dir)) if (/\.(ya?ml|json|env)$|Caddyfile/.test(f)) rewriteFile(join(dir, f), rw.str);
    }
    // shares: config (0600, holds the password) and logs; a share whose proxy still runs keeps writing the old path
    const sharesTo = join(projectStateDir(), "shares");
    for (const i of p.take) {
      const files = existsSync(LEGACY.shares) ? readdirSync(LEGACY.shares).filter((f) => f === i.name || f.startsWith(`${i.name}.`)) : [];
      if (!files.length) continue;
      mkdirSync(sharesTo, { recursive: true, mode: 0o700 });
      for (const f of files) {
        const from = join(LEGACY.shares, f);
        if (isLink(from) || existsSync(join(sharesTo, f))) continue;
        renameSync(from, join(sharesTo, f));
      }
      rewriteFile(join(sharesTo, `${i.name}.json`), rw.str);
      if (i.share?.proxyPid) log(`note: ${i.name} has a share; if it misbehaves, cosmos unshare ${i.name} && cosmos share ${i.name}`);
    }
    if (existsSync(LEGACY.failures)) {
      for (const f of readdirSync(LEGACY.failures).filter((f) => p.take.some((i) => f.startsWith(`${i.name}-`)))) {
        mkdirSync(join(projectStateDir(), "failures"), { recursive: true });
        renameSync(join(LEGACY.failures, f), join(projectStateDir(), "failures", f));
      }
    }
    const measure = join(projectStateDir(), "measure.json");
    if (existsSync(LEGACY.measure) && !existsSync(measure)) {
      mkdirSync(projectStateDir(), { recursive: true });
      copyFileSync(LEGACY.measure, measure);
    }

    // records: an instance already in the project state wins (a crash after this write and before the next is replayed)
    const kept = Object.keys(p.keep);
    await mutateState((s) => {
      for (const i of p.take) if (!s.instances[i.name]) s.instances[i.name] = rw.deep(i);
      if (p.legacy?.pendingRelease?.length) s.pendingRelease = [...new Set([...(s.pendingRelease ?? []), ...p.legacy.pendingRelease])];
    });
    if (p.legacy) {
      if (kept.length) {
        const tmp = `${LEGACY.stateFile}.${process.pid}.tmp`;
        writeFileSync(tmp, JSON.stringify({ version: 1, instances: p.keep }, null, 2) + "\n");
        renameSync(tmp, LEGACY.stateFile);
        log(`left ${kept.join(", ")} in ${LEGACY.stateFile}: their services are not in this project; run cosmos in their project to move them`);
      } else {
        renameSync(LEGACY.stateFile, `${LEGACY.stateFile}.migrated`);
      }
    }
    log(`migrated ${p.take.length} instance(s)${p.take.length ? ` (${p.take.map((i) => i.name).join(", ")})` : ""} to ${stateFile()}`);
    return { moved: p.take.map((i) => i.name), kept };
  });
}

// rm of a migrated instance also drops the symlink left at its 0.1 path
export function dropLegacyLink(name: string): void {
  const old = join(LEGACY.instances, name);
  try {
    if (isLink(old) && readlinkSync(old) === join(instancesDir(), name)) rmSync(old);
  } catch {}
}
