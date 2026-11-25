// The project checkout (the dir holding cosmos.yaml) and machine-local overrides in HOME/cosmos.local.yaml.
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { manifest } from "./catalog";
import { LOCAL_FILE, expandHome, projectDir } from "./paths";

export class LocalConfigError extends Error {}

// cosmos.local.yaml: machine-local overrides: envSources, share limits
export function localConfig(): { envSources?: Record<string, string>; share?: { maxShares?: number; maxNames?: number } } {
  if (!existsSync(LOCAL_FILE)) return {};
  try {
    const d = Bun.YAML.parse(readFileSync(LOCAL_FILE, "utf8")) as any;
    return d && typeof d === "object" ? d : {};
  } catch (e) {
    throw new LocalConfigError(`${LOCAL_FILE}: ${(e as Error).message}`);
  }
}

// <sourcesDir>/<repo> checkouts that are initialised
export function submoduleCount(p = projectDir()): number {
  const dir = join(p, manifest().sourcesDir);
  try {
    return readdirSync(dir).filter((s) => existsSync(join(dir, s, ".git"))).length;
  } catch {
    return 0;
  }
}

// null when the project is in a good state to build from
export function initCheck(path: string, repos: string[]): string | null {
  const sd = manifest().sourcesDir;
  const missing = repos.filter((s) => !existsSync(join(path, sd, s, ".git")));
  return missing.length ? `project submodules not initialised: ${missing.join(", ")}. Run: git -C ${path} submodule update --init ${missing.map((s) => `${sd}/${s}`).join(" ")}` : null;
}

// env bundle sources: the manifest's defaults (first existing candidate, relative to the project), overridable in cosmos.local.yaml
export function envSources(): Record<string, string> {
  const p = projectDir();
  const o = localConfig().envSources ?? {};
  const out: Record<string, string> = {};
  for (const [k, cands] of Object.entries(manifest().envSources)) {
    if (o[k]) {
      out[k] = resolve(expandHome(o[k]));
      continue;
    }
    const abs = cands.map((c) => resolve(p, expandHome(c)));
    out[k] = abs.find(existsSync) ?? abs[0];
  }
  return out;
}
