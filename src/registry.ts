// The machine registry: HOME/registry.json, guarded by HOME/registry.lock. The only file every cosmos version on a
// machine must agree on. It records which slot, instance name (container-name prefix) and zrok name each project holds,
// so two projects never take the same host ports or container names. Project state lives under HOME/projects/<projectId>.
//
// Compatibility: additive-only. A writer keeps fields it does not know (top level and inside claims); a reader refuses a
// higher version. Bump REGISTRY_VERSION only for a change an older cosmos would misread.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import { CosmosError } from "./errors";
import { REGISTRY_FILE } from "./paths";

export const REGISTRY_VERSION = 1;

export type Claim = {
  projectId: string;
  // the project checkout; doctor reaps the claim once its cosmos.yaml is gone
  projectDir: string;
  instance: string;
  slot: number;
  // every container and the compose project of the instance start with this
  prefix: string;
  // the instance owner's pid when it was claimed
  pid: number;
  zrok?: string[];
  at: string;
  [unknown: string]: unknown;
};
export type Registry = { version: number; claims: Record<string, Claim>; [unknown: string]: unknown };
export type OwnInstance = { name: string; slot: number; owner?: { pid: number }; shareName?: { name: string } };

export const claimKey = (projectId: string, instance: string) => `${projectId}/${instance}`;
export const prefixOf = (instance: string) => `cosmos-${instance}`;

// refuse data written by a newer version instead of guessing at it
export function checkVersion(what: string, file: string, found: unknown, supported: number): void {
  if (typeof found !== "number" || !Number.isInteger(found) || found < 1) throw new CosmosError(`${file}: missing or invalid ${what} version`);
  if (found > supported)
    throw new CosmosError(`${file} is ${what} version ${found}; this cosmos reads version ${supported}. Upgrade it: bun add -d @rajvarsani/cosmos@latest`);
}

export function parseRegistry(text: string, file = REGISTRY_FILE): Registry {
  let r: any;
  try {
    r = JSON.parse(text);
  } catch (e) {
    throw new CosmosError(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  if (!r || typeof r !== "object" || Array.isArray(r)) throw new CosmosError(`${file}: expected an object`);
  checkVersion("registry", file, r.version, REGISTRY_VERSION);
  return { ...r, claims: r.claims && typeof r.claims === "object" && !Array.isArray(r.claims) ? r.claims : {} };
}

export function readRegistry(file = REGISTRY_FILE): Registry {
  return existsSync(file) ? parseRegistry(readFileSync(file, "utf8"), file) : { version: REGISTRY_VERSION, claims: {} };
}

const same = (a: Claim, b: Claim) => a.projectDir === b.projectDir && a.slot === b.slot && a.prefix === b.prefix && a.pid === b.pid && JSON.stringify(a.zrok ?? []) === JSON.stringify(b.zrok ?? []);

// Makes this project's claims match its instances. Never touches another project's claims (only doctor reaps those).
// Pure: returns the registry to write, or null when nothing changed.
export function reconcile(reg: Registry, project: { id: string; dir: string }, instances: OwnInstance[], now = new Date().toISOString()): Registry | null {
  const claims: Record<string, Claim> = {};
  let changed = false;
  const mine = new Map(instances.map((i) => [claimKey(project.id, i.name), i]));
  for (const [k, c] of Object.entries(reg.claims)) {
    if (c.projectId !== project.id) claims[k] = c;
    else if (!mine.has(k)) changed = true;
  }
  for (const [k, i] of mine) {
    const old = reg.claims[k];
    const want: Claim = { ...old, projectId: project.id, projectDir: project.dir, instance: i.name, slot: i.slot, prefix: prefixOf(i.name), pid: i.owner?.pid ?? old?.pid ?? 0, at: old?.at ?? now };
    if (i.shareName) want.zrok = [i.shareName.name];
    else delete want.zrok;
    if (old && same(old, want)) claims[k] = old;
    else {
      claims[k] = { ...want, at: now };
      changed = true;
    }
  }
  return changed ? { ...reg, version: Math.max(reg.version, REGISTRY_VERSION), claims } : null;
}

export const foreignClaims = (reg: Registry, projectId: string): Claim[] => Object.values(reg.claims).filter((c) => c.projectId !== projectId);

// Claims of other projects that are provably dead: the project checkout is gone, or no container carries the prefix and
// the owning project's state no longer lists the instance. Pure: the caller supplies the probes.
export function reapable(reg: Registry, projectId: string, probe: { projectGone: (c: Claim) => boolean; containersGone: (c: Claim) => boolean; stateLists: (c: Claim) => boolean | null }): { key: string; claim: Claim; why: string }[] {
  const out: { key: string; claim: Claim; why: string }[] = [];
  for (const [key, c] of Object.entries(reg.claims)) {
    if (c.projectId === projectId) continue;
    if (probe.projectGone(c)) out.push({ key, claim: c, why: `project ${c.projectDir} is gone` });
    else if (probe.containersGone(c) && probe.stateLists(c) === false) out.push({ key, claim: c, why: `no ${c.prefix}-* containers and ${c.projectId} no longer has ${c.instance}` });
  }
  return out;
}

export function writeRegistry(reg: Registry, file = REGISTRY_FILE): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(reg, null, 2) + "\n");
  renameSync(tmp, file);
}
