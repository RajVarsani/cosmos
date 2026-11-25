// Supervises the share's `zrok share public` child inside the proxy process: URL detection, restart with backoff, clean stop.
import { closeSync, existsSync, openSync, readFileSync } from "fs";
import { run } from "./sh";
import type { ShareStatus } from "./share-proxy";

export type ZrokStatus = NonNullable<ShareStatus["zrok"]>;
type State = ZrokStatus["state"];

const MIN_BACKOFF = 1000;
const MAX_BACKOFF = 60_000;
const LIMIT_BACKOFF = 5 * 60_000;
const STABLE_MS = 120_000;
const STOP_WAIT_MS = 15_000;

const URL_AFTER = /following endpoints:(?:\\n|\s)+\s*(?:https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,})/i;
const URL_ANY = /https:\/\/([a-z0-9-]+\.shares\.zrok\.io)\b/i;
const CONFLICT = /conflict|already (?:in use|serving|reserved|shared|exists)|in use by/i;
// zrok v2 controller/share.go answers a failed share limit check with a bare 401 (environment validation shares it); names
// over the limit get this conflict payload (controller/createShareName.go)
const LIMIT = /\[POST \/share\]\[401\] shareUnauthorized|names limit reached/i;

export function zrokUrl(text: string): string | null {
  const host = text.match(URL_AFTER)?.[1] ?? text.match(URL_ANY)?.[1];
  return host ? `https://${host}` : null;
}

const tail = (text: string, lines: number, chars: number) => text.split("\n").map((l) => l.trim()).filter(Boolean).slice(-lines).join(" | ").slice(-chars) || null;

export async function cmdOf(pid: number): Promise<string | null> {
  const r = await run(["ps", "-o", "command=", "-p", String(pid)], { quiet: true }).catch(() => null);
  return r?.code === 0 ? r.stdout.trim() : null;
}

// a zrok left by a previous proxy of this share: only that exact pid + command line is ever signalled
export async function reapOrphan(prev: ShareStatus["zrok"] | undefined) {
  if (!prev?.pid || !prev.cmd || (await cmdOf(prev.pid)) !== prev.cmd) return;
  try { process.kill(prev.pid, "SIGTERM"); } catch {}
  const until = Date.now() + STOP_WAIT_MS;
  while (Date.now() < until && (await cmdOf(prev.pid)) === prev.cmd) await Bun.sleep(200);
  if ((await cmdOf(prev.pid)) === prev.cmd) try { process.kill(prev.pid, "SIGKILL"); } catch {}
}

// this Mac's zrok environment id, from `zrok status --secrets`; null when it cannot be read
async function envZId(bin: string): Promise<string | null> {
  const r = await run([bin, "status", "--secrets"], { quiet: true, timeoutMs: 10_000 }).catch(() => null);
  return r?.stdout.match(/EnvZId\s*│\s*([A-Za-z0-9._-]+)/)?.[1] ?? null;
}

// After a SIGKILLed zrok the server keeps its share, which holds our name. A share is ours only when it belongs to this Mac's
// zrok environment, targets this proxy's exact URL and serves this name; that one is deleted so the respawn can take the name back.
async function dropStale(argv: string[]): Promise<boolean> {
  const target = argv[3];
  const name = argv[argv.indexOf("-n") + 1]?.replace(/^public:/, "");
  if (!target || !name || argv.indexOf("-n") < 0) return false;
  const zid = await envZId(argv[0]);
  if (!zid) return false;
  const r = await run([argv[0], "overview", "--json"], { quiet: true, timeoutMs: 20_000 }).catch(() => null);
  let stale: string[] = [];
  try {
    type Env = { environment?: { zId?: string }; shares?: { shareToken: string; envZId?: string; target: string; frontendEndpoints?: string[] }[] | null };
    const d = JSON.parse(r?.stdout ?? "") as { environments?: Env[] };
    stale = (d.environments ?? []).filter((e) => e.environment?.zId === zid).flatMap((e) => e.shares ?? [])
      .filter((x) => x.envZId === zid && x.target === target && x.frontendEndpoints?.some((f) => f.split(".")[0] === name)).map((x) => x.shareToken);
  } catch {}
  for (const t of stale) await run([argv[0], "delete", "share", t], { quiet: true, timeoutMs: 20_000 }).catch(() => {});
  return stale.length > 0;
}

export type Zrok = { status: () => ZrokStatus; stop: () => Promise<void> };

export function superviseZrok(argv: string[], logFile: string, onChange: () => void): Zrok {
  const cmd = argv.join(" ");
  const st: ZrokStatus = { state: "starting", pid: null, cmd, url: null, restarts: 0, lastError: null, since: new Date().toISOString(), nextRetryAt: null };
  let child: ReturnType<typeof Bun.spawn> | null = null;
  let backoff = MIN_BACKOFF;
  let retry: Timer | null = null;
  let poll: Timer | null = null;
  let stopping = false;

  const set = (state: State, patch: Partial<ZrokStatus> = {}) => {
    if (state !== st.state) st.since = new Date().toISOString();
    Object.assign(st, { state }, patch);
    onChange();
  };
  const logText = () => (existsSync(logFile) ? readFileSync(logFile, "utf8") : "");

  const spawn = () => {
    retry = null;
    if (stopping) return;
    const fd = openSync(logFile, "w", 0o600);
    const started = Date.now();
    const p = Bun.spawn(argv, { stdin: "ignore", stdout: fd, stderr: fd });
    closeSync(fd);
    child = p;
    // a respawn keeps restarting/limited/failed until the URL shows again
    set(st.state, { pid: p.pid, nextRetryAt: null });
    poll = setInterval(() => {
      const url = zrokUrl(logText());
      if (url && child === p && st.state !== "live") set("live", { url, lastError: null });
    }, 500);
    p.exited.then(async () => {
      if (poll) clearInterval(poll);
      poll = null;
      if (child === p) child = null;
      if (stopping) return;
      const text = logText();
      if (Date.now() - started >= STABLE_MS) backoff = MIN_BACKOFF;
      const lastError = tail(text, 3, 400) ?? `zrok exited (${p.exitCode ?? p.signalCode})`;
      let state: State = "restarting";
      let wait = backoff;
      if (LIMIT.test(text)) {
        state = "limited";
        wait = LIMIT_BACKOFF;
      } else if (CONFLICT.test(text)) {
        state = "failed";
        wait = MAX_BACKOFF;
        if (await dropStale(argv)) wait = MIN_BACKOFF;
        if (stopping) return;
      } else backoff = Math.min(backoff * 2, MAX_BACKOFF);
      set(state, { pid: null, restarts: st.restarts + 1, lastError, nextRetryAt: new Date(Date.now() + wait).toISOString() });
      retry = setTimeout(spawn, wait);
    });
  };

  spawn();

  return {
    status: () => ({ ...st }),
    async stop() {
      stopping = true;
      if (retry) clearTimeout(retry);
      if (poll) clearInterval(poll);
      const p = child;
      if (p && p.exitCode === null && p.signalCode === null) {
        p.kill("SIGTERM");
        const done = await Promise.race([p.exited.then(() => true), Bun.sleep(STOP_WAIT_MS).then(() => false)]);
        if (!done) {
          p.kill("SIGKILL");
          await p.exited;
        }
      }
      child = null;
      set("off", { pid: null, nextRetryAt: null });
    },
  };
}
