import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "fs";
import { join } from "path";
import { withLock } from "./lock";
import { COSMOS_VERSION, LEGACY, REGISTRY_LOCK_DIR, projectDir, projectId, projectStateDir, stateFile } from "./paths";
import { CosmosError } from "./errors";
import { checkVersion, foreignClaims, prefixOf, readRegistry, reconcile, writeRegistry, type Claim } from "./registry";
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
// writtenBy: the cosmos version that last wrote the file; an older cosmos outside its caret range refuses it
// machine: other projects' slot and name claims from the registry (never persisted); slots and names they hold are not free
export type State = { version: 1; writtenBy?: string; instances: Record<string, Instance>; pendingRelease?: string[]; machine?: Claim[] };
export const STATE_VERSION = 1;

const LOCK_OPTS = { staleMs: 10 * 60_000, waitMs: 120_000 };

// Holds the machine lock for the whole callback (slot and name claims are arbitrated across projects); state mutations
// are persisted atomically to the project's state file, and this project's claims are synced to the registry on return.
export async function withState<T>(fn: (s: State) => Promise<T> | T): Promise<T> {
  return withLock(REGISTRY_LOCK_DIR, LOCK_OPTS, () => mutateState(fn));
}

// withState for a caller that already holds the registry lock
export async function mutateState<T>(fn: (s: State) => Promise<T> | T): Promise<T> {
  const s = readState();
  const out = await fn(s);
  writeState(s);
  const next = reconcile(readRegistry(), { id: projectId(), dir: projectDir() }, Object.values(s.instances));
  if (next) writeRegistry(next);
  return out;
}

function writeState(s: State): void {
  const file = stateFile();
  mkdirSync(projectStateDir(), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  s.writtenBy = COSMOS_VERSION;
  writeFileSync(tmp, JSON.stringify(s, (k, v) => (k === "machine" ? undefined : k === "share" && v && typeof v === "object" ? { ...v, password: undefined } : v), 2) + "\n");
  renameSync(tmp, file);
}

// a state file written by a newer cosmos than this one's caret range (0.3.x for 0.2.x) is refused, not guessed at
export function checkWriter(file: string, writtenBy: unknown, ours = COSMOS_VERSION): void {
  if (typeof writtenBy !== "string" || !Bun.semver.satisfies(writtenBy, "*")) return;
  if (Bun.semver.order(writtenBy, ours) > 0 && !Bun.semver.satisfies(writtenBy, `^${ours}`))
    throw new CosmosError(`${file} was written by cosmos ${writtenBy}; this is ${ours}. Upgrade it: bun add -d @rajvarsani/cosmos@^${writtenBy}`);
}

// 0.1 instances no project has migrated yet (another project's): their slots and names stay taken
function legacyClaims(): Claim[] {
  if (!existsSync(LEGACY.stateFile)) return [];
  try {
    const l = JSON.parse(readFileSync(LEGACY.stateFile, "utf8"));
    return Object.values<any>(l.instances ?? {}).map((i) => ({ projectId: "(cosmos 0.1)", projectDir: "", instance: i.name, slot: i.slot, prefix: prefixOf(i.name), pid: i.owner?.pid ?? 0, at: i.createdAt ?? "" }));
  } catch {
    return [];
  }
}

const withMachine = (s: State): State => Object.defineProperty(s, "machine", { value: [...foreignClaims(readRegistry(), projectId()), ...legacyClaims()], enumerable: false, writable: true, configurable: true });

export function readState(): State {
  const file = stateFile();
  if (!existsSync(file)) return withMachine({ version: 1, instances: {} });
  const s: State = JSON.parse(readFileSync(file, "utf8"));
  checkVersion("state", file, s.version, STATE_VERSION);
  checkWriter(file, s.writtenBy);
  withMachine(s);
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
    return JSON.parse(readFileSync(join(projectStateDir(), "shares", `${name}.json`), "utf8")).auth?.password ?? null;
  } catch {
    return null;
  }
}

export function usedSlots(s: State): Set<number> {
  return new Set([...Object.values(s.instances).map((i) => i.slot), ...(s.machine ?? []).map((c) => c.slot)]);
}

// instance names other projects hold: container names are machine-wide, so these are not free here
export const reservedNames = (s: State): string[] => (s.machine ?? []).map((c) => c.instance);

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
