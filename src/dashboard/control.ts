import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { PKG_ROOT, STATE_DIR } from "../paths";
import { BASE_PORT } from "../offsets";
import { portOwner } from "../ports";
import { run } from "../sh";
import { CosmosError } from "../errors";
import { ensureBuilt } from "./build";

export const DASHBOARD_HOST = "127.0.0.1";
export const PID_FILE = join(STATE_DIR, "dashboard.pid");
export const LOG_FILE = join(STATE_DIR, "dashboard.log");

// --port, else COSMOS_DASHBOARD_PORT, else the base port
export function dashboardPort(flag?: string): number {
  const raw = flag ?? process.env.COSMOS_DASHBOARD_PORT;
  if (raw === undefined || raw === "") return BASE_PORT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new CosmosError(`dashboard port must be 1-65535, got "${raw}"`);
  return n;
}

type Emit = (obj: unknown, human: () => void) => void;

function readPid(): number | null {
  try {
    const n = Number(readFileSync(PID_FILE, "utf8").trim());
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

// A pid only counts if its command line is exactly this package's dashboard server: the bun binary,
// this cli.ts, then `dashboard` and nothing else (the detached child is spawned exactly so).
export function isDashboardCommand(cmd: string): boolean {
  const parts = cmd.trim().split(/\s+/);
  const cli = join(PKG_ROOT, "src", "cli.ts");
  return parts.length === 3 && /(^|\/)bun$/.test(parts[0]) && parts[1] === cli && parts[2] === "dashboard";
}

async function isOurDashboard(pid: number): Promise<boolean> {
  const r = await run(["ps", "-o", "command=", "-p", String(pid)], { quiet: true });
  return r.code === 0 && isDashboardCommand(r.stdout);
}

async function status(port: number, url: string) {
  const pid = readPid();
  const alive = pid !== null && (await isOurDashboard(pid));
  const owner = await portOwner(port);
  return { running: alive, pid: alive ? pid : null, url, port, portOwner: owner, pidFile: PID_FILE, log: LOG_FILE };
}

async function waitUp(URL_: string, timeoutMs: number): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      if ((await fetch(`${URL_}/api/ping`, { signal: AbortSignal.timeout(1000) })).ok) return true;
    } catch {}
    await Bun.sleep(150);
  }
  return false;
}

export async function dashboardMain(v: Record<string, any>, emit: Emit) {
  const DASHBOARD_PORT = dashboardPort(v.port);
  const URL_ = `http://${DASHBOARD_HOST}:${DASHBOARD_PORT}`;
  if (v.status) {
    const s = await status(DASHBOARD_PORT, URL_);
    return emit(s, () => console.log(s.running ? `dashboard running: ${s.url} (pid ${s.pid})` : `dashboard not running${s.portOwner ? `; :${DASHBOARD_PORT} held by ${s.portOwner}` : ""}`));
  }

  if (v.stop) {
    const pid = readPid();
    if (pid === null) return emit({ ok: true, stopped: null }, () => console.log("dashboard not running (no pid file)"));
    if (!(await isOurDashboard(pid))) {
      rmSync(PID_FILE, { force: true });
      return emit({ ok: true, stopped: null, stalePid: pid }, () => console.log(`removed stale pid file (pid ${pid} is not a cosmos dashboard)`));
    }
    process.kill(pid, "SIGTERM");
    for (let k = 0; k < 50 && (await isOurDashboard(pid)); k++) await Bun.sleep(100);
    rmSync(PID_FILE, { force: true });
    return emit({ ok: true, stopped: pid }, () => console.log(`dashboard stopped (pid ${pid})`));
  }

  const owner = await portOwner(DASHBOARD_PORT);
  if (owner) throw new CosmosError(`:${DASHBOARD_PORT} is busy (${owner}); not starting the dashboard`, { portOwner: owner });
  if (!process.env.COSMOS_DASHBOARD_DETACHED) await ensureBuilt((m) => console.error(`[cosmos] ${m}`));
  const { hasProject, projectDir } = await import("../paths");
  if (!hasProject()) throw new CosmosError("the dashboard needs a project: run it inside one (a dir with cosmos.yaml), or pass --project <dir>");
  const project = projectDir();

  if (v.detach) {
    mkdirSync(STATE_DIR, { recursive: true });
    const fd = openSync(LOG_FILE, "a");
    const child = Bun.spawn(["bun", join(PKG_ROOT, "src", "cli.ts"), "dashboard"], {
      cwd: project,
      stdin: "ignore",
      stdout: fd,
      stderr: fd,
      env: { ...process.env, COSMOS_DASHBOARD_DETACHED: "1", COSMOS_PROJECT: project, COSMOS_DASHBOARD_PORT: String(DASHBOARD_PORT) },
      detached: true,
    });
    child.unref();
    closeSync(fd);
    writeFileSync(PID_FILE, `${child.pid}\n`);
    if (!(await waitUp(URL_, 10_000))) {
      rmSync(PID_FILE, { force: true });
      throw new CosmosError(`dashboard did not answer on ${URL_} within 10s; see ${LOG_FILE}`, { pid: child.pid, log: LOG_FILE });
    }
    return emit({ ok: true, url: URL_, pid: child.pid, pidFile: PID_FILE, log: LOG_FILE }, () =>
      console.log(`dashboard running: ${URL_}  (pid ${child.pid}; stop with: cosmos dashboard --stop)`),
    );
  }

  const { ensureVendor } = await import("../vendor");
  await ensureVendor((m) => console.error(`[cosmos] ${m}`)).catch((e) => console.error(`[cosmos] ${(e as Error).message}`));
  const { serve } = await import("./server");
  const server = serve(DASHBOARD_HOST, DASHBOARD_PORT);
  const cleanup = () => {
    server.stop(true);
    if (readPid() === process.pid && existsSync(PID_FILE)) rmSync(PID_FILE, { force: true });
    process.exit(0);
  };
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
  console.error(`[cosmos] dashboard on ${URL_}${process.env.COSMOS_DASHBOARD_DETACHED ? "" : "  (ctrl-c to stop)"}`);
  await new Promise(() => {});
}
