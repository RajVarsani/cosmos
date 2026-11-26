import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { migrationPending } from "./migrate";
import { join } from "path";
import { BASE_PORT, MAX_SLOT, SLOT_STRIDE } from "./offsets";
import { HOME, REGISTRY_FILE, REGISTRY_LOCK_DIR, STATE_DIR, projectDir, projectHomeOf, projectId } from "./paths";
import { readRegistry, reapable, writeRegistry } from "./registry";
import { withLock } from "./lock";
import { STATE_VERSION, withState } from "./state";
import { envSources, submoduleCount } from "./project";
import { estimateMiB, loadProfiles, manifest, vendorDir } from "./catalog";
import { VM_FLOOR_MIB } from "./images";
import { readState } from "./state";
import { dashboardPort, isDashboardCommand, PID_FILE } from "./dashboard/control";
import { GIT_ENV, run } from "./sh";
import { zrokInfo } from "./share";
import { A, ctx } from "./adapter";
import type { Check } from "./api";

export type { Check };

// optional checks are reported, never fail the run (cosmos share needs zrok, cosmos up does not)

const DOCTOR_FILE = join(STATE_DIR, "doctor.json");
const MIN_BUN = [1, 2, 21];
const MIN_CPUS = 4;
const GIT_TIMEOUT_MS = 10_000;

export const doctorDone = () => existsSync(DOCTOR_FILE);
export function rememberDoctor() {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(DOCTOR_FILE, JSON.stringify({ at: new Date().toISOString() }) + "\n");
}

const gib = (mib: number) => `${(mib / 1024).toFixed(1)} GiB`;
const ok = (name: string, detail: string): Check => ({ name, ok: true, detail });
const bad = (name: string, detail: string, fix: string): Check => ({ name, ok: false, detail, fix });

function checkBun(): Check {
  const v = Bun.version.split(".").map(Number);
  const fine = v[0] > MIN_BUN[0] || (v[0] === MIN_BUN[0] && (v[1] > MIN_BUN[1] || (v[1] === MIN_BUN[1] && v[2] >= MIN_BUN[2])));
  return fine ? ok("bun", Bun.version) : bad("bun", `${Bun.version}, cosmos needs ${MIN_BUN.join(".")}+`, "bun upgrade");
}

async function checkDocker(): Promise<Check[]> {
  const r = await run(["docker", "info", "--format", "{{.MemTotal}} {{.NCPU}}"], { quiet: true, timeoutMs: 15_000 }).catch(() => ({ code: -1, stdout: "", stderr: "docker not installed" }));
  if (r.code !== 0) {
    return [bad("docker", r.code === 124 ? "the daemon did not answer in 15s" : r.stderr.trim().split("\n").pop() || "not running", "start Docker Desktop (or your docker engine), wait until it is ready, then rerun")];
  }
  const [bytes, cpus] = r.stdout.trim().split(/\s+/).map(Number);
  const totalMiB = Math.round(bytes / 1048576);
  const out: Check[] = [ok("docker", "running")];
  let local: { id: string; est: number }[] = [];
  try {
    local = loadProfiles().profiles.filter((p) => p.backendKind === "local").map((p) => ({ id: p.id, est: estimateMiB(p.services) }));
  } catch {}
  const smallest = local.length ? Math.min(...local.map((p) => p.est)) : 0;
  const fits = local.filter((p) => totalMiB - p.est >= VM_FLOOR_MIB);
  const memFix = "Docker Desktop > Settings > Resources > Memory: raise it (16 GiB runs every profile)";
  if (totalMiB < smallest + VM_FLOOR_MIB) out.push(bad("docker memory", `${gib(totalMiB)}; the smallest local profile needs about ${gib(smallest + VM_FLOOR_MIB)}`, memFix));
  else if (totalMiB < VM_FLOOR_MIB * 2) out.push(bad("docker memory", `${gib(totalMiB)} is too small to build images`, memFix));
  else out.push(ok("docker memory", `${gib(totalMiB)}${local.length ? `; fits ${fits.length} of ${local.length} local profiles${fits.length < local.length ? ` (not ${local.filter((p) => !fits.includes(p)).map((p) => p.id).join(", ")})` : ""}` : ""}`));
  out.push(cpus >= MIN_CPUS ? ok("docker cpus", String(cpus)) : bad("docker cpus", `${cpus}, builds and the stack want ${MIN_CPUS}+`, "Docker Desktop > Settings > Resources > CPUs"));
  return out;
}

async function checkProject(): Promise<{ checks: Check[]; path: string | null }> {
  let path: string;
  try {
    path = projectDir();
    manifest();
  } catch (e) {
    return { checks: [bad("project", (e as Error).message, "run cosmos inside a project that has a cosmos.yaml, or pass --project <dir>")], path: null };
  }
  const checks = [ok("project", `${path} (${manifest().projectId})`)];
  const sd = manifest().sourcesDir;
  const st = await run(["git", "-C", path, "submodule", "status"], { quiet: true, env: GIT_ENV, timeoutMs: 15_000 });
  const lines = st.stdout.split("\n").filter(Boolean);
  const missing = lines.filter((l) => l.startsWith("-")).map((l) => l.slice(1).trim().split(/\s+/)[1]).filter((p) => p.startsWith(`${sd}/`));
  if (st.code !== 0) checks.push(bad("project submodules", st.stderr.trim().split("\n").pop() ?? "git submodule status failed", `check that ${path} is a git clone`));
  else if (missing.length) checks.push({ ...bad("project submodules", `${submoduleCount(path)} initialised, ${missing.length} not: ${missing.join(", ")}`, `git -C ${path} submodule update --init <path> for the services you run from source`), optional: true });
  else checks.push(ok("project submodules", `${lines.length} initialised`));
  return { checks, path };
}

async function checkVendor(project: string | null): Promise<Check> {
  if (!project) return bad("vendor worktree", "needs the project first", "fix the project check above");
  const dir = vendorDir();
  const head = (await run(["git", "-C", project, "rev-parse", "HEAD"], { quiet: true, env: GIT_ENV })).stdout.trim();
  if (!head) return bad("vendor worktree", `${project} has no commit`, "commit in the project first; cosmos vendors its HEAD");
  if (existsSync(join(dir, ".git"))) {
    const h = (await run(["git", "-C", dir, "rev-parse", "HEAD"], { quiet: true, env: GIT_ENV })).stdout.trim();
    if (!h) return bad("vendor worktree", `${dir} is a worktree of a checkout that is gone or moved`, `rm -rf ${dir}  (cosmos makes it again from the project)`);
    return h === head ? ok("vendor worktree", `${dir} at the project's HEAD ${head.slice(0, 8)}`) : { ...bad("vendor worktree", `${dir} is at ${h.slice(0, 8)}, the project's HEAD is ${head.slice(0, 8)}`, "cosmos up moves it when no instance is running"), optional: true };
  }
  return ok("vendor worktree", `not made yet; cosmos adds ${dir} at ${head.slice(0, 8)} on first run`);
}

async function checkRemotes(project: string | null): Promise<Check> {
  const urls = new Set<string>();
  if (project) {
    for (const x of manifest().extras) urls.add(x.url);
    const g = await run(["git", "-C", project, "remote", "get-url", "origin"], { quiet: true, env: GIT_ENV });
    if (g.code === 0) urls.add(g.stdout.trim());
    const m = await run(["git", "-C", project, "config", "-f", ".gitmodules", "--get-regexp", "^submodule\\..*\\.url$"], { quiet: true, env: GIT_ENV });
    for (const l of m.stdout.split("\n").filter(Boolean)) urls.add(l.split(/\s+/)[1]);
  }
  if (!urls.size) return ok("git access", "no remotes to check");
  const env = { GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes -o ConnectTimeout=8", ...GIT_ENV };
  const res = await Promise.all([...urls].map(async (u) => ({ u, r: await run(["git", "ls-remote", "--exit-code", u, "HEAD"], { quiet: true, env, timeoutMs: GIT_TIMEOUT_MS }).catch(() => ({ code: -1 })) })));
  const failed = res.filter((x) => x.r.code !== 0);
  return failed.length
    ? bad("git access", `${failed.length} of ${res.length} remotes refused: ${failed.map((x) => x.u.replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "")).join(", ")}`, "ask for access to those repos, and sign in to your git host (gh auth login, or an ssh key)")
    : ok("git access", `${res.length} remotes reachable`);
}

async function checkPorts(): Promise<Check> {
  const r = await run(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"], { quiet: true, timeoutMs: 15_000 }).catch(() => ({ code: -1, stdout: "" }));
  if (r.code !== 0 && !r.stdout) return ok("ports", `${BASE_PORT}+ not probed (lsof gave nothing)`);
  const own = new Set<number>();
  for (const i of Object.values(readState().instances)) {
    for (const p of Object.values(i.ports)) own.add(p);
    if (i.share) own.add(i.share.port);
  }
  let dashPid = 0;
  try { dashPid = Number(readFileSync(PID_FILE, "utf8").trim()); } catch {}
  const dashCmd = dashPid ? (await run(["ps", "-o", "command=", "-p", String(dashPid)], { quiet: true })).stdout : "";
  const dashIsOurs = dashPid > 0 && isDashboardCommand(dashCmd);
  const held: { port: number; who: string; pid: number }[] = [];
  let pid = 0, cmd = "";
  for (const l of r.stdout.split("\n")) {
    if (l[0] === "p") pid = Number(l.slice(1));
    else if (l[0] === "c") cmd = l.slice(1);
    else if (l[0] === "n") {
      const port = Number(l.slice(l.lastIndexOf(":") + 1));
      if (port >= BASE_PORT && port < BASE_PORT + SLOT_STRIDE * (MAX_SLOT + 1) && !own.has(port)) held.push({ port, who: cmd, pid });
    }
  }
  const dp = dashboardPort();
  const foreign = held.filter((h) => !(h.port === dp && dashIsOurs && h.pid === dashPid));
  const dash = foreign.find((h) => h.port === dp);
  if (dash) return { ...bad("ports", `${dp} is held by ${dash.who} (pid ${dash.pid}); the dashboard needs it`, `stop that program (kill ${dash.pid}), or run the dashboard with --port`), optional: true };
  return ok("ports", `${BASE_PORT}-${BASE_PORT + SLOT_STRIDE * (MAX_SLOT + 1) - 1} free${foreign.length ? ` except ${foreign.length} held by other programs (cosmos skips those slots)` : ""}`);
}

async function checkZrok(): Promise<Check[]> {
  const z = await zrokInfo();
  const pending = readState().pendingRelease ?? [];
  const opt = (c: Check): Check => ({ ...c, optional: true });
  if (!z.bin) return [opt(bad("zrok", "not installed; only cosmos share needs it", "brew install zrok, then zrok enable <your account token>"))];
  return [
    opt(ok("zrok", z.detail)),
    opt(z.enabled ? ok("zrok environment", "enabled") : bad("zrok environment", "not enabled on this Mac", "zrok enable <your account token> (cosmos never enables or disables it)")),
    opt(z.reachable ? ok("zrok api", z.api!) : bad("zrok api", `${z.api ?? "no apiEndpoint in zrok status"} did not answer`, "check the network, or zrok config get apiEndpoint")),
    ...(pending.length ? [opt(bad("zrok names", `rm could not release ${pending.join(", ")}`, "the next cosmos share retries it, or zrok delete name <name>"))] : []),
  ];
}

// Syncs this project's claims, then reaps other projects' claims that are provably dead (see registry.reapable).
async function checkRegistry(project: string | null): Promise<Check> {
  try {
    if (project) {
      if (migrationPending()) return bad("registry", `a cosmos 0.1 layout in ${HOME} is not migrated yet`, "run any cosmos command in this project; it migrates on first run");
      await withState(() => {});
    }
    const ps = await run(["docker", "ps", "-a", "--format", "{{.Names}}"], { quiet: true, timeoutMs: 15_000 }).catch(() => null);
    const names = ps?.code === 0 ? ps.stdout.split("\n").filter(Boolean) : null;
    const own = project ? projectId() : "";
    const reaped = await withLock(REGISTRY_LOCK_DIR, { staleMs: 10 * 60_000, waitMs: 120_000 }, () => {
      const reg = readRegistry();
      const dead = reapable(reg, own, {
        projectGone: (c) => !!c.projectDir && !existsSync(join(c.projectDir, "cosmos.yaml")),
        containersGone: (c) => names !== null && !names.some((n) => n.startsWith(`${c.prefix}-`)),
        stateLists: (c) => {
          try {
            const st = JSON.parse(readFileSync(join(projectHomeOf(c.projectId), ".state", "state.json"), "utf8"));
            return st.version > STATE_VERSION ? null : !!st.instances?.[c.instance];
          } catch {
            return null;
          }
        },
      });
      if (dead.length) {
        for (const d of dead) delete reg.claims[d.key];
        writeRegistry(reg);
      }
      return dead;
    });
    const claims = Object.values(readRegistry().claims);
    const others = new Set(claims.filter((c) => c.projectId !== own).map((c) => c.projectId));
    return ok("registry", `${claims.length} claim(s)${others.size ? `, ${others.size} other project(s): ${[...others].join(", ")}` : ""}${reaped.length ? `; reaped ${reaped.map((d) => `${d.claim.projectId}/${d.claim.instance} (${d.why})`).join(", ")}` : ""}`);
  } catch (e) {
    return bad("registry", (e as Error).message, `check ${REGISTRY_FILE}`);
  }
}

export async function doctor(): Promise<{ checks: Check[]; ok: boolean }> {
  const bun = checkBun();
  const [docker, p] = await Promise.all([checkDocker(), checkProject()]);
  let sources: Record<string, string> | null = null;
  try {
    if (p.path) sources = envSources();
  } catch {}
  const custom = p.path ? A().doctor?.(ctx(), { sources }).catch((e) => [bad("project checks", (e as Error).message, "see the project's adapter")]) : undefined;
  const [vendor, remotes, ports, zrok, extra, registry] = await Promise.all([checkVendor(p.path), checkRemotes(p.path), checkPorts(), checkZrok(), custom ?? Promise.resolve([] as Check[]), checkRegistry(p.path)]);
  const checks = [bun, ...docker, ...p.checks, vendor, ...extra, registry, remotes, ports, ...zrok];
  return { checks, ok: checks.every((c) => c.ok || c.optional) };
}

export function printDoctor(d: { checks: Check[]; ok: boolean }, print: (s: string) => void = console.log) {
  for (const c of d.checks) {
    print(`${c.ok ? "pass" : c.optional ? "warn" : "FAIL"}  ${c.name.padEnd(18)} ${c.detail}`);
    if (!c.ok && c.fix) print(`      fix: ${c.fix}`);
  }
  print(d.ok ? "all checks passed" : `${d.checks.filter((c) => !c.ok && !c.optional).length} check(s) failed`);
}
