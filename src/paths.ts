// Three roots: the package (code, docker helpers, dashboard assets), the project (the dir holding cosmos.yaml) and
// the home (COSMOS_HOME): a machine registry plus one dir per project under projects/<projectId>.
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";

export const expandHome = (p: string) => (p === "~" ? homedir() : p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);

export const PKG_ROOT = resolve(import.meta.dir, "..");
export const HOME = resolve(expandHome(process.env.COSMOS_HOME ?? "~/.cosmos"));
// Machine level, shared by every cosmos version on this machine: the registry of slot and name claims and its lock
// (see registry.ts), plus machine-only files in .state (docker build lock, dashboard pid, doctor marker).
export const REGISTRY_FILE = join(HOME, "registry.json");
export const REGISTRY_LOCK_DIR = join(HOME, "registry.lock");
export const STATE_DIR = process.env.COSMOS_STATE_DIR || join(HOME, ".state");
export const BUILD_LOCK_DIR = join(STATE_DIR, "build.lock");
// the 0.1 layout, read once by migrate.ts
export const LEGACY = { stateFile: join(STATE_DIR, "state.json"), instances: join(HOME, "instances"), envs: join(HOME, "envs"), vendor: join(HOME, "vendor"), shares: join(STATE_DIR, "shares"), failures: join(STATE_DIR, "failures"), measure: join(STATE_DIR, "measure.json") };
export const COSMOS_VERSION: string = JSON.parse(readFileSync(join(PKG_ROOT, "package.json"), "utf8")).version;
// machine-local overrides; projects/<projectId>/cosmos.local.yaml overrides it key by key
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

// Project level: HOME/projects/<projectId>. Written only by the cosmos version the project pins.
let idMemo: { file: string; id: string } | null = null;
export function projectId(): string {
  const file = manifestPath();
  if (idMemo?.file === file) return idMemo.id;
  const doc = Bun.YAML.parse(readFileSync(file, "utf8")) as { projectId?: unknown } | null;
  const id = doc?.projectId;
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) throw new ProjectNotFound(`${file}: projectId must be lowercase letters, digits, dashes`);
  idMemo = { file, id };
  return id;
}
export const projectHomeOf = (id: string) => join(HOME, "projects", id);
export const projectHome = () => projectHomeOf(projectId());
export const projectStateDir = () => join(projectHome(), ".state");
export const stateFile = () => join(projectStateDir(), "state.json");
export const instancesDir = () => join(projectHome(), "instances");
export const envsDir = () => join(projectHome(), "envs");
export const vendorRoot = () => join(projectHome(), "vendor");
export const projectLocalFile = () => join(projectHome(), "cosmos.local.yaml");
