// Shared types for the compose generator, images, previews, checks and the dashboard.
import type { Backend, LoginConfig, Manifest, Profile, SvcDef } from "./catalog";
import type { CosmosContainer, CState } from "./docker";
import type { RuntimeInfo } from "./runtime/types";
export type { RuntimeId, RuntimeInfo } from "./runtime/types";
import type { Reporter } from "./errors";
import type { RunOpts, RunResult } from "./sh";
import type { CorsCheck, Instance } from "./state";
import type { EdgeRoute } from "./edge";
import type { Share } from "./share";

export type { Backend, CorsCheck, EdgeRoute, Instance, LoginConfig, Manifest, Profile, Reporter, RunOpts, RunResult, Share, SvcDef };

export type BuildSpec = { key: string; tag: string; dockerfile: string; context: string; args: Record<string, string>; target?: string; about: string };

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

// One service of the generated compose override, as core derived it; the cosmos.yaml recipe may change any field.
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
