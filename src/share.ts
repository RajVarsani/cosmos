// zrok sharing: one share proxy (src/share-proxy.ts) per instance. The proxy serves the FE's preview build, supervises its
// `zrok share public` child and rebuilds on change. Cosmos owns processes by exact command line and names it minted (Instance.shareName).
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { createHash, randomBytes } from "crypto";
import { userInfo } from "os";
import { join } from "path";
import { PKG_ROOT, STATE_DIR } from "./paths";
import { run } from "./sh";
import { containerName } from "./generate";
import { localConfig } from "./project";
import { A, ctx } from "./adapter";
import type { PreviewRecipe } from "./api";
import type { Instance } from "./state";
import type { ProxyConfig, ShareStatus } from "./share-proxy";

export type Share = {
  url: string;
  port: number;
  // the FE served at /
  fe: string;
  public: boolean;
  user: string | null;
  password: string | null;
  zrokName: string | null;
  exposeAdmin?: boolean;
  // what the share origin needs before sign-in works (adapter.shareNotice)
  notice?: string | null;
  // set when the share is on but cannot run (zrok plan limit, zrok missing); no processes then
  unavailable?: string | null;
  warnings?: string[];
  // service -> port the share reaches under /__cosmos/<port>
  reach?: Record<string, number>;
  proxyPid: number;
  proxyCmd: string;
  previewContainer?: string | null;
  startedAt: string;
  // 9fe34f7 records: zrok ran beside the proxy
  zrokPid?: number;
  zrokCmd?: string;
  reservedName?: boolean;
};

export const SHARES_DIR = join(STATE_DIR, "shares");
export const SHARE_USER = "cosmos";
export const ZROK_HOST = "shares.zrok.io";
const PROXY = join(PKG_ROOT, "src", "share-proxy.ts");
const shareFile = (name: string, ext: string) => join(SHARES_DIR, `${name}.${ext}`);
export const shareLogs = (name: string) => ({ proxy: shareFile(name, "proxy.log"), zrok: shareFile(name, "zrok.log"), preview: shareFile(name, "preview.log") });
export const previewDir = (name: string) => join(SHARES_DIR, name, "preview");
export const statusFile = (name: string) => shareFile(name, "status.json");
export const previewContainer = (name: string, fe: string) => containerName(name, `${fe}-preview`);

export const zrokBin = () => Bun.which("zrok2") ?? Bun.which("zrok");

export type ZrokInfo = { bin: string | null; version: string | null; enabled: boolean; api: string | null; reachable: boolean | null; detail: string };

// installed binary, version, whether this Mac's environment is enabled, and whether its API answers
export async function zrokInfo(probe = true): Promise<ZrokInfo> {
  const bin = zrokBin();
  if (!bin) return { bin: null, version: null, enabled: false, api: null, reachable: null, detail: "not installed" };
  const v = await run([bin, "version"], { quiet: true, timeoutMs: 10_000 });
  const version = (v.stdout + v.stderr).match(/v(\d+\.\d+\.\d+)/)?.[1] ?? null;
  const s = await run([bin, "status"], { quiet: true, timeoutMs: 10_000 });
  const out = s.stdout + s.stderr;
  const enabled = /EnvZId\s*│\s*<<SET>>/.test(out);
  const api = out.match(/apiEndpoint\s*│\s*(https?:\/\/\S+)/)?.[1] ?? null;
  let reachable: boolean | null = null;
  if (probe && api) {
    try {
      await fetch(api, { method: "HEAD", signal: AbortSignal.timeout(8000) });
      reachable = true;
    } catch {
      reachable = false;
    }
  }
  return { bin, version, enabled, api, reachable, detail: `${bin} v${version ?? "?"}` };
}

// A pid is ours only while its command line is exactly the one cosmos spawned.
export async function owns(pid: number, cmd: string): Promise<boolean> {
  if (!pid || !cmd) return false;
  const r = await run(["ps", "-o", "command=", "-p", String(pid)], { quiet: true });
  return r.code === 0 && r.stdout.trim() === cmd;
}

export function readShareStatus(name: string): ShareStatus | null {
  try {
    return JSON.parse(readFileSync(statusFile(name), "utf8"));
  } catch {
    return null;
  }
}

export async function shareAlive(s: Share): Promise<{ proxy: boolean; zrok: boolean }> {
  if (s.unavailable || !s.proxyPid) return { proxy: false, zrok: false };
  // 9fe34f7 shares ran zrok beside the proxy
  if (s.zrokPid && s.zrokCmd) {
    const [proxy, zrok] = await Promise.all([owns(s.proxyPid, s.proxyCmd), owns(s.zrokPid, s.zrokCmd)]);
    return { proxy, zrok };
  }
  const proxy = await owns(s.proxyPid, s.proxyCmd);
  const st = proxy ? readShareStatus(nameOfCmd(s.proxyCmd)) : null;
  return { proxy, zrok: st?.zrok?.state === "live" };
}

const nameOfCmd = (cmd: string) => cmd.split("/").pop()!.replace(/\.json$/, "");

export type ShareState = "starting" | "live" | "restarting" | "unavailable" | "stopped";

// one word for the sheet and status, plus why when it is not live
export async function shareState(s: Share, instanceUp: boolean): Promise<{ state: ShareState; reason: string | null; status: ShareStatus | null }> {
  if (s.unavailable) return { state: "unavailable", reason: s.unavailable, status: null };
  if (!s.proxyPid) return { state: "stopped", reason: instanceUp ? "the share processes are not running; cosmos share starts them" : "the instance is down; the share comes back on start", status: null };
  const a = await shareAlive(s);
  if (!a.proxy) return { state: instanceUp ? "restarting" : "stopped", reason: "share proxy is not running", status: null };
  const st = readShareStatus(nameOfCmd(s.proxyCmd));
  const z = st?.zrok;
  if (!z) return { state: "starting", reason: null, status: st };
  if (z.state === "live") return { state: "live", reason: null, status: st };
  if (z.state === "limited" || z.state === "failed") return { state: "unavailable", reason: z.lastError ?? z.state, status: st };
  if (z.state === "restarting") return { state: "restarting", reason: `${z.lastError ?? "zrok exited"}${z.nextRetryAt ? `; retry at ${z.nextRetryAt}` : ""}`, status: st };
  return { state: "starting", reason: null, status: st };
}

function spawnDetached(argv: string[], log: string): number {
  const fd = openSync(log, "a", 0o600);
  const p = Bun.spawn(argv, { cwd: STATE_DIR, stdin: "ignore", stdout: fd, stderr: fd, detached: true });
  p.unref();
  closeSync(fd);
  return p.pid;
}

async function kill(pid: number, cmd: string, waitMs = 20_000) {
  if (!(await owns(pid, cmd))) return;
  try { process.kill(pid, "SIGTERM"); } catch {}
  // the proxy stops zrok first, and zrok deletes the share, a round trip to the API
  for (let k = 0; k < waitMs / 150 && (await owns(pid, cmd)); k++) await Bun.sleep(150);
  if (await owns(pid, cmd)) try { process.kill(pid, "SIGKILL"); } catch {}
}

// ---------- names: <instance>-<user>, minted once per instance, kept until rm ----------

const NAME_MAX = 40;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function nameCandidates(instance: string, tag = userInfo().username): string[] {
  const t = slugify(tag).slice(0, 12) || "cosmos";
  const base = (suffix = "") => `${slugify(instance).slice(0, NAME_MAX - t.length - 1 - suffix.length).replace(/-+$/, "")}-${t}${suffix}`;
  const h = createHash("sha1").update(`${instance}:${t}`).digest("hex");
  return [base(), base("-2"), base("-3"), base(`-${h.slice(0, 4)}`), base(`-${h.slice(4, 8)}`)];
}

type NameRow = { name: string; token: string };

// zrok v2 controller/createShareName.go: the conflict payload when the account's name limit is hit
const NAME_LIMIT = /names limit reached/i;

// names on this zrok account, from `zrok list names`
async function zrokNames(bin: string): Promise<NameRow[] | null> {
  const r = await run([bin, "list", "names"], { quiet: true, timeoutMs: 15_000 });
  if (r.code !== 0) return null;
  return r.stdout.split("\n").map((l) => l.split("│").map((x) => x.trim())).filter((c) => c.length > 4 && /\./.test(c[1] ?? "")).map((c) => ({ name: c[2], token: c[4] }));
}

export type Minted = { name: string | null; owned: boolean; warning?: string; limited?: string };

// First free candidate wins. A name already on this account is never reused unless this instance minted it (taken: next candidate).
export async function mintName(inst: Instance, others: string[], log: (m: string) => void): Promise<Minted> {
  const bin = zrokBin();
  if (!bin) return { name: null, owned: false, warning: "zrok is not installed" };
  const mine = await zrokNames(bin);
  const fallback = `cosmos-${randomBytes(4).toString("hex")}`;
  for (const n of [...nameCandidates(inst.name), fallback]) {
    if (others.includes(n) || mine?.some((x) => x.name === n)) continue;
    const c = await run([bin, "create", "name", n], { quiet: true, timeoutMs: 30_000 });
    if (c.code === 0) {
      log(`minted zrok name ${n}`);
      return { name: n, owned: true, ...(n === fallback ? { warning: `could not mint a name from ${inst.name}; using ${n}` } : {}) };
    }
    const err = (c.stderr || c.stdout).trim();
    if (NAME_LIMIT.test(err)) return { name: null, owned: false, limited: `zrok refused a new name (plan limit): ${err.slice(-300)}` };
    log(`zrok name ${n} unavailable (${err.match(/createShareNameConflict.*$/)?.[0]?.slice(0, 160) ?? err.slice(-160)})`);
  }
  return { name: null, owned: false, warning: `could not mint any zrok name for ${inst.name}; the share runs on a random URL that changes when zrok restarts` };
}

export async function releaseName(name: string): Promise<{ ok: boolean; error: string | null }> {
  const bin = zrokBin();
  if (!bin) return { ok: false, error: "zrok is not installed" };
  const r = await run([bin, "delete", "name", name], { quiet: true, timeoutMs: 30_000 }).catch((e) => ({ code: 1, stdout: "", stderr: (e as Error).message }));
  // already gone counts as released
  return r.code === 0 || /notfound|not found/i.test(r.stderr + r.stdout) ? { ok: true, error: null } : { ok: false, error: (r.stderr || r.stdout).trim().slice(-200) || `exit ${r.code}` };
}

// ---------- account limits ----------

export type Usage = { shares: number; names: number; maxShares: number; maxNames: number | null };

// free plan: 50 share backends (https://zrok.io/pricing/); names have no published cap, so maxNames is opt-in
export function shareLimits(): { maxShares: number; maxNames: number | null } {
  const s = (localConfig() as { share?: { maxShares?: number; maxNames?: number } }).share ?? {};
  return { maxShares: Number(s.maxShares) || 50, maxNames: Number(s.maxNames) || null };
}

export async function zrokUsage(): Promise<Usage | null> {
  const bin = zrokBin();
  if (!bin) return null;
  const r = await run([bin, "overview", "--json"], { quiet: true, timeoutMs: 20_000 });
  try {
    const d = JSON.parse(r.stdout) as { environments?: { shares?: unknown[] | null }[]; names?: unknown[] | null };
    const shares = (d.environments ?? []).reduce((n, e) => n + (e.shares?.length ?? 0), 0);
    return { shares, names: d.names?.length ?? 0, ...shareLimits() };
  } catch {
    return null;
  }
}

// ---------- preview container: the FE container's image, env and mounts, one `vite build` per start ----------

// The worktree is never writable from the build: /app is a tmpfs with each top-level entry of the source bound read-only on it,
// so the output dir and any other write land in the container, not the worktree. The adapter gives the recipe per FE:
// out (the build's output dir), viteTemp (where vite writes its bundled config; a tmpfs there) and the command.
export const VITE_BUILD = ["build", "--sourcemap", "false", "--emptyOutDir", "true"];
const DROP_ENV = ["HOSTNAME", "HOME", "PATH", "CHOKIDAR_\\w+"];

export const previewRecipe = (inst: Instance, fe: string): PreviewRecipe | null => A().previewRecipe?.(ctx(), inst, fe) ?? null;

// mode: the adapter's previewMode (a dev-only auth bypass needs a development build)
export async function createPreview(inst: Instance, fe: string, mode: "production" | "development"): Promise<string> {
  const spec = previewRecipe(inst, fe);
  if (!spec) throw new Error(`no preview recipe for ${fe}; the project's adapter defines previewRecipe for the FEs it can share`);
  const drop = new RegExp(`^(${[...DROP_ENV, ...(spec.dropEnv ?? [])].join("|")})=`);
  const src = containerName(inst.name, fe);
  const r = await run(["docker", "inspect", src], { quiet: true });
  if (r.code !== 0) throw new Error(`${src} does not exist; start ${inst.name} first`);
  const c = JSON.parse(r.stdout)[0] as { Config: { Image: string; Env: string[]; WorkingDir: string }; Mounts: { Type: string; Source: string; Name?: string; Destination: string; RW: boolean }[] };
  const dir = previewDir(inst.name);
  mkdirSync(join(dir, "build"), { recursive: true, mode: 0o700 });
  // env goes through a 0600 file, never argv (ps shows argv)
  const envFile = join(dir, "env");
  writeFileSync(envFile, c.Config.Env.filter((e) => !drop.test(e) && !e.includes("\n")).concat(`NODE_OPTIONS=--max-old-space-size=${spec.needMiB}`).join("\n") + "\n", { mode: 0o600 });
  // source and the dev container's node_modules volumes go in read-only: the build can read them, never change them.
  // The entrypoint rewrites envs/.env from the env, so the preview gets its own envs dir.
  const wd = c.Config.WorkingDir || "/app";
  const envs = join(dir, "envs");
  mkdirSync(envs, { recursive: true, mode: 0o700 });
  // Docker Desktop reports bind sources as /host_mnt/<host path>; the host process and `docker create` both want the host path
  const hostPath = (p: string) => p.replace(/^\/host_mnt(?=\/)/, "");
  const taken = new Set([...c.Mounts.map((m) => m.Destination), spec.out]);
  const mounts = [`type=tmpfs,target=${wd},tmpfs-size=67108864`];
  for (const m of c.Mounts) {
    if (m.Destination === spec.out) continue;
    if (m.Type === "volume") mounts.push(`type=volume,source=${m.Name},target=${m.Destination},readonly`);
    else if (m.Type === "bind" && /\/envs$/.test(m.Destination)) mounts.push(`type=bind,source=${envs},target=${m.Destination}`);
    else if (m.Type === "bind" && m.Destination === wd) {
      for (const e of readdirSync(hostPath(m.Source))) if (!taken.has(`${wd}/${e}`)) mounts.push(`type=bind,source=${join(hostPath(m.Source), e)},target=${wd}/${e},readonly`);
    } else mounts.push(`type=bind,source=${hostPath(m.Source)},target=${m.Destination},readonly`);
  }
  // the tmpfs needs its mountpoint in the read-only volume (the dev server makes it too), and so does an out dir inside the source
  await run(["docker", "exec", src, "mkdir", "-p", spec.viteTemp, ...(spec.mkOut ? [spec.out] : [])], { quiet: true });
  const name = previewContainer(inst.name, fe);
  await removePreview(name);
  const argv = [
    "docker", "create", "--name", name, "--label", `cosmos.instance=${inst.name}`, "--label", `cosmos.service=${fe}-preview`,
    // no network: nothing in a build needs it, and the sentry plugin cannot upload source maps
    "--network", "none", "--memory", `${spec.needMiB + 2048}m`, "--cpus", "2", "--pids-limit", "512", "--tmpfs", "/tmp", "--tmpfs", spec.viteTemp, "--env-file", envFile, "-w", c.Config.WorkingDir || "/app",
    ...mounts.flatMap((m) => ["--mount", m]), "--mount", `type=bind,source=${join(dir, "build")},target=${spec.out}`,
    c.Config.Image, ...spec.cmd(mode),
  ];
  const cr = await run(argv, { quiet: true });
  if (cr.code !== 0) throw new Error(`docker create ${name} failed: ${(cr.stderr || cr.stdout).trim().slice(-400)}`);
  return name;
}

export async function removePreview(container: string) {
  if (!/^cosmos-[a-z0-9-]+-preview$/.test(container)) return;
  await run(["docker", "rm", "-f", container], { quiet: true });
}

// ---------- start / stop ----------

export type StartShare = {
  inst: Instance; fe: string; fePort: number; allowed: number[]; port: number; public: boolean; zrokName: string | null;
  block: ProxyConfig["block"]; notice: string | null; previewMode: "production" | "development" | null; srcDir: string | null; log: (m: string) => void;
};

function readConfig(name: string): ProxyConfig | null {
  try {
    return JSON.parse(readFileSync(shareFile(name, "json"), "utf8"));
  } catch {
    return null;
  }
}


// Spawns (or respawns) the proxy; the password, secret and name survive a restart so the link and login stay the same.
export async function startShare(o: StartShare): Promise<Share> {
  const bin = zrokBin();
  if (!bin) throw new Error("zrok is not installed (brew install zrok); cosmos doctor checks it");
  const info = await zrokInfo(false);
  if (!info.enabled) throw new Error("this Mac's zrok environment is not enabled (zrok enable <token>); cosmos never enables or disables it for you");
  mkdirSync(SHARES_DIR, { recursive: true, mode: 0o700 });
  const name = o.inst.name;
  const prev = readConfig(name);
  const auth = o.public ? null : prev?.auth ?? { user: SHARE_USER, password: randomBytes(12).toString("base64url") };
  const zrokArgv = [bin, "share", "public", `http://127.0.0.1:${o.port}`, "--headless", "--force-local", ...(o.zrokName ? ["-n", `public:${o.zrokName}`] : [])];
  let preview: ProxyConfig["preview"] = null;
  if (o.previewMode && o.srcDir) {
    const container = await createPreview(o.inst, o.fe, o.previewMode);
    preview = { fe: o.fe, container, srcDir: o.srcDir, ignore: ["node_modules", ".git", "dist", ".turbo", "envs", ".vite", "coverage"], dir: previewDir(name), needMiB: previewRecipe(o.inst, o.fe)?.needMiB ?? 4000 };
  }
  const cfg: ProxyConfig = {
    name, port: o.port, fePort: o.fePort, allowed: o.allowed, auth, secret: prev?.secret ?? randomBytes(32).toString("hex"),
    block: o.block, notice: o.notice ? { html: o.notice } : null, preview, zrok: { argv: zrokArgv }, statusFile: statusFile(name),
  };
  const cfgFile = shareFile(name, "json");
  writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  const logs = shareLogs(name);
  const proxyArgv = [process.execPath, PROXY, cfgFile];
  const proxyCmd = proxyArgv.join(" ");
  const proxyPid = spawnDetached(proxyArgv, logs.proxy);
  let up = false;
  for (let k = 0; k < 50 && !up; k++) {
    try {
      up = (await fetch(`http://127.0.0.1:${o.port}/__cosmos/health`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {}
    if (!up) await Bun.sleep(100);
  }
  if (!up) {
    await kill(proxyPid, proxyCmd);
    if (preview) await removePreview(preview.container);
    throw new Error(`share proxy did not answer on 127.0.0.1:${o.port}; see ${logs.proxy}`);
  }
  o.log(`share proxy up (pid ${proxyPid}); zrok starting`);
  // wait for zrok to go live or give a reason; a slow or failing zrok is reported, never a failed share
  let url = o.zrokName ? `https://${o.zrokName}.${ZROK_HOST}` : "";
  for (let k = 0; k < 120; k++) {
    const st = readShareStatus(name)?.zrok;
    if (st?.url) url = st.url;
    // a conflict with our own stale share clears on the next spawn, so only live or a plan limit ends the wait early
    if (st && (st.state === "live" || st.state === "limited")) break;
    await Bun.sleep(250);
  }
  return {
    url, port: o.port, fe: o.fe, public: o.public, user: auth?.user ?? null, password: auth?.password ?? null, zrokName: o.zrokName,
    proxyPid, proxyCmd, previewContainer: preview?.container ?? null, startedAt: new Date().toISOString(),
  };
}

// keep: the instance went down but the share stays on (config with password and secret, preview releases kept)
export async function stopShare(name: string, s: Share, o: { keep: boolean }) {
  if (s.proxyPid) await kill(s.proxyPid, s.proxyCmd);
  // a zrok the proxy left behind (it was SIGKILLed) is still ours by its exact command line
  const z = readShareStatus(name)?.zrok;
  if (z?.pid && z.cmd) await kill(z.pid, z.cmd);
  if (s.zrokPid && s.zrokCmd) await kill(s.zrokPid, s.zrokCmd);
  if (s.previewContainer) await removePreview(s.previewContainer);
  if (o.keep) return;
  for (const f of [shareFile(name, "json"), statusFile(name), ...Object.values(shareLogs(name))]) rmSync(f, { force: true });
  rmSync(join(SHARES_DIR, name), { recursive: true, force: true });
}

export function sharePassword(name: string): string | null {
  return readConfig(name)?.auth?.password ?? null;
}

export const hasConfig = (name: string) => existsSync(shareFile(name, "json"));
