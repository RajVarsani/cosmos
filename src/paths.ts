// Three roots: the package (code, docker helpers, dashboard assets), the project (the dir holding cosmos.yaml) and
// the home (COSMOS_HOME: state, instances, envs, vendored project worktrees).
import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";

export const expandHome = (p: string) => (p === "~" ? homedir() : p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);

export const PKG_ROOT = resolve(import.meta.dir, "..");
export const HOME = resolve(expandHome(process.env.COSMOS_HOME ?? "~/.cosmos"));
export const STATE_DIR = process.env.COSMOS_STATE_DIR ?? join(HOME, ".state");
export const STATE_FILE = join(STATE_DIR, "state.json");
export const LOCK_DIR = join(STATE_DIR, "lock");
export const BUILD_LOCK_DIR = join(STATE_DIR, "build.lock");
export const INSTANCES_DIR = join(HOME, "instances");
export const ENVS_DIR = join(HOME, "envs");
export const VENDOR_ROOT = join(HOME, "vendor");
export const LOCAL_FILE = join(HOME, "cosmos.local.yaml");
export const MANIFEST_NAME = "cosmos.yaml";

export class ProjectNotFound extends Error {}

let project: string | null = null;

// --project (via COSMOS_PROJECT), else the nearest dir upward from cwd that holds cosmos.yaml
export function projectDir(): string {
  if (project) return project;
  const env = process.env.COSMOS_PROJECT;
  if (env) {
    const p = resolve(expandHome(env));
    if (!existsSync(join(p, MANIFEST_NAME))) throw new ProjectNotFound(`COSMOS_PROJECT=${p} has no ${MANIFEST_NAME}`);
    return (project = p);
  }
  for (let d = process.cwd(); ; d = dirname(d)) {
    if (existsSync(join(d, MANIFEST_NAME))) return (project = d);
    if (dirname(d) === d) break;
  }
  throw new ProjectNotFound(`no ${MANIFEST_NAME} in ${process.cwd()} or any parent; run cosmos inside a project, or pass --project <dir> (or COSMOS_PROJECT)`);
}

export const manifestPath = () => join(projectDir(), MANIFEST_NAME);
export const hasProject = () => {
  try {
    projectDir();
    return true;
  } catch {
    return false;
  }
};
