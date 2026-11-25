import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "fs";
import { join } from "path";
import { withLock } from "./lock";
import { LOCK_DIR, STATE_DIR, STATE_FILE } from "./paths";
import { MAX_SLOT } from "./offsets";
import type { EdgeRoute } from "./edge";
import type { Share } from "./share";
import { canonicalProfile, manifest } from "./catalog";
import { A } from "./adapter";

export type Instance = {
  name: string;
  // free-text display name; absent on older instances (read as name)
  label?: string;
  slot: number;
  backend: string;
  services: string[];
  ports: Record<string, number>;
  // service -> its checkout: instances/<name>/src/<svc> (a worktree of the project's submodule), or a legacy shared path
  src: Record<string, string>;
  // services whose src is a foreign checkout mounted live (an agent's worktree, the project clone); cosmos never changes its git state
  live?: string[];
  // JS FE -> "<image>@<lockfile hash>" its node_modules volumes were last installed from, when not the pinned one
  deps?: Record<string, string>;
  image: string;
  // absent on v0 instances (profile consumer-remote, once "fe"). "proxy" is the retired Vite wrapper, read as edge.
  profile?: string;
  mode?: "edge" | "direct" | "local" | "proxy";
  // edge mode: one listener per upstream host (ports also sit in `ports` under edge:<host>)
  edge?: EdgeRoute[];
  goMode?: "air" | "image";
  poll?: boolean;
  images?: Record<string, string>;
  sourceImages?: boolean;
  cors?: CorsCheck[];
  // soft problems from the last up/seed (a partial seed, a worker that stayed dead); shown on the tile
  warnings?: string[];
  // cosmos share: the public URL, its proxy and zrok processes, and the password when protected
  share?: Share;
  // zrok name minted for this instance's share; kept across unshare/share, released on rm when owned
  shareName?: { name: string; owned: boolean };
  measured?: { memMiB: number; byService: Record<string, number>; at: string };
  timings?: Record<string, number>;
  owner: { cwd: string; sessionId: string | null; pid: number; via?: "cli" | "dashboard" };
  createdAt: string;
  lastUsed: string;
};

export type CorsCheck = { fe: string; origin: string; target: string; allowed: boolean; acao: string | null; credentials: boolean; status: number | null; error?: string };

// pendingRelease: zrok names rm could not release; the next share retries them
export type State = { version: 1; instances: Record<string, Instance>; pendingRelease?: string[] };

const LOCK_OPTS = { staleMs: 10 * 60_000, waitMs: 120_000 };

// Holds the lock for the whole callback; state mutations inside are persisted atomically on return.
export async function withState<T>(fn: (s: State) => Promise<T> | T): Promise<T> {
  mkdirSync(STATE_DIR, { recursive: true });
  return withLock(LOCK_DIR, LOCK_OPTS, async () => {
    const s = readState();
    const out = await fn(s);
    const tmp = `${STATE_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`;
    writeFileSync(tmp, JSON.stringify(s, (k, v) => (k === "share" && v && typeof v === "object" ? { ...v, password: undefined } : v), 2) + "\n");
    renameSync(tmp, STATE_FILE);
    return out;
  });
}

export function readState(): State {
  if (!existsSync(STATE_FILE)) return { version: 1, instances: {} };
  const s: State = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  // records may carry retired profile names; the next write persists the new ones
  for (const i of Object.values(s.instances)) {
    if (i.profile) i.profile = canonicalProfile(i.profile);
    dropRetired(i);
    A().migrateRecord?.(i);
    // the share password lives only in shares/<name>.json (0600), never in state.json
    if (i.share) i.share.password = i.share.public ? null : sharePassword(i.name);
  }
  return s;
}

// services the project dropped (manifest retiredServices); older records still list them
function retired(): Set<string> {
  try {
    return new Set(manifest().retiredServices);
  } catch {
    return new Set();
  }
}

function dropRetired(i: Instance): void {
  const RETIRED = retired();
  if (!RETIRED.size) return;
  i.services = i.services.filter((s) => !RETIRED.has(s));
  if (i.live) i.live = i.live.filter((s) => !RETIRED.has(s));
  for (const m of [i.ports, i.src, i.images, i.deps, i.measured?.byService, i.share?.reach]) if (m) for (const k of RETIRED) delete m[k];
}

function sharePassword(name: string): string | null {
  try {
    return JSON.parse(readFileSync(join(STATE_DIR, "shares", `${name}.json`), "utf8")).auth?.password ?? null;
  } catch {
    return null;
  }
}

export function usedSlots(s: State): Set<number> {
  return new Set(Object.values(s.instances).map((i) => i.slot));
}

export function slotCandidates(s: State): number[] {
  const used = usedSlots(s);
  const out: number[] = [];
  for (let n = 1; n <= MAX_SLOT; n++) if (!used.has(n)) out.push(n);
  return out;
}

export function ownerInfo(): Instance["owner"] {
  return {
    cwd: process.cwd(),
    sessionId: process.env.CLAUDE_CODE_SESSION_ID ?? process.env.CLAUDE_SESSION_ID ?? process.env.COSMOS_SESSION_ID ?? null,
    pid: process.ppid,
  };
}
