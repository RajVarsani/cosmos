// The machine registry: HOME/.state/registry.json. The only file every cosmos version on a machine must agree on.
// It records which slot and instance name each project holds, so two projects never take the same host ports or
// container names. Project state (instances, envs, vendor worktrees) lives under HOME/projects/<projectId>.
//
// Compatibility rules: additive-only. A writer keeps fields it does not know; a reader refuses a higher major version.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { CosmosError } from "./errors";
import { REGISTRY_FILE, STATE_DIR } from "./paths";

export const REGISTRY_VERSION = 1;

export type Claim = { projectId: string; instance: string; slot: number; at: string };
export type Registry = { version: number; claims: Record<string, Claim>; [unknown: string]: unknown };

export const claimKey = (projectId: string, instance: string) => `${projectId}/${instance}`;

// refuse data written by a newer major version instead of guessing at it
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
  return { ...r, claims: r.claims && typeof r.claims === "object" ? r.claims : {} };
}

export function readRegistry(): Registry {
  return existsSync(REGISTRY_FILE) ? parseRegistry(readFileSync(REGISTRY_FILE, "utf8")) : { version: REGISTRY_VERSION, claims: {} };
}

// Makes this project's claims match its instances and drops claims of projects whose state is gone. Pure: returns the
// registry to write, or null when nothing changed.
export function reconcile(reg: Registry, projectId: string, instances: { name: string; slot: number }[], projectAlive: (id: string) => boolean, now = new Date().toISOString()): Registry | null {
  const claims: Record<string, Claim> = {};
  let changed = false;
  for (const [k, c] of Object.entries(reg.claims)) {
    if (c.projectId === projectId) {
      if (!instances.some((i) => claimKey(projectId, i.name) === k && i.slot === c.slot)) changed = true;
      else claims[k] = c;
    } else if (projectAlive(c.projectId)) claims[k] = c;
    else changed = true;
  }
  for (const i of instances) {
    const k = claimKey(projectId, i.name);
    if (!claims[k]) {
      claims[k] = { projectId, instance: i.name, slot: i.slot, at: now };
      changed = true;
    }
  }
  return changed ? { ...reg, claims } : null;
}

export const foreignClaims = (reg: Registry, projectId: string): Claim[] => Object.values(reg.claims).filter((c) => c.projectId !== projectId);

export function writeRegistry(reg: Registry): void {
  mkdirSync(STATE_DIR, { recursive: true });
  const tmp = `${REGISTRY_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(reg, null, 2) + "\n");
  renameSync(tmp, REGISTRY_FILE);
}
