// The project manifest (cosmos.yaml): services, backends, profiles, login and extras. Pure data plus validation.
import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { COSMOS_VERSION, manifestPath, projectDir, vendorRoot } from "./paths";
import { parseRecipe, parseTop } from "./recipe-parse";

export type SvcKind = "infra" | "init" | "app" | "fe";

export type SvcDef = {
  svc: string;
  kind: SvcKind;
  // slot offset of the main port (host port = base + stride * slot + offset)
  offset?: number;
  containerPort?: number;
  extraPorts?: { key: string; offset: number; containerPort: number }[];
  // HTTP path probed for health; null means use docker's own health status.
  health?: string | null;
  // Where the instance worktree is bind-mounted live; null = baked into the image.
  srcMount?: string | null;
  go?: boolean;
  // Go main package dir, tried at build time before "."
  goMain?: string;
  // Rough steady-state memory, MiB; replaced by measurements once cosmos has seen the profile run.
  estMiB: number;
  // source repo dir under sourcesDir when it differs from the image/source service
  repo?: string;
  // runs another service's image and source (a one-shot that reuses an app's build)
  uses?: string;
  // the project's own host port for this service, so localhost:<hostPort> in env values moves to the slot port
  hostPort?: number;
  // a browser origin: backends that check origins allowlist it
  origin?: boolean;
  // fe only: may run against a deployed backend (default true)
  remote?: boolean;
  // fe readiness path on start (default "/")
  ready?: string;
  // address shown for the port; {port} is replaced
  url?: string;
  // portless processes that must be alive for the service to work
  workers?: { name: string; match: RegExp }[];
  // deps installed into the instance's volumes when the checkout's lockfile changes: the first entry whose lockfile exists
  syncDeps?: SyncDeps[];
  // not a compose service: an extras entry cosmos vendors and runs from this definition
  extra?: string;
  dependsOn?: string[];
  calledBy?: string[];
  // environment merged over the compose service's (templates; {value, if, else} for conditional values)
  env?: Record<string, EnvValue>;
  // volumes added to the compose service's, compose short syntax with templates
  volumes?: string[];
  command?: string[];
  // per-checkout vars ({{layout.<name>}}): the first entry whose `when` file exists in the service's checkout
  layouts?: { when?: string; vars: Record<string, string> }[];
  // the image: a tag keyed on these files' contents (a|b: the first that exists), shared by every instance
  image?: { hashFiles: string[]; shared: boolean };
  // fe only: the env its browser code reads, written to an env file the container loads
  browser?: { keys: string[]; keysIn?: string; files: { local: string[]; remote: string[] } };
  preview?: Preview;
  share?: { about?: KindText; notice?: KindText };
  // go under air: build the compose build's target instead of cosmos's go-air image, and these build/run commands
  air?: { target?: string; build?: string; run?: string };
  // init: skipped on an existing instance when this file exists in the instance dir
  skipIfExists?: string;
  // init: a non-zero exit whose logs match is a warning, not a failed start
  softFail?: { match: RegExp; warning: string };
  // restarted once when any of its workers is dead after this init service finished
  restartDeadWorkersAfter?: string;
};

export type EnvValue = string | { value: string; if?: string[]; else?: string };
export type KindText = { local?: string; remote?: string };
export type SyncDeps = { lockfile: string; run: string[]; entrypoint?: string; caches: Record<string, string>; env: Record<string, string> };
export type Preview = { out: string; viteTemp: string; command: string; mkOut: boolean; needMiB: number; dropEnv: string[]; mode: { local?: "production" | "development"; remote?: "production" | "development" } };
export type Requirement = { file: string; fix?: string };
export type DerivedVar = { service: string; file: string; match: string };
export type Secret = { service: string; file: string; keys: string[]; command: string[]; fix?: string };
export type SeedSpec = { service: string; requires: string[]; counts?: { service: string; command: string[]; stdin?: string } };
export type ShareSpec = { reach: { local?: string[]; remote?: string[] }; block: { local?: { service: string; prefixes: string[] }[]; remote?: { service: string; prefixes: string[] }[] } };
export type DashboardSpec = {
  backends?: Record<string, { c: string; core: string; star: number; guard?: boolean }>;
  services?: Record<string, string>;
  looks?: Record<string, { k: number; tilt: number; spin: number; atm: string | null; atmK: number; atmR?: number; ring?: boolean }>;
  steps?: { match: string; text: string; svc?: string }[];
  pins?: string[];
};

export type Backend = { id: string; kind: "remote" | "local"; aliases: string[]; live: boolean; vars: Record<string, string> };

export type Profile = {
  id: string;
  backendKind: "remote" | "local";
  // remote profiles may be limited to some backends; null = any backend of that kind
  backends: string[] | null;
  services: string[];
  title: string;
  about: string;
  default: boolean;
  line: number;
};

export type LoginConfig = { email: string; password: string; firstName?: string; lastName?: string };
export type Extra = { id: string; url: string; ref: string; sha: string; dockerfile: string };
export type Stage = { id: string; services: string[] };

export type Manifest = {
  file: string;
  projectId: string;
  compose: string;
  sourcesDir: string;
  network: string | null;
  composeEnvFiles: { prefix: string; bundle: string } | null;
  envSources: Record<string, string[]>;
  // which files of an env source get copied into HOME/envs/<bundle> (globs; none = all)
  envInclude: Record<string, string[]>;
  vars: Record<string, DerivedVar>;
  requires: { local: Requirement[]; remote: Requirement[] };
  backendHost: { file: string; key: string } | null;
  secrets: Secret[];
  seed: SeedSpec | null;
  share: ShareSpec;
  hooks: { beforeDown?: string };
  dashboard: DashboardSpec;
  prefetch: string[];
  defaults: { backend: string | null; profile: string | null; build: string | null };
  services: SvcDef[];
  backends: Backend[];
  stages: Stage[];
  legacyProfiles: Record<string, string>;
  retiredServices: string[];
  login: LoginConfig | null;
  images: Record<string, string>;
  extras: Extra[];
  profiles: Profile[];
  warnings: string[];
};

export class ConfigError extends Error {}

// cosmos's own: the Caddy edge in front of a remote backend (ports are per upstream host, see edge.ts)
export const EDGE_SVC = "edge";
const EDGE_DEF: SvcDef = { svc: EDGE_SVC, kind: "app", health: null, estMiB: 30 };
// offsets cosmos keeps for itself: the edge listeners and the share proxy
export const RESERVED_OFFSETS = { edge: [40, 49], share: 60 } as const;

const TOP_KEYS = ["schemaVersion", "cosmos", "projectId", "compose", "sourcesDir", "network", "composeEnvFiles", "envSources", "prefetch", "defaults", "vars", "requires", "backendHost", "secrets", "services", "backends", "stages", "seed", "share", "hooks", "legacyProfiles", "retiredServices", "login", "images", "extras", "dashboard", "profiles"];
const SVC_KEYS = ["kind", "offset", "containerPort", "extraPorts", "health", "srcMount", "go", "goMain", "estMiB", "repo", "uses", "hostPort", "origin", "remote", "ready", "url", "workers", "syncDeps", "extra", "dependsOn", "calledBy", "env", "volumes", "command", "layouts", "image", "browser", "preview", "share", "air", "skipIfExists", "softFail", "restartDeadWorkersAfter"];
// words an `if:` may use besides service names
export const IF_WORDS = ["local", "remote", "poll"];
const PROFILE_KEYS = ["title", "about", "backend", "default", "services"];
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&");

let cached: { file: string; mtime: number; m: Manifest } | null = null;

export function manifest(): Manifest {
  const file = manifestPath();
  if (!existsSync(file)) throw new ConfigError(`${file} is missing`);
  const mtime = statSync(file).mtimeMs;
  if (cached && cached.file === file && cached.mtime === mtime) return cached.m;
  const m = parse(file, readFileSync(file, "utf8"));
  cached = { file, mtime, m };
  return m;
}

function parse(file: string, text: string): Manifest {
  const lines = text.split("\n");
  const lineOf = (re: RegExp, from = 0) => {
    for (let k = from; k < lines.length; k++) if (re.test(lines[k])) return k + 1;
    return from + 1;
  };
  const keyLine = (key: string, indent: number, from = 0) => lineOf(new RegExp(`^\\s{${indent}}${reEsc(key)}:`), from);
  const at = (n: number) => `${file}:${n}`;
  const fail = (n: number, msg: string): never => {
    throw new ConfigError(`${at(n)}: ${msg}`);
  };
  let doc: any;
  try {
    doc = Bun.YAML.parse(text);
  } catch (e) {
    throw new ConfigError(`${file}: ${(e as Error).message}`);
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) fail(1, "expected a map at the top level");
  if (doc.adapter !== undefined) fail(keyLine("adapter", 0), `"adapter" is gone in cosmos 0.4: everything project-specific is data in cosmos.yaml. See the 0.3 to 0.4 migration in the cosmos README`);
  for (const k of Object.keys(doc)) if (!TOP_KEYS.includes(k)) fail(keyLine(k, 0), `unknown top-level key "${k}" (allowed: ${TOP_KEYS.join(", ")})`);
  if (typeof doc.schemaVersion === "number" && doc.schemaVersion > 1) fail(keyLine("schemaVersion", 0), `schemaVersion ${doc.schemaVersion} is newer than this cosmos reads (1); installed ${COSMOS_VERSION}. Update it: bun add -g @rajvarsani/cosmos@latest`);
  if (doc.schemaVersion !== 1) fail(keyLine("schemaVersion", 0), `schemaVersion must be 1 (this cosmos reads version 1)`);
  if (doc.cosmos !== undefined) {
    const range = typeof doc.cosmos === "string" && doc.cosmos ? doc.cosmos : fail(keyLine("cosmos", 0), "cosmos must be a semver range such as \">=0.2.0\"");
    let ok = false;
    try {
      ok = Bun.semver.satisfies(COSMOS_VERSION, range);
    } catch {
      fail(keyLine("cosmos", 0), `cosmos: "${range}" is not a semver range`);
    }
    if (!ok) fail(keyLine("cosmos", 0), `this project needs cosmos ${range}; installed ${COSMOS_VERSION}. Update it: bun add -g @rajvarsani/cosmos@latest`);
  }
  const str = (k: string, v: unknown, line: number) => (typeof v === "string" && v ? v : fail(line, `${k} must be a non-empty string`));
  const strList = (k: string, v: unknown, line: number): string[] => (Array.isArray(v) && v.every((x) => typeof x === "string") ? v : fail(line, `${k} must be a list of strings`));
  const map = (k: string, v: unknown, line: number): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? v : fail(line, `${k} must be a map`));

  const projectId = str("projectId", doc.projectId, keyLine("projectId", 0));
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(projectId)) fail(keyLine("projectId", 0), "projectId must be lowercase letters, digits, dashes");
  const compose = str("compose", doc.compose ?? "docker-compose.yml", keyLine("compose", 0));
  const sourcesDir = str("sourcesDir", doc.sourcesDir ?? "services", keyLine("sourcesDir", 0));
  const network = doc.network === undefined ? null : str("network", doc.network, keyLine("network", 0));
  let composeEnvFiles: Manifest["composeEnvFiles"] = null;
  if (doc.composeEnvFiles !== undefined) {
    const n = keyLine("composeEnvFiles", 0);
    const c = map("composeEnvFiles", doc.composeEnvFiles, n);
    composeEnvFiles = { prefix: str("composeEnvFiles.prefix", c.prefix, n), bundle: str("composeEnvFiles.bundle", c.bundle, n) };
  }
  const envSources: Record<string, string[]> = {};
  const envInclude: Record<string, string[]> = {};
  if (doc.envSources !== undefined) {
    const n = keyLine("envSources", 0);
    for (const [k, v] of Object.entries(map("envSources", doc.envSources, n))) {
      const kl = keyLine(k, 2, n - 1);
      if (!/^[a-z0-9][a-z0-9._-]*$/i.test(k)) fail(kl, `envSources key "${k}" must be a plain folder name`);
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const x of Object.keys(v)) if (!["from", "include"].includes(x)) fail(kl, `envSources.${k}: unknown key "${x}" (allowed: from, include)`);
        envSources[k] = typeof (v as any).from === "string" ? [(v as any).from] : strList(`envSources.${k}.from`, (v as any).from, kl);
        if ((v as any).include !== undefined) envInclude[k] = strList(`envSources.${k}.include`, (v as any).include, kl);
      } else envSources[k] = typeof v === "string" ? [v] : strList(`envSources.${k}`, v, kl);
    }
  }
  const prefetch = doc.prefetch === undefined ? [] : strList("prefetch", doc.prefetch, keyLine("prefetch", 0));
  const dflt = doc.defaults === undefined ? {} : map("defaults", doc.defaults, keyLine("defaults", 0));
  for (const k of Object.keys(dflt)) if (!["backend", "profile", "build"].includes(k)) fail(keyLine(k, 2, keyLine("defaults", 0) - 1), `defaults: unknown key "${k}" (allowed: backend, profile, build)`);
  const defaults = { backend: dflt.backend ?? null, profile: dflt.profile ?? null, build: dflt.build ?? null };

  // ---------- services ----------
  const svcLine0 = keyLine("services", 0);
  const rawSvcs = map("services", doc.services, svcLine0);
  const services: SvcDef[] = [];
  const offsetOwner = new Map<number, string>();
  const claim = (off: unknown, who: string, line: number) => {
    if (typeof off !== "number" || !Number.isInteger(off) || off < 0 || off > 99) fail(line, `${who}: offset must be an integer 0-99`);
    const o = off as number;
    if (o >= RESERVED_OFFSETS.edge[0] && o <= RESERVED_OFFSETS.edge[1]) fail(line, `${who}: offset ${o} is reserved by cosmos for edge listeners (${RESERVED_OFFSETS.edge.join("-")})`);
    if (o === RESERVED_OFFSETS.share) fail(line, `${who}: offset ${o} is reserved by cosmos for the share proxy`);
    if (offsetOwner.has(o)) fail(line, `${who}: offset ${o} is already taken by ${offsetOwner.get(o)}`);
    offsetOwner.set(o, who);
    return o;
  };
  for (const [svc, raw] of Object.entries<any>(rawSvcs)) {
    const line = keyLine(svc, 2, svcLine0 - 1);
    if (svc === EDGE_SVC) fail(line, `"${EDGE_SVC}" is cosmos's own service; pick another name`);
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(svc)) fail(line, `service name "${svc}" must be lowercase letters, digits, dashes`);
    const r = map(`services.${svc}`, raw, line);
    const sub = (k: string) => keyLine(k, 4, line - 1);
    for (const k of Object.keys(r)) if (!SVC_KEYS.includes(k)) fail(sub(k), `service ${svc}: unknown key "${k}" (allowed: ${SVC_KEYS.join(", ")})`);
    if (!["infra", "init", "app", "fe"].includes(r.kind)) fail(sub("kind"), `service ${svc}: kind must be infra, init, app or fe`);
    if (typeof r.estMiB !== "number") fail(sub("estMiB"), `service ${svc}: estMiB must be a number`);
    const d: SvcDef = { svc, kind: r.kind, estMiB: r.estMiB };
    if (r.offset !== undefined) d.offset = claim(r.offset, svc, sub("offset"));
    if (r.containerPort !== undefined) d.containerPort = Number(r.containerPort);
    if ((d.offset === undefined) !== (d.containerPort === undefined)) fail(line, `service ${svc}: offset and containerPort go together`);
    if (r.extraPorts !== undefined) {
      if (!Array.isArray(r.extraPorts)) fail(sub("extraPorts"), `service ${svc}: extraPorts must be a list of {key, offset, containerPort}`);
      d.extraPorts = r.extraPorts.map((x: any) => ({ key: str(`${svc}.extraPorts.key`, x?.key, sub("extraPorts")), offset: claim(x?.offset, `${svc}:${x?.key}`, sub("extraPorts")), containerPort: Number(x?.containerPort) }));
    }
    if (r.health !== undefined) d.health = r.health === null ? null : str(`${svc}.health`, r.health, sub("health"));
    if (r.srcMount !== undefined) d.srcMount = r.srcMount === null ? null : str(`${svc}.srcMount`, r.srcMount, sub("srcMount"));
    for (const k of ["go", "origin", "remote"] as const) if (r[k] !== undefined) {
      if (typeof r[k] !== "boolean") fail(sub(k), `service ${svc}: ${k} must be true or false`);
      (d as any)[k] = r[k];
    }
    for (const k of ["goMain", "repo", "uses", "ready", "url", "extra"] as const) if (r[k] !== undefined) (d as any)[k] = str(`${svc}.${k}`, r[k], sub(k));
    if (r.hostPort !== undefined) d.hostPort = Number(r.hostPort);
    if (r.workers !== undefined) {
      if (!Array.isArray(r.workers)) fail(sub("workers"), `service ${svc}: workers must be a list of {name, match}`);
      d.workers = r.workers.map((w: any) => {
        try {
          return { name: str(`${svc}.workers.name`, w?.name, sub("workers")), match: new RegExp(str(`${svc}.workers.match`, w?.match, sub("workers"))) };
        } catch (e) {
          throw e instanceof ConfigError ? e : new ConfigError(`${at(sub("workers"))}: service ${svc}: bad worker match: ${(e as Error).message}`);
        }
      });
    }
    if (r.dependsOn !== undefined) d.dependsOn = strList(`${svc}.dependsOn`, r.dependsOn, sub("dependsOn"));
    if (r.calledBy !== undefined) d.calledBy = strList(`${svc}.calledBy`, r.calledBy, sub("calledBy"));
    parseRecipe(d, r, sub, { str, strList, map, fail });
    services.push(d);
  }
  const names = new Set(services.map((s) => s.svc));
  for (const w of IF_WORDS) if (names.has(w)) fail(keyLine(w, 2, svcLine0 - 1), `service name "${w}" is reserved (an if: word)`);
  for (const d of services) {
    const line = keyLine(d.svc, 2, svcLine0 - 1);
    for (const k of ["uses", ...(d.dependsOn ?? []), ...(d.calledBy ?? []), ...(d.restartDeadWorkersAfter ? [d.restartDeadWorkersAfter] : [])]) {
      const ref = k === "uses" ? d.uses : k;
      if (ref && !names.has(ref)) fail(line, `service ${d.svc}: refers to unknown service "${ref}"`);
    }
    for (const v of Object.values(d.env ?? {})) for (const w of typeof v === "object" ? v.if ?? [] : []) {
      const t = w.replace(/^!/, "");
      if (!IF_WORDS.includes(t) && !names.has(t)) fail(line, `service ${d.svc}: if "${w}" is not a service or one of ${IF_WORDS.join(", ")}`);
    }
  }
  services.push(EDGE_DEF);

  // ---------- backends ----------
  const bLine0 = keyLine("backends", 0);
  const backends: Backend[] = [];
  for (const [id, raw] of Object.entries<any>(map("backends", doc.backends, bLine0))) {
    const line = keyLine(id, 2, bLine0 - 1);
    const r = map(`backends.${id}`, raw ?? {}, line);
    for (const k of Object.keys(r)) if (!["kind", "aliases", "live", "vars"].includes(k)) fail(keyLine(k, 4, line - 1), `backend ${id}: unknown key "${k}" (allowed: kind, aliases, live, vars)`);
    if (!["remote", "local"].includes(r.kind)) fail(line, `backend ${id}: kind must be remote or local`);
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.vars ?? {})) vars[k] = String(v);
    backends.push({ id, kind: r.kind, aliases: r.aliases ? strList(`${id}.aliases`, r.aliases, line) : [], live: !!r.live, vars });
  }
  if (!backends.length) fail(bLine0, "backends must name at least one backend");

  // ---------- stages, legacy names, login, images, extras ----------
  const stages: Stage[] = [];
  if (doc.stages !== undefined) {
    const n = keyLine("stages", 0);
    if (!Array.isArray(doc.stages)) fail(n, "stages must be a list of {id, services}");
    for (const s of doc.stages) {
      const id = str("stages.id", s?.id, n);
      const svcs = strList(`stages.${id}.services`, s?.services, n);
      for (const x of svcs) if (!names.has(x)) fail(lineOf(new RegExp(`\\b${reEsc(x)}\\b`), n - 1), `stage ${id}: unknown service "${x}"`);
      stages.push({ id, services: svcs });
    }
  }
  const legacyProfiles: Record<string, string> = {};
  if (doc.legacyProfiles !== undefined) for (const [k, v] of Object.entries(map("legacyProfiles", doc.legacyProfiles, keyLine("legacyProfiles", 0)))) legacyProfiles[k] = String(v);
  const retiredServices = doc.retiredServices === undefined ? [] : strList("retiredServices", doc.retiredServices, keyLine("retiredServices", 0));
  let login: LoginConfig | null = null;
  if (doc.login !== undefined) {
    const n = keyLine("login", 0);
    const l = map("login", doc.login, n);
    for (const k of Object.keys(l)) if (!["email", "password", "firstName", "lastName"].includes(k)) fail(n, `login: unknown key "${k}" (allowed: email, password, firstName, lastName)`);
    login = { email: str("login.email", l.email, n), password: str("login.password", l.password, n) };
    if (l.firstName !== undefined) login.firstName = str("login.firstName", l.firstName, n);
    if (l.lastName !== undefined) login.lastName = str("login.lastName", l.lastName, n);
  }
  const images: Record<string, string> = {};
  if (doc.images !== undefined) {
    const n = keyLine("images", 0);
    for (const [k, v] of Object.entries(map("images", doc.images, n))) images[k] = str(`images.${k}`, v, keyLine(k, 2, n - 1));
  }
  const extras: Extra[] = [];
  if (doc.extras !== undefined) {
    const n = keyLine("extras", 0);
    for (const [id, raw] of Object.entries<any>(map("extras", doc.extras, n))) {
      const line = keyLine(id, 2, n - 1);
      const r = map(`extras.${id}`, raw, line);
      if (id === projectId) fail(line, `extras.${id}: an extra cannot share the project id (both vendor into <home>/projects/<projectId>/vendor/<id>)`);
      const sha = str(`extras.${id}.sha`, r.sha, line);
      if (!/^[0-9a-f]{40}$/.test(sha)) fail(line, `extras.${id}.sha must be a full commit sha`);
      extras.push({ id, url: str(`extras.${id}.url`, r.url, line), ref: String(r.ref ?? ""), sha, dockerfile: String(r.dockerfile ?? "Dockerfile") });
    }
  }
  for (const d of services) if (d.extra && !extras.some((x) => x.id === d.extra)) fail(keyLine(d.svc, 2, svcLine0 - 1), `service ${d.svc}: extra "${d.extra}" is not in extras`);

  const top = parseTop(doc, names, keyLine, { str, strList, map, fail });
  const base: Omit<Manifest, "profiles" | "warnings"> = {
    file, projectId, compose, sourcesDir, network, composeEnvFiles, envSources, envInclude, prefetch, defaults, services, backends, stages, legacyProfiles, retiredServices, login, images, extras, ...top,
  };
  const { profiles, warnings } = parseProfiles(base, doc.profiles, lineOf, at);
  return { ...base, profiles, warnings };
}

// Hard dependencies from the project's compose (depends_on), and soft ones: http://<svc>: URLs in a service's environment,
// plus the manifest's dependsOn and calledBy for services that are not in the compose file.
export function composeDeps(m: Pick<Manifest, "services" | "compose" | "projectId">, composeFile = join(vendorRoot(), m.projectId, m.compose)): { hard: Record<string, string[]>; calls: Record<string, string[]> } {
  const hard: Record<string, string[]> = {};
  const calls: Record<string, string[]> = {};
  const file = existsSync(composeFile) ? composeFile : join(projectDir(), m.compose);
  if (existsSync(file)) {
    const doc = Bun.YAML.parse(readFileSync(file, "utf8")) as { services: Record<string, any> };
    const names = Object.keys(doc.services ?? {});
    for (const [svc, g] of Object.entries(doc.services ?? {})) {
      const d = g.depends_on;
      hard[svc] = Array.isArray(d) ? d : Object.keys(d ?? {});
      const env = Object.values(g.environment ?? {}).map(String).join(" ");
      calls[svc] = names.filter((n) => n !== svc && !hard[svc].includes(n) && new RegExp(`https?://${n}:\\d`).test(env));
    }
  }
  for (const s of m.services) {
    if (s.dependsOn) hard[s.svc] = [...(hard[s.svc] ?? []), ...s.dependsOn];
    for (const caller of s.calledBy ?? []) calls[caller] = [...new Set([...(calls[caller] ?? []), s.svc])];
  }
  return { hard, calls };
}

function parseProfiles(m: Omit<Manifest, "profiles" | "warnings">, raw: any, lineOf: (re: RegExp, from?: number) => number, at: (n: number) => string): { profiles: Profile[]; warnings: string[] } {
  const p0 = lineOf(/^profiles:/);
  if (!raw || typeof raw !== "object") throw new ConfigError(`${at(p0)}: expected a top-level "profiles:" map`);
  const def = (s: string) => m.services.find((x) => x.svc === s)!;
  const known = new Set(m.services.map((s) => s.svc).filter((s) => s !== EDGE_SVC));
  const remoteIds = new Set(m.backends.filter((b) => b.kind === "remote").flatMap((b) => [b.id, ...b.aliases]));
  const remoteFes = m.services.filter((s) => s.kind === "fe" && s.remote !== false).map((s) => s.svc);
  const { hard, calls } = composeDeps(m);
  const profiles: Profile[] = [];
  const warnings: string[] = [];
  for (const [id, r] of Object.entries<any>(raw)) {
    const line = lineOf(new RegExp(`^\\s{2}${reEsc(id)}:`), p0 - 1);
    if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(id)) throw new ConfigError(`${at(line)}: profile name "${id}" must be lowercase letters, digits, dashes`);
    if (m.legacyProfiles[id]) throw new ConfigError(`${at(line)}: "${id}" is a retired profile name (it now means ${m.legacyProfiles[id]}); pick another`);
    if (!r || typeof r !== "object" || Array.isArray(r)) throw new ConfigError(`${at(line)}: profile ${id} must be a map (title, about, backend, default, services)`);
    for (const k of Object.keys(r)) if (!PROFILE_KEYS.includes(k)) throw new ConfigError(`${at(lineOf(new RegExp(`^\\s+${reEsc(k)}:`), line - 1))}: profile ${id}: unknown key "${k}" (allowed: ${PROFILE_KEYS.join(", ")})`);
    const svcLine = lineOf(/^\s+services:/, line - 1);
    const services: unknown = r.services;
    if (!Array.isArray(services) || !services.length || services.some((s) => typeof s !== "string")) throw new ConfigError(`${at(svcLine)}: profile ${id}: services must be a non-empty list of service names`);
    for (const s of services as string[]) if (!known.has(s)) throw new ConfigError(`${at(lineOf(new RegExp(`\\b${reEsc(s)}\\b`), line - 1))}: profile ${id}: unknown service "${s}" (the manifest has: ${[...known].join(", ")})`);
    const b = r.backend ?? "remote";
    let backendKind: Profile["backendKind"];
    let backends: string[] | null = null;
    if (b === "local" || b === "remote") backendKind = b;
    else if (Array.isArray(b) && b.length && b.every((x) => remoteIds.has(x))) {
      backendKind = "remote";
      backends = b.map((x: string) => m.backends.find((y) => y.id === x || y.aliases.includes(x))!.id);
    } else throw new ConfigError(`${at(lineOf(/^\s+backend:/, line - 1))}: profile ${id}: backend must be local, remote, or a list of deployed backends (${[...remoteIds].join(", ")})`);
    const set = new Set(services as string[]);
    if (backendKind === "remote") {
      const bad = (services as string[]).filter((s) => !remoteFes.includes(s));
      if (bad.length) throw new ConfigError(`${at(svcLine)}: profile ${id}: a remote profile runs only ${remoteFes.join("/") || "remote-capable frontends"}, not ${bad.join(", ")}`);
    } else {
      for (const s of services as string[]) {
        const missing = (hard[s] ?? []).filter((d) => !set.has(d));
        if (missing.length) throw new ConfigError(`${at(svcLine)}: profile ${id}: ${s} depends on ${missing.join(", ")} (depends_on), which the profile does not list`);
        const soft = (calls[s] ?? []).filter((d) => !set.has(d));
        if (soft.length) warnings.push(`profile ${id}: ${s} calls ${soft.join(", ")}, not in the profile; those calls will fail`);
      }
      if (!(services as string[]).some((s) => def(s).kind === "fe")) warnings.push(`profile ${id}: no frontend in the profile`);
    }
    profiles.push({ id, backendKind, backends, services: services as string[], title: String(r.title ?? ""), about: String(r.about ?? ""), default: !!r.default, line });
  }
  for (const kind of ["local", "remote"] as const) {
    const d = profiles.filter((p) => p.backendKind === kind && p.default);
    if (d.length > 1) throw new ConfigError(`${at(d[1].line)}: more than one default ${kind} profile (${d.map((p) => p.id).join(", ")})`);
  }
  return { profiles, warnings };
}

// ---------- accessors ----------

export const SERVICES = () => manifest().services;
export const BACKENDS = () => manifest().backends;
export const CONFIG_FILE = () => manifest().file;
export const projectId = () => manifest().projectId;
// HOME/vendor/<projectId>: a detached worktree of the project at its HEAD (compose file, Dockerfiles, pinned sources)
export const vendorDir = () => join(vendorRoot(), projectId());
export const composeFile = () => join(vendorDir(), manifest().compose);
export const vendorSvcDir = (svc: string) => join(vendorDir(), manifest().sourcesDir, svc);
export const extraDir = (id: string) => join(vendorRoot(), id);

export const svcDef = (svc: string): SvcDef => {
  const d = SERVICES().find((s) => s.svc === svc);
  if (!d) throw new Error(`unknown service ${svc}`);
  return d;
};
export const findSvc = (svc: string) => SERVICES().find((s) => s.svc === svc);
// the service whose image and source a service runs
export const srcSvc = (svc: string) => findSvc(svc)?.uses ?? svc;
// the dir under sourcesDir that holds a service's source repo
export const repoOf = (svc: string) => findSvc(svc)?.repo ?? srcSvc(svc);

export function findBackend(id: string): Backend | undefined {
  return BACKENDS().find((b) => b.id === id || b.aliases.includes(id));
}

export const LEGACY_PROFILES = (): Record<string, string> => {
  try {
    return manifest().legacyProfiles;
  } catch {
    return {};
  }
};
export const canonicalProfile = (id: string) => {
  const l = LEGACY_PROFILES();
  return Object.hasOwn(l, id) ? l[id] : id;
};

export function loginConfig(): LoginConfig | null {
  const login = manifest().login;
  if (!login && !process.env.COSMOS_LOGIN_EMAIL) return null;
  return {
    email: process.env.COSMOS_LOGIN_EMAIL || login?.email || "",
    password: process.env.COSMOS_LOGIN_PASSWORD || login?.password || "",
    ...(login?.firstName ? { firstName: login.firstName } : {}),
    ...(login?.lastName ? { lastName: login.lastName } : {}),
  };
}

export function loadProfiles(): { profiles: Profile[]; warnings: string[]; images: Record<string, string>; login: LoginConfig | null } {
  const m = manifest();
  return { profiles: m.profiles, warnings: m.warnings, images: m.images, login: m.login };
}

export const findProfile = (id: string) => loadProfiles().profiles.find((p) => p.id === canonicalProfile(id));
export function defaultProfile(b: Backend): string {
  const ps = loadProfiles().profiles.filter((p) => p.backendKind === b.kind && (!p.backends || p.backends.includes(b.id)));
  const p = ps.find((x) => x.default) ?? ps[0];
  if (!p) throw new ConfigError(`${CONFIG_FILE()}: no profile runs against backend ${b.id}`);
  return p.id;
}
export const profileAllows = (p: Profile, b: Backend) => p.backendKind === b.kind && (!p.backends || p.backends.includes(b.id));

export const estimateMiB = (services: string[], measured?: number) =>
  measured ?? services.reduce((n, s) => n + svcDef(s).estMiB, 0);

// the instance's frontend: the first fe in manifest order, else its first service
export const mainFe = (services: string[]) => SERVICES().find((d) => d.kind === "fe" && services.includes(d.svc))?.svc ?? services[0];
export const readyPath = (svc: string) => {
  const d = findSvc(svc);
  return d?.ready ?? (d?.kind === "fe" ? "/" : d?.health ?? "/");
};
