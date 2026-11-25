import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { CosmosError } from "../errors";
import { run } from "../sh";

export const APP_DIR = join(import.meta.dir, "app");
export const DIST = join(APP_DIR, "dist");

function newest(p: string): number {
  const st = statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  return readdirSync(p).reduce((m, f) => Math.max(m, newest(join(p, f))), st.mtimeMs);
}

// the console is a vite app. A package ships its dist and never builds; a checkout with the app's sources and
// node_modules (a dev setup) rebuilds when dist is missing or older than its sources.
export async function ensureBuilt(log: (s: string) => void = () => {}) {
  const page = join(DIST, "index.html");
  const dev = existsSync(join(APP_DIR, "src")) && existsSync(join(APP_DIR, "node_modules"));
  if (!dev) {
    if (existsSync(page)) return false;
    throw new CosmosError(`no dashboard build at ${DIST}; this package ships without it, so reinstall it, or build it: cd ${APP_DIR} && bun install && bun run build`);
  }
  const src = ["src", "index.html", "vite.config.ts", "package.json", "bun.lock"].map((f) => join(APP_DIR, f)).filter(existsSync);
  if (existsSync(page) && statSync(page).mtimeMs >= Math.max(...src.map(newest))) return false;
  const mods = join(APP_DIR, "node_modules"), lock = join(APP_DIR, "bun.lock");
  if (!existsSync(mods) || (existsSync(lock) && statSync(lock).mtimeMs > statSync(mods).mtimeMs)) {
    log("installing dashboard dependencies");
    const r = await run(["bun", "install", "--frozen-lockfile"], { cwd: APP_DIR, quiet: true, timeoutMs: 180_000 });
    if (r.code !== 0) return failed(`dashboard install failed: ${(r.stderr || r.stdout).trim().slice(-400)}`, page, log);
  }
  log("building the dashboard");
  const r = await run(["bun", "run", "build"], { cwd: APP_DIR, quiet: true, timeoutMs: 180_000 });
  if (r.code !== 0) return failed(`dashboard build failed: ${(r.stderr || r.stdout).trim().slice(-400)}`, page, log);
  return true;
}

// a failed rebuild serves the last dist; with none, it is an error
function failed(msg: string, page: string, log: (s: string) => void) {
  if (!existsSync(page)) throw new CosmosError(msg);
  log(`warning: ${msg}; serving the previous build`);
  return false;
}
