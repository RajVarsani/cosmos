// shapes of /api/overview and /api/catalog; the server owns them, fields stay optional where it may omit them
export type Http = { ok: boolean; status: number | null; ms: number | null; at: number };

export type Container = {
  service: string;
  kind?: "fe" | "app" | "infra" | "init";
  port?: number | null;
  url?: string | null;
  healthPath?: string | null;
  container?: string | null;
  status: string;
  running: boolean;
  healthy?: boolean;
  startedAt?: string | null;
  exitCode?: number | null;
  restarts?: number;
  oomKilled?: boolean;
  health?: string | null;
  http?: Http | null;
  probe?: { kind?: string; path?: string | null; ok?: boolean; status?: number | null; ms?: number | null; at?: number } | null;
  errors?: { count: number; windowMin: number; at: number } | null;
  memMiB?: number | null;
  memLimitMiB?: number | null;
  cpuPct?: number | null;
};

export type Git = { branch?: string | null; sha?: string | null; dirty?: number | null };
// /api/instances/:name/sources and /api/sources/:svc/refs
export type SourceView = { svc: string; dir: string; branch: string | null; sha: string | null; dirty: number | null; pinned: string; atPin: boolean; upstream: string | null; ahead: number | null; behind: number | null; own: boolean; live: boolean; shared: string[] };
export type SourcesView = { name: string; sources: SourceView[] };
export type RefView = { name: string; local: boolean; remote: boolean; sha: string; date: string; subject: string; heldBy: string | null; live: boolean; clone: boolean };
export type RefsView = { svc: string; pinned: string; refs: RefView[]; warning: string | null };
export type Job = { id: string; kind: string; target?: string | null; backend?: string; startedAt: string; endedAt?: string | null; ok?: boolean; error?: string | null; last?: string };
export type JobLine = { t: number; kind: string; text: string };

export type Instance = {
  name: string;
  label?: string | null;
  slot: number;
  backend: string;
  profile?: string | null;
  mode?: string;
  services?: string[];
  ports: Record<string, number>;
  src?: Record<string, string>;
  image?: string | null;
  images?: Record<string, string>;
  owner?: { via?: string; sessionId?: string; pid?: number } | null;
  createdAt?: string | null;
  lastUsed?: string | null;
  warnings?: string[];
  corsWarning?: string | null;
  mainService?: string;
  url?: string | null;
  state: string;
  running?: { up: number; of: number } | number | null;
  memMiB?: number | null;
  containers: Container[];
  workers?: Record<string, { name: string; alive: boolean; count: number }[]>;
  git?: Record<string, Git>;
  job?: { id: string; kind: string; last?: string } | null;
  edge?: { port: number; upstream: string; keys?: string[] }[];
  login?: string | { email?: string } | null;
  share?: Share | null;
  // compat: share.state === "live"; null when not shared; read share.state instead
  shareUp?: boolean | null;
};

export type ShareState = "starting" | "live" | "restarting" | "unavailable" | "stopped";
export type SharePreview = { state: "idle" | "building" | "ready" | "failed" | "waiting-memory"; builds: number; lastMs: number | null; builtAt: string | null; lastError: string | null; pending: boolean };
// stopped: the share is on but the instance is down
export type Share = {
  url: string; zrokName: string; fe: string; public: boolean; user: string | null; password: string | null;
  state: ShareState; reason: string | null; preview: SharePreview | null; remote: string; notice: string | null; exposeAdmin: boolean; warnings: string[];
};

export type Vm = { totalMiB: number; availableMiB: number; freeMiB?: number; usedMiB?: number; minBuildMiB?: number; floorMiB?: number; at?: number; error?: undefined } | { error: string };

export type CatalogBackend = { id: string; kind?: string; live?: boolean; available?: boolean; reason?: string | null; host?: string | null; note?: string | null };
export type Profile = { id: string; title?: string; about?: string; reason?: string; backendKind?: "local" | "remote"; backends?: string[]; services?: string[]; srcServices?: string[] };
export type Combo = { profile: string; backend: string; available: boolean; reason?: string };
export type Catalog = { profiles: Profile[]; backends?: (string | CatalogBackend)[]; combos?: Combo[]; defaults?: { profile?: string; backend?: string }; vm?: { floorMiB?: number }; at?: number; error?: undefined };

export type Overview = {
  now?: string;
  dashboard?: { pid: number; port: number; startedAt?: string };
  vm?: Vm | null;
  statsAt?: number | null;
  floorMiB?: number;
  catalog?: Catalog | { error: string } | null;
  nextSlot: number | null;
  instances: Instance[];
  pending?: { id: string; target?: string; backend: string }[];
  jobs?: Job[];
  login?: string | { email?: string } | null;
  meta?: import("./palette").Meta;
};
