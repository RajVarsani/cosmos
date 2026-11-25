// The adapter contract. A project's adapter module imports these with `import type` only; every runtime helper it needs
// arrives through AdapterContext, so there is never a second copy of core state.
import type { Backend, LoginConfig, Manifest, Profile, SvcDef } from "./catalog";
import type { CosmosContainer, CState } from "./docker";
import type { Reporter } from "./errors";
import type { RunOpts, RunResult } from "./sh";
import type { CorsCheck, Instance } from "./state";
import type { EdgeRoute } from "./edge";
import type { Share } from "./share";

export type { Backend, CorsCheck, EdgeRoute, Instance, LoginConfig, Manifest, Profile, Reporter, RunOpts, RunResult, Share, SvcDef };

export type BuildSpec = { key: string; tag: string; dockerfile: string; context: string; args: Record<string, string>; about: string };

export type ComposeSvc = {
  image?: string;
  build?: { context: string; dockerfile?: string; args?: Record<string, string> };
  environment?: Record<string, unknown>;
  env_file?: (string | { path: string; required?: boolean })[];
  volumes?: string[];
  ports?: string[];
  depends_on?: Record<string, unknown>;
  command?: string[];
};

export type StackPlan = {
  name: string;
  slot: number;
  backend: Backend;
  services: string[];
  ports: Record<string, number>;
  src: Record<string, string>;
  // per-service image to run: instance tags for built services, or a shared tag (BuildPlan.instanceTag false)
  images: Record<string, string>;
  mode: "edge" | "direct" | "local";
  goMode: "air" | "image";
  poll: boolean;
  edge?: EdgeRoute[];
};

// One service of the generated compose override, as core derived it; composeService may change any field.
export type ServiceDraft = {
  svc: string;
  def: SvcDef;
  // the project's compose definition
  compose: ComposeSvc;
  image?: string;
  // pull_policy never + build reset (default: the compose service has a build)
  neverPull: boolean;
  // env_file, emitted with !override when set
  envFile?: { path: string; required: boolean }[];
  // environment: merged over the compose environment, or replacing it with envOverride
  env: Record<string, string>;
  envOverride?: boolean;
  // volumes, always emitted with !override
  volumes: unknown[];
  workingDir?: string;
  // [] resets the compose entrypoint
  entrypoint?: string[];
  command?: string[];
  resetDependsOn?: boolean;
  // raw extra YAML lines (4-space indented)
  lines: string[];
};

export type BrowserEnv = { fe: string; env: Record<string, string>; keys: string[] };

export type GenContext = {
  plan: StackPlan;
  // the instance dir (generated files live here)
  dir: string;
  local: boolean;
  // every browser origin the instance serves
  origins: string[];
  compose: Record<string, ComposeSvc>;
  // registers a named volume (labelled with the instance); returns the compose key
  vol: (key: string, labels?: Record<string, string>, name?: string) => string;
  // FE env as the browser sees it: rewritten to the edge in edge mode; records the origins for the CORS check
  toBrowser: (fe: string, env: Record<string, string>, keys: string[]) => Record<string, string>;
  rewriteLocalPorts: (v: string) => string;
  // short tag of the shared image a service's image-seeded volumes key on
  imgTag: (svc: string, image?: string) => string;
};

export type BuildQuery = { svc: string; goMode: "air" | "image"; sourceImages: boolean; src: Record<string, string> };
// specs build in order; the last one is what the service runs. instanceTag false: run the shared tag as is.
export type BuildPlan = { specs: BuildSpec[]; instanceTag?: boolean };

export type BackendStatus = { available: boolean; reason: string | null; envFile?: string | null; host?: string | null; fields?: Record<string, unknown> };
export type Check = { name: string; ok: boolean; detail: string; fix?: string; optional?: boolean };
export type SeedResult = { ok: boolean; warnings: string[]; counts: Record<string, number | null>; clear?: RegExp };
export type PreviewRecipe = { out: string; viteTemp: string; cmd: (mode: string) => string[]; mkOut?: boolean; needMiB: number; dropEnv?: string[] };
export type ShareBlock = { port: number; prefixes: string[] };
export type DashboardMeta = {
  backends?: Record<string, { c: string; core: string; star: number; guard?: boolean }>;
  services?: Record<string, string>;
  looks?: Record<string, { k: number; tilt: number; spin: number; atm: string | null; atmK: number; atmR?: number; ring?: boolean }>;
  // job log lines that mean a step, for the life line: regex source, text, service
  steps?: { match: string; text: string; svc?: string }[];
  // project facts shown in the pins panel
  pins?: { label: string; value: string; detail?: string }[];
};

export type AdapterContext = {
  project: { dir: string; id: string; manifest: Manifest };
  paths: {
    pkgRoot: string;
    home: string;
    stateDir: string;
    envsDir: string;
    vendorDir: string;
    composeFile: string;
    vendorSvcDir: (svc: string) => string;
    extraDir: (id: string) => string;
    instanceDir: (name: string) => string;
    // HOME/envs/<bundle>
    envDir: (bundle: string) => string;
  };
  log: (m: string) => void;
  run: (cmd: string[], opts?: RunOpts) => Promise<RunResult>;
  GIT_ENV: Record<string, string>;
  parseDotenv: (text: string) => Record<string, string>;
  writeEnvFile: (path: string, header: string, env: Record<string, string>) => void;
  // copies files from -> to that pass filter and are missing at the destination; returns relative paths copied
  copyMissing: (from: string, to: string, filter: (rel: string) => boolean) => string[];
  svcDef: (svc: string) => SvcDef;
  srcSvc: (svc: string) => string;
  findBackend: (id: string) => Backend | undefined;
  login: () => LoginConfig | null;
  hostPort: (slot: number, key: string) => number;
  // localhost:<project host port> -> localhost:<slot port> (manifest hostPort)
  rewriteLocalPorts: (v: string, ports: Record<string, number>) => string;
  composeDoc: () => { services: Record<string, ComposeSvc>; volumes?: Record<string, unknown> };
  compose: (name: string, args: string[], opts?: Pick<RunOpts, "inherit" | "check" | "onOutput">) => Promise<RunResult>;
  containerName: (name: string, svc: string) => string;
  containerState: (container: string) => Promise<CState>;
  containerProcs: (container: string) => Promise<string[] | null>;
  cosmosContainers: () => Promise<CosmosContainer[]>;
  volumeExists: (volume: string) => Promise<boolean>;
  specs: {
    compose: (svc: string, source?: string) => Promise<BuildSpec | null>;
    goAir: () => BuildSpec;
    extra: (id: string) => BuildSpec;
  };
  hash: (...parts: string[]) => string;
  gitHead: (dir: string) => Promise<string>;
  pinnedSha: (svc: string) => Promise<string>;
  ensureServiceSources: (svcs: string[], log: (m: string) => void) => Promise<Record<string, string>>;
  waitHttp: (url: string, timeoutMs: number, ok?: (status: number) => boolean) => Promise<number>;
  workers: (inst: Instance) => Promise<Record<string, { name: string; alive: boolean; count: number }[] | null>>;
  error: (message: string, detail?: Record<string, unknown>) => Error;
};

export interface Adapter {
  // ---- compose ----
  // each FE's env as written and the URL keys its browser code reads; drives the edge and the CORS check
  browserEnvs?(ctx: AdapterContext, plan: Pick<StackPlan, "backend" | "ports" | "services" | "src">): BrowserEnv[];
  composeService?(ctx: AdapterContext, draft: ServiceDraft, gen: GenContext): void;
  // extra top-level services (not in the project's compose), as YAML lines under services:
  composeExtra?(ctx: AdapterContext, gen: GenContext): string[];
  // air build and run shell commands for a Go service (default: go build of goMain or ".", run from /source)
  airCommands?(ctx: AdapterContext, svc: string, bin: string): { build: string; run: string } | undefined;
  // ---- images ----
  // undefined: core default (go-air under air, else the compose build); null: no image
  buildPlan?(ctx: AdapterContext, q: BuildQuery): Promise<BuildPlan | null | undefined>;
  // ---- lifecycle ----
  // before sources and images: fill secrets, prepare env files (local: a local backend)
  prepare?(ctx: AdapterContext, q: { services: string[]; local: boolean; log: (m: string) => void }): Promise<void>;
  // services with syncDeps: install the checkout's deps into the instance's volumes when they changed
  syncDeps?(ctx: AdapterContext, inst: Instance, svc: string, dir: string, r: Reporter, soft: string[]): Promise<void>;
  // services an existing instance leaves out of this start
  skipServices?(ctx: AdapterContext, inst: Instance, fresh: boolean, log: (m: string) => void): string[];
  // an init service during a staged start: true when done, false to keep waiting, undefined for the default
  waitInit?(ctx: AdapterContext, inst: Instance, svc: string, state: CState, soft: string[]): Promise<boolean | undefined>;
  afterStage?(ctx: AdapterContext, inst: Instance, stage: string, services: string[], r: Reporter, soft: string[], deadline: number): Promise<void>;
  beforeDown?(ctx: AdapterContext, inst: Instance, o: { remove: boolean }, r: Reporter): Promise<{ volumes?: string[] } | void>;
  seed?(ctx: AdapterContext, inst: Instance, r: Reporter): Promise<SeedResult>;
  // ---- envs and catalog ----
  // which files of an env source get copied into HOME/envs/<bundle> (default: all)
  envFilter?(ctx: AdapterContext, bundle: string, rel: string): boolean;
  backendStatus?(ctx: AdapterContext, backend: Backend): BackendStatus;
  // why a profile cannot run on an available backend, or null
  profileBlocker?(ctx: AdapterContext, profile: Profile, backend: Backend, status: BackendStatus): string | null;
  // ---- checks ----
  doctor?(ctx: AdapterContext, q: { sources: Record<string, string> | null }): Promise<Check[]>;
  // ---- share ----
  previewRecipe?(ctx: AdapterContext, inst: Instance, fe: string): PreviewRecipe | null;
  previewMode?(ctx: AdapterContext, inst: Instance, fe: string): "production" | "development";
  shareReach?(ctx: AdapterContext, inst: Instance, fe: string, reach: Record<string, number>): Record<string, number>;
  shareBlock?(ctx: AdapterContext, inst: Instance, exposeAdmin: boolean): ShareBlock[];
  shareNotice?(ctx: AdapterContext, inst: Instance, fe: string, origin: string): { text: string; html: string } | null;
  remoteView?(ctx: AdapterContext, inst: Instance, fe: string, sh: Pick<Share, "url" | "public" | "exposeAdmin" | "notice" | "reach">): string | undefined;
  // ---- state and dashboard ----
  migrateRecord?(inst: Instance): void;
  dashboard?(ctx: AdapterContext): DashboardMeta | Promise<DashboardMeta>;
}
