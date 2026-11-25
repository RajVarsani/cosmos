// Every cosmos action lives here; the CLI and the dashboard are thin callers of these functions.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { STATE_DIR } from "./paths";
import { readState, withState, slotCandidates, ownerInfo, type CorsCheck, type Instance, type State } from "./state";
import { BASE_PORT, EDGE_OFFSETS, SLOT_STRIDE, hostPort, OFFSETS } from "./offsets";
import { busyPorts, portOwner } from "./ports";
import { syncEnvs } from "./envfile";
import { BACKENDS, CONFIG_FILE, EDGE_SVC, LEGACY_PROFILES, canonicalProfile, SERVICES as SVC_DEFS, loadProfiles, manifest, mainFe, profileAllows, defaultProfile, estimateMiB, findBackend, findProfile, readyPath, srcSvc, svcDef, type Backend, type Profile } from "./catalog";
import { containerName, instanceDir, overridePath } from "./generate";
import { SHARED_VOLUMES, browserEnvs, buildPlanFor, generateStack, instanceImage, slotPorts, type BuildSpec, type StackOut } from "./stack";
import { compose, composeArgs, containerState, cosmosContainers, instanceMemMiB, instanceVolumes, removeVolumes, vmAvailableMiB, volumeExists, watchVm } from "./docker";
import { BUILD_HEADROOM_MIB, MemoryError, VM_FLOOR_MIB, ensureImage, readMeasure, recordMeasure, tagImage, untagImages } from "./images";
import { DirLock } from "./lock";
import { ensureServiceSources, ensureVendor, pinnedSha } from "./vendor";
import { ensureWorktree, instanceSrcDir, instanceWorktrees, isWorktree, legacyUnsaved, listRefs, liveCheckout, removeWorktrees, srcServices, srcState, switchWorktree, unsavedWork, type SwitchResult } from "./sources";
import { GIT_ENV, run, type RunResult } from "./sh";
import { findByRef, resolveIdentity } from "./names";
import { edgeRoutes, edgeUpstreams, type EdgeRoute } from "./edge";
import { ZROK_HOST, mintName, previewRecipe, releaseName, shareAlive, shareState, startShare, stopShare, zrokInfo, zrokUsage, type Share, type ShareState } from "./share";
import type { ShareStatus } from "./share-proxy";
import type { BackendStatus } from "./api";
import { A, ctx } from "./adapter";
import { CosmosError, type Reporter } from "./errors";
import { waitHttp, workers, WORKERS } from "./probe";

export { CosmosError, WORKERS, mainFe, workers, type Reporter };

export { VM_FLOOR_MIB };

// measure.json may still key a profile by a retired name
const measureOf = (m: ReturnType<typeof readMeasure>, id: string) => {
  const legacy = LEGACY_PROFILES();
  return m.profiles[id] ?? m.profiles[Object.keys(legacy).find((k) => legacy[k] === id) ?? ""];
};
const profileMiB = (m: ReturnType<typeof readMeasure>, id: string) => measureOf(m, id)?.peakMiB ?? measureOf(m, id)?.steadyMiB;
export const MIN_VM_MIB = VM_FLOOR_MIB + BUILD_HEADROOM_MIB;

// ---------- instance shape helpers (v0 instances carry no profile/mode) ----------

export const profileOf = (i: Instance) => canonicalProfile(i.profile ?? manifest().defaults.profile ?? "");
// "proxy" (the retired Vite wrapper) and v0 instances come back as edge
export const modeOf = (i: Instance): "edge" | "direct" | "local" => (!i.mode || i.mode === "proxy" ? "edge" : i.mode);

export const serviceUrl = (i: Instance, svc = mainFe(i.services)) => `http://localhost:${i.ports[svc]}`;

// Browser/CLI-usable address of every port an instance publishes (manifest url templates, else http + health path).
export function serviceUrls(i: Instance): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, port] of Object.entries(i.ports)) {
    const d = SVC_DEFS().find((s) => s.svc === k);
    if (d?.url) out[k] = d.url.replaceAll("{port}", String(port));
    else if (k.startsWith("edge:")) out[k] = `http://localhost:${port}`;
    else if (d?.kind === "fe") out[k] = `http://localhost:${port}`;
    else out[k] = `http://localhost:${port}${d?.health ?? ""}`;
  }
  return out;
}

// ---------- sources: one worktree per source-mounted service, per instance ----------

// A live mount stays while it is still a worktree of the service's repo. --branch services follow the cosmos src rule.
// A legacy shared path (vendor/..., an old --src) moves to the instance's own worktree at the same commit,
// unless moving would strand work (edits, untracked files, a commit the repo lacks); that keeps it mounted until a branch switch.
async function prepareSources(inst: Instance, services: string[], r: Reporter, soft: string[], fresh: boolean, branches: Record<string, string> = {}, cloneLive: string[] = []): Promise<Record<string, string>> {
  const src: Record<string, string> = {};
  const live = new Set(inst.live ?? []);
  for (const svc of srcServices(services)) {
    const wt = instanceSrcDir(inst.name, svc);
    if (branches[svc]) {
      const sw = await switchWorktree(inst.name, svc, branches[svc], r.log, { fresh, live: cloneLive.includes(svc) });
      for (const w of sw.warnings) r.log(`warning: ${w}`);
      soft.push(...sw.warnings);
      src[svc] = sw.dir;
      const others = sw.live ? sharedWith(inst, svc, sw.dir) : [];
      if (others.length) soft.push(`${svc}: ${others.join(", ")} also mount ${sw.dir} live; an edit there reloads all of them`);
      if (sw.live) live.add(svc);
      else live.delete(svc);
      continue;
    }
    if (live.has(svc)) {
      const bad = await liveCheckout(svc, inst.src[svc] ?? "");
      if (!bad) {
        src[svc] = inst.src[svc];
        continue;
      }
      live.delete(svc);
      soft.push(`${svc}: the live mount stopped (${bad}); it runs ${isWorktree(wt) ? "its own worktree" : "the project's pinned commit"} again`);
      if (isWorktree(wt)) {
        src[svc] = wt;
        continue;
      }
      src[svc] = await ensureWorktree(inst.name, svc, await pinnedSha(svc), r.log);
      continue;
    }
    if (isWorktree(wt) && !fresh) {
      src[svc] = wt;
      continue;
    }
    let at = await pinnedSha(svc);
    const legacy = inst.src[svc] && inst.src[svc] !== wt && existsSync(inst.src[svc]) ? inst.src[svc] : null;
    if (legacy) {
      const g = await legacyUnsaved(svc, legacy, at);
      if (g.why) {
        src[svc] = legacy;
        soft.push(`${svc} still runs the shared ${legacy} (${g.why}); cosmos src ${inst.name} ${svc} <branch> moves it to its own worktree`);
        continue;
      }
      if (g.sha) at = g.sha;
    }
    src[svc] = await ensureWorktree(inst.name, svc, at, r.log, { fresh });
  }
  inst.live = live.size ? [...live] : undefined;
  return src;
}

// services with syncDeps install the checkout's deps into the instance's volumes (adapter.syncDeps) when they changed
const depsServices = (src: Record<string, string>) => SVC_DEFS().filter((d) => d.syncDeps && src[d.svc]).map((d) => d.svc);

async function syncDeps(inst: Instance, svc: string, dir: string, r: Reporter, soft: string[]): Promise<void> {
  await A().syncDeps?.(ctx(), inst, svc, dir, r, soft);
}

export function backendStatus(b: Backend): BackendStatus {
  return A().backendStatus?.(ctx(), b) ?? { available: true, reason: null };
}

// Available remote backends, plus every local one (v0 callers read this list).
export function backends(): string[] {
  return [...BACKENDS().filter((b) => b.kind === "remote" && backendStatus(b).available).map((b) => b.id), ...BACKENDS().filter((b) => b.kind === "local").map((b) => b.id)];
}

// ---------- catalog: every backend and profile, with availability and the reason when unavailable ----------

export type Availability = { available: boolean; reason: string | null };

// Read-only by default (the dashboard polls it); sync copies env files and fetches the manifest's prefetch sources first (the CLI does).
export async function catalog(o: { sync?: boolean } = {}) {
  const m = manifest();
  if (o.sync) {
    await ensureVendor(() => {}).catch(() => {});
    await syncEnvs().catch(() => {});
    if (m.prefetch.length) await ensureServiceSources(m.prefetch, () => {}).catch(() => {});
  }
  const vm = await vmAvailableMiB();
  const measure = readMeasure();

  const statuses = new Map<string, BackendStatus>();
  const backendView = BACKENDS().map((b) => {
    const st = backendStatus(b);
    statuses.set(b.id, st);
    return {
      id: b.id, kind: b.kind, aliases: b.aliases, live: b.live, available: st.available, reason: st.reason,
      envFile: st.envFile ?? null, host: st.host ?? null, ...(st.fields ?? {}),
      note: b.live ? "live customer data: read-only use only, never write" : null,
    };
  });

  const { profiles, warnings } = loadProfiles();
  const missingImages = await missingImagesFor();
  const avail = (p: (typeof profiles)[number], b: (typeof backendView)[number]) => {
    const est = estimateMiB(p.services, profileMiB(measure, p.id));
    let reason: string | null = null;
    const bk = findBackend(b.id)!;
    if (!b.available) reason = b.reason;
    else if (!profileAllows(p, bk)) reason = p.backendKind === "local" ? `${p.id} brings its own backends; runs only on local` : p.backends ? `${p.id} is limited to ${p.backends.join(", ")}` : `${p.id} runs against a deployed backend`;
    else if ((reason = A().profileBlocker?.(ctx(), p, bk, statuses.get(b.id)!) ?? null)) {}
    else if ("error" in vm) reason = `cannot measure docker VM memory: ${vm.error}`;
    else if (vm.mib - est < VM_FLOOR_MIB) reason = "needs more free memory than the VM has";
    return { est, reason };
  };
  const profileView = profiles.map((p) => {
    const allowed = backendView.filter((b) => profileAllows(p, findBackend(b.id)!));
    const runnable = allowed.map((b) => ({ b, ...avail(p, b) }));
    const missing = missingImages(p.services);
    const firstOk = runnable.find((x) => !x.reason);
    const reason = !allowed.length ? "no backend allows this profile" : !firstOk ? runnable[0].reason : missing.length ? `images not built yet: ${missing.join(", ")} (cosmos up builds them first, one at a time)` : null;
    return {
      id: p.id, title: p.title, about: p.about, backendKind: p.backendKind, backends: allowed.map((b) => b.id), default: p.default, services: p.services, srcServices: srcServices(p.services),
      estMiB: estimateMiB(p.services, profileMiB(measure, p.id)), measured: !!measureOf(measure, p.id),
      missingImages: missing, canRun: reason === null, reason, line: p.line,
    };
  });
  const combos = backendView.flatMap((b) =>
    profiles.map((p) => {
      const { est, reason } = avail(p, b);
      const missing = reason ? [] : missingImages(p.services);
      return { backend: b.id, profile: p.id, available: reason === null, reason, estMiB: est, missingImages: missing };
    }),
  );
  const firstRemote = BACKENDS().find((b) => b.kind === "remote")?.id ?? BACKENDS()[0].id;

  return {
    backends: backendView,
    profiles: profileView,
    combos,
    config: { file: CONFIG_FILE(), warnings },
    modes: [
      { id: "edge", default: true, about: "the FE calls a per-instance Caddy edge (one localhost port per backend host) that forwards unchanged over HTTPS and answers CORS for this instance only" },
      { id: "direct", default: false, about: "opt-in (--direct): the browser calls the backend URLs from the env file, for backends that allow localhost origins" },
    ],
    vm: "error" in vm ? { error: vm.error, floorMiB: VM_FLOOR_MIB } : { availableMiB: vm.mib, floorMiB: VM_FLOOR_MIB },
    defaults: { backend: m.defaults.backend ?? firstRemote, profile: m.defaults.profile ?? profiles.find((p) => p.default)?.id ?? profiles[0]?.id ?? null, mode: "edge" },
  };
}

// Which of a profile's images are not built yet (keys as `cosmos build` names them).
async function missingImagesFor(): Promise<(services: string[]) => string[]> {
  const specs = new Map<string, BuildSpec[]>();
  for (const d of SVC_DEFS()) {
    const plan = await buildPlanFor(d.svc, "air").catch(() => null);
    specs.set(d.svc, plan?.specs ?? []);
  }
  const tags = [...new Set([...specs.values()].flat().map((x) => x.tag))];
  const have = new Set((await run(["docker", "image", "ls", "--format", "{{.Repository}}:{{.Tag}}", "--filter", "reference=cosmos-*"], { quiet: true })).stdout.split("\n").filter((t) => tags.includes(t)));
  return (services) => [...new Set(services.flatMap((s) => (specs.get(s) ?? []).filter((x) => !have.has(x.tag)).map((x) => x.key)))];
}

// ---------- CORS: does the backend allow this instance's origin? (preflight only, read-only) ----------

export async function corsCheck(fe: string, origin: string, targets: string[]): Promise<CorsCheck[]> {
  return Promise.all(
    targets.map(async (target) => {
      try {
        const r = await fetch(`${target}/`, {
          method: "OPTIONS",
          headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,authorization" },
          signal: AbortSignal.timeout(8000),
          redirect: "manual",
        });
        const acao = r.headers.get("access-control-allow-origin");
        const credentials = r.headers.get("access-control-allow-credentials") === "true";
        return { fe, origin, target, allowed: acao === origin || acao === "*", acao, credentials, status: r.status };
      } catch (e) {
        return { fe, origin, target, allowed: false, acao: null, credentials: false, status: null, error: (e as Error).message };
      }
    }),
  );
}

async function checkInstanceCors(i: Pick<Instance, "ports">, direct: StackOut["directOrigins"]): Promise<CorsCheck[]> {
  const out: CorsCheck[] = [];
  for (const [fe, targets] of Object.entries(direct)) {
    const origin = `http://localhost:${i.ports[fe]}`;
    // a local stack's backends are only reachable on the host ports
    out.push(...(await corsCheck(fe, origin, targets.map((t) => t.replace(/\/\/localhost:/, "//127.0.0.1:")))));
  }
  return out;
}

// ---------- per-instance operation lock: one up/down/rm at a time, from the CLI or the dashboard ----------

const opLockDir = (name: string) => join(STATE_DIR, "ops", `${name}.lock`);

function tryOpLock(name: string): DirLock {
  const l = new DirLock(opLockDir(name), { staleMs: Infinity, waitMs: 0 });
  mkdirSync(join(STATE_DIR, "ops"), { recursive: true });
  // a dead holder's lock is broken on the first try and taken on the next
  if (!l.tryAcquire() && !l.tryAcquire()) {
    let holder = "";
    try {
      holder = ` (pid ${JSON.parse(readFileSync(join(opLockDir(name), "owner"), "utf8")).pid})`;
    } catch {}
    throw new CosmosError(`instance ${name} is busy: another cosmos up/down/rm is running on it${holder}`, { busy: true });
  }
  return l;
}

// ---------- up ----------

export type UpOpts = {
  sourceImages?: boolean;
  backend: string;
  profile?: string;
  name?: string;
  build?: boolean;
  poll?: boolean;
  // remote only: edge (default) or direct
  mode?: "edge" | "direct";
  goMode?: "air" | "image";
  // service -> branch, tag or sha for a new instance (cosmos src's rule); others stay on the project's pin
  branches?: Record<string, string>;
  // services of `branches` that may mount the project clone live when it holds the branch (else they run a copy)
  live?: string[];
  keepOnFailure?: boolean;
  // turn sharing on once the instance is up
  share?: boolean;
  timeoutS?: number;
  owner?: Instance["owner"];
  // start(): the instance being restarted; a local profile gone from the catalog resolves from its stored services
  stored?: Instance;
  // Called once the slot is reserved, before the slow work.
  onReserved?: (inst: Instance) => void;
};

export type UpResult = {
  ok: true;
  name: string;
  label: string;
  slot: number;
  backend: string;
  profile: string;
  mode: string;
  url: string;
  urls: Record<string, string>;
  ports: Record<string, number>;
  src: Record<string, string>;
  live: string[];
  image: string;
  images: Record<string, string>;
  edge: EdgeRoute[];
  cors: CorsCheck[];
  override: string;
  timings: Record<string, number>;
  memory?: { instanceMiB: number; byService: Record<string, number>; vmBeforeMiB: number | null; vmAfterMiB: number | null };
  share?: ShareResult;
  warnings?: string[];
};

function resolveCombo(o: UpOpts): { backend: Backend; profile: Profile } {
  const all = BACKENDS().map((b) => b.id).join(", ");
  const st = o.stored;
  const orphan: Profile | undefined = st && st.backend === "local" && o.profile && !findProfile(o.profile)
    ? { id: canonicalProfile(o.profile), backendKind: "local", backends: null, services: st.services, title: "", about: "", default: false, line: 0 } : undefined;
  const named = o.profile ? findProfile(o.profile) ?? orphan : undefined;
  if (o.profile && !named) throw new CosmosError(`unknown profile "${o.profile}" (${CONFIG_FILE()} has: ${loadProfiles().profiles.map((p) => p.id).join(", ")})`);
  const backendId = o.backend || (named?.backendKind === "local" ? "local" : "");
  if (!backendId) throw new CosmosError(`--backend is required${named ? ` for remote profile ${named.id}` : ""} (one of: ${all})`);
  const backend = findBackend(backendId);
  if (!backend) throw new CosmosError(`unknown backend "${backendId}" (have: ${all})`);
  const bst = backendStatus(backend);
  if (backend.kind === "remote" && !bst.available) throw new CosmosError(`backend ${backend.id} is unavailable: ${bst.reason}`);
  const profile = named ?? findProfile(defaultProfile(backend))!;
  if (!profileAllows(profile, backend)) {
    throw new CosmosError(
      profile.backendKind === "local" ? `profile ${profile.id} brings its own backends; use --backend local (or omit --backend)` :
      profile.backends ? `profile ${profile.id} is limited to ${profile.backends.join(", ")}` : `profile ${profile.id} runs against a deployed backend, not local`,
    );
  }
  return { backend, profile };
}

// A name that is not a slug is a label; it only needs something to derive an id from.
function checkName(name?: string) {
  try { resolveIdentity(name, []); } catch (e) { throw new CosmosError((e as Error).message); }
}

function checkBranches(b: UpOpts["branches"], profile: Profile, live: string[] = []) {
  const can = srcServices(profile.services);
  for (const [svc, ref] of Object.entries(b ?? {})) {
    if (!can.includes(svc)) throw new CosmosError(`--branch ${svc}: profile ${profile.id} runs ${can.join(", ") || "nothing"} from source`);
    if (typeof ref !== "string" || !ref.trim()) throw new CosmosError(`--branch ${svc}= needs a branch, tag or sha`);
  }
  for (const svc of live) if (!b?.[svc]) throw new CosmosError(`--live ${svc}: only a service given a --branch can mount your clone live`);
}

// Validates what `up` would run without doing it (the dashboard's form check).
export function validateUp(o: UpOpts) {
  const { backend, profile } = resolveCombo(o);
  if (o.sourceImages && backend.kind !== "local") throw new CosmosError("--source-images requires a local backend");
  checkName(o.name);
  checkBranches(o.branches, profile, o.live);
  return { backend: backend.id, profile: profile.id, services: profile.services };
}

// Images an instance runs, built (once, shared) if missing, then tagged per instance unless the plan runs the shared tag.
async function prepareImages(inst: Instance, services: string[], goMode: "air" | "image", r: Reporter, force: boolean, timings: Record<string, number>) {
  const images: Record<string, string> = {};
  const build = async (spec: BuildSpec) => {
    const res = await ensureImage(spec, r, force);
    if (res.ms) timings[`build:${spec.key}`] = res.ms;
    return spec.tag;
  };
  for (const svc of services) {
    const plan = await buildPlanFor(svc, goMode, !!inst.sourceImages, inst.src);
    if (!plan?.specs.length) continue;
    let shared = "";
    for (const spec of plan.specs) shared = await build(spec);
    if (!plan.instanceTag) {
      images[svc] = shared;
      continue;
    }
    const tag = instanceImage(inst.name, svc);
    await tagImage(shared, tag);
    images[svc] = tag;
    images[`${srcSvc(svc)}@shared`] = shared;
  }
  if (goMode === "air" && services.some((s) => svcDef(s).go)) {
    for (const v of SHARED_VOLUMES) if (!(await volumeExists(v))) await run(["docker", "volume", "create", "--label", "cosmos.shared=go", v], { check: true });
  }
  return { images, image: images[mainFe(services)] ?? inst.image ?? "" };
}

// manifest stages in order, then one last stage for anything they do not name
function stagesFor(services: string[]): { id: string; services: string[] }[] {
  const st = manifest().stages;
  const named = new Set(st.flatMap((s) => s.services));
  const rest = services.filter((s) => !named.has(s) && s !== EDGE_SVC);
  return [...st, ...(rest.length ? [{ id: st.length ? "rest" : "all", services: rest }] : [])];
}

// A long-running service that exited, or keeps restarting, fails the start now instead of at the deadline (FB-177).
const MAX_START_RESTARTS = 3;

async function crashState(container: string): Promise<string | null> {
  const r = await run(["docker", "inspect", "-f", "{{.State.Status}} {{.RestartCount}} {{.State.ExitCode}}", container], { quiet: true });
  if (r.code !== 0) return null;
  const [status, restarts, code] = r.stdout.trim().split(" ");
  if (status === "exited" || status === "dead") return `exited ${code}`;
  if (Number(restarts) >= MAX_START_RESTARTS) return `restarted ${restarts} times (${status})`;
  return null;
}

async function waitStage(inst: Instance, stage: string[], deadline: number, r: Reporter, soft: string[]) {
  const pending = new Set(stage);
  while (pending.size) {
    for (const svc of [...pending]) {
      const d = svcDef(svc);
      const cn = containerName(inst.name, svc);
      const c = await containerState(cn);
      if (d.kind === "init") {
        const done = await A().waitInit?.(ctx(), inst, svc, c, soft);
        if (done ?? (!c || c.status === "exited")) pending.delete(svc);
        continue;
      }
      const crash = await crashState(cn);
      if (crash) throw new CosmosError(`${svc} ${crash} during start; see: cosmos logs ${inst.name} ${svc}`);
      if (d.health === null) {
        const h = (await run(["docker", "inspect", "-f", "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}", cn], { quiet: true })).stdout.trim();
        if (h === "healthy" || (h === "none" && c?.running)) pending.delete(svc);
        continue;
      }
      try {
        const res = await fetch(`http://127.0.0.1:${inst.ports[svc]}${d.health}`, { signal: AbortSignal.timeout(5000), redirect: "manual" });
        await res.arrayBuffer().catch(() => {});
        if (res.status < 500) {
          pending.delete(svc);
          r.log(`${svc} answering on :${inst.ports[svc]}${d.health} (${res.status})`);
        }
      } catch {}
    }
    if (!pending.size) break;
    if (Date.now() > deadline) throw new CosmosError(`timed out waiting for ${[...pending].join(", ")}; see: cosmos status ${inst.name}`);
    await Bun.sleep(2000);
  }
}

// Re-runs the project's seed (adapter.seed) on a running instance.
export async function seed(ref: string, r: Reporter) {
  const inst = getInstance(ref);
  const name = inst.name;
  const a = A();
  if (!a.seed) throw new CosmosError(`${manifest().projectId} has no seed (its adapter defines none)`);
  const lock = tryOpLock(name);
  try {
    const t0 = Date.now();
    const res = await a.seed(ctx(), inst, r);
    await withState((s) => {
      const cur = s.instances[name];
      if (cur) cur.warnings = [...(cur.warnings ?? []).filter((w) => !res.clear?.test(w)), ...res.warnings];
    });
    return { name, ok: res.ok, ms: Date.now() - t0, warnings: res.warnings, counts: res.counts };
  } finally {
    lock.release();
  }
}

// --share turns sharing on; a share that was on comes back. Runs after up released the instance's op lock.
export async function up(o: UpOpts, r: Reporter): Promise<UpResult> {
  const out = await upCore(o, r);
  const seen = getInstance(out.name).share;
  if (!o.share && !seen) return out;
  const warnings = [...(out.warnings ?? [])];
  try {
    const sh = await share(out.name, o.share || !seen ? {} : { ifStill: seen }, r);
    for (const w of sh.warnings) if (!warnings.includes(w)) warnings.push(w);
    return { ...out, share: sh, ...(warnings.length ? { warnings } : {}) };
  } catch (e) {
    warnings.push(`share: ${(e as Error).message}`);
    return { ...out, warnings };
  }
}

async function upCore(o: UpOpts, r: Reporter): Promise<UpResult> {
  // a fresh machine has no vendored project yet, and profiles are validated against its compose file
  await ensureVendor(r.log);
  const { backend, profile } = resolveCombo(o);
  if (o.sourceImages && backend.kind !== "local") throw new CosmosError("--source-images requires a local backend");
  checkName(o.name);
  checkBranches(o.branches, profile, o.live);
  const branches = o.branches ?? {};
  // Docker Desktop VirtioFS delivers file events; polling is opt-in (--poll) for engines that do not
  const pollOpt = o.poll;
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const services = profile.services;
  const local = backend.kind === "local";
  const mode: "edge" | "direct" | "local" = local ? "local" : o.mode ?? "edge";

  // Reserve the name and slot, and take the instance's op lock, all under the state lock (DAR-FB-171).
  let opLock: DirLock | null = null;
  const { inst, fresh } = await withState(async (s) => {
    const id = (() => {
      try { return resolveIdentity(o.name, Object.values(s.instances)); } catch (e) { throw new CosmosError((e as Error).message); }
    })();
    const existing = id.explicit ? s.instances[id.name] : undefined;
    if (existing) {
      if (existing.backend !== backend.id) throw new CosmosError(`instance ${existing.name} exists with backend ${existing.backend}; rm it first`);
      if (profileOf(existing) !== profile.id) throw new CosmosError(`instance ${existing.name} exists with profile ${profileOf(existing)}; rm it first`);
      if (Object.keys(branches).length) throw new CosmosError(`--branch sets sources at create; ${existing.name} exists, so use cosmos src ${existing.name} <svc> <branch>`);
      opLock = tryOpLock(existing.name);
      if (o.sourceImages) existing.sourceImages = true;
      existing.lastUsed = new Date().toISOString();
      return { inst: existing, fresh: false };
    }
    for (const slot of slotCandidates(s)) {
      const ports = slotPorts(slot, services);
      // an edge takes offsets 40+ as it learns the upstream hosts; skip slots where any is held
      const busy = await busyPorts([...Object.values(ports), ...(mode === "edge" ? EDGE_OFFSETS.map((x) => hostPort(slot, x)) : [])]);
      if (busy.length) {
        r.log(`slot ${slot} skipped: ${busy.map((b) => `${b.port} held by ${b.owner}`).join(", ")}`);
        continue;
      }
      const { name, label } = id;
      if (s.instances[name]) throw new CosmosError(`instance name ${name} already taken`);
      opLock = tryOpLock(name);
      const now = new Date().toISOString();
      const inst: Instance = {
        name, label, slot, backend: backend.id, profile: profile.id, mode, goMode: local ? o.goMode ?? "air" : undefined,
        services: mode === "edge" ? [...services, EDGE_SVC] : services, ports, src: {}, image: "", owner: o.owner ?? ownerInfo(), createdAt: now, lastUsed: now,
        sourceImages: o.sourceImages,
      };
      s.instances[name] = inst;
      return { inst, fresh: true };
    }
    throw new CosmosError("no free slot");
  });
  o.onReserved?.(inst);
  const imode = fresh ? mode : o.mode && !local ? o.mode : modeOf(inst);
  if (!fresh && imode !== modeOf(inst)) throw new CosmosError(`instance ${inst.name} runs in ${modeOf(inst)} mode; rm it and up again to switch to ${imode}`);
  // v0/proxy instances migrate to edge on their next start
  if (!local) inst.services = imode === "edge" ? [...profile.services, EDGE_SVC] : profile.services;
  else if (!fresh) {
    // a local profile that gained a service since this instance was made brings it on the next start
    inst.services = profile.services;
    const want = slotPorts(inst.slot, profile.services);
    for (const [k, v] of Object.entries(want)) inst.ports[k] ??= v;
    // and gives back the ports of one it dropped
    for (const k of Object.keys(inst.ports)) if (!(k in want)) delete inst.ports[k];
  }
  const runServices = inst.services;
  const poll = pollOpt ?? inst.poll ?? false;
  inst.poll = poll;
  const goMode = inst.goMode ?? "air";

  const created: string[] = [];
  const softWarnings: string[] = [];
  let gen: StackOut | undefined;
  let vmBefore: number | null = null;
  try {
    await ensureVendor(r.log);
    await syncEnvs(r.log);
    await A().prepare?.(ctx(), { services: runServices, local, log: r.log });
    await ensureServiceSources(services, r.log);
    const src = await prepareSources(inst, services, r, softWarnings, fresh, branches, o.live);
    inst.src = src;

    // edge: one listener per upstream host the FE envs name; a host keeps its port across restarts
    let edge: EdgeRoute[] = [];
    if (imode === "edge") {
      edge = edgeRoutes(inst.slot, edgeUpstreams(browserEnvs({ backend, ports: inst.ports, services, src })), inst.ports);
      for (const k of Object.keys(inst.ports)) if (k.startsWith("edge:") && !edge.some((e) => e.key === k)) delete inst.ports[k];
      for (const e of edge) inst.ports[e.key] = e.port;
    } else for (const k of Object.keys(inst.ports)) if (k.startsWith("edge:")) delete inst.ports[k];
    inst.edge = imode === "edge" ? edge : undefined;
    inst.mode = imode;

    const running = await Promise.all(runServices.map(async (svc) => (await containerState(containerName(inst.name, svc)))?.running ?? false));
    const cold = !running.some(Boolean);
    // a port key is a service, or an extra port of one (edge:<host> belongs to the edge)
    const owner = (k: string) => (k.startsWith("edge:") ? EDGE_SVC : runServices.find((sv) => sv === k || svcDef(sv).extraPorts?.some((x) => x.key === k)) ?? k);
    const busy = await busyPorts(Object.entries(inst.ports).filter(([k]) => !running[runServices.indexOf(owner(k))]).map(([, p]) => p));
    if (busy.length) throw new CosmosError(`ports busy, refusing to bind: ${busy.map((b) => `${b.port} (${b.owner})`).join(", ")}`, { busy });

    const tb = Date.now();
    const { images, image } = await prepareImages(inst, services, goMode, r, !!o.build, timings);
    timings.imagesMs = Date.now() - tb;

    // Memory preflight: refuse rather than push the VM under the floor.
    const measure = readMeasure();
    const need = estimateMiB(runServices.filter((s, k) => !running[k]), cold ? profileMiB(measure, profile.id) : undefined);
    const vm = await vmAvailableMiB();
    if ("error" in vm) throw new CosmosError(`not starting ${inst.name}: cannot measure docker VM memory: ${vm.error}`);
    vmBefore = vm.mib;
    if (vm.mib - need < VM_FLOOR_MIB) {
      throw new CosmosError(`not starting ${inst.name}: it needs ~${need} MiB, the VM has ${vm.mib} MiB available, and cosmos keeps ${VM_FLOOR_MIB} MiB free`, { instance: inst.name, needMiB: need, vmAvailableMiB: vm.mib, floorMiB: VM_FLOOR_MIB });
    }
    r.log(`VM available ${vm.mib} MiB; ${inst.name} expected to need ~${need} MiB`);

    gen = generateStack({ name: inst.name, slot: inst.slot, backend, services: runServices, ports: inst.ports, src, images, mode: imode, goMode, poll, edge });
    Object.assign(inst, { src, images, image });
    for (const fe of depsServices(src)) {
      if (!(await containerState(containerName(inst.name, fe)))?.running) await syncDeps(inst, fe, src[fe], r, softWarnings);
    }

    const deadline = Date.now() + (o.timeoutS ?? (local ? 2400 : 600)) * 1000;
    const u0 = Date.now();
    if (!local) {
      r.log(`starting ${services.join(" + ")} on ${services.map((s) => `:${inst.ports[s]}`).join(" ")}`);
      for (const e of edge) r.log(`edge :${e.port} -> ${e.upstream}  (${e.keys.join(", ")})`);
      await compose(inst.name, ["up", "-d", "--no-build", "--no-deps", ...runServices], { check: true, onOutput: r.output });
      created.push(...runServices);
      for (const s of services) timings[`ready:${s}`] = await waitHttp(`http://127.0.0.1:${inst.ports[s]}${readyPath(s)}`, deadline - Date.now());
    } else {
      let breach: number | null = null;
      const stopWatch = watchVm((mib) => {
        if (mib < VM_FLOOR_MIB && breach === null) {
          breach = mib;
          r.log(`VM available ${mib} MiB fell under the ${VM_FLOOR_MIB} MiB floor; stopping ${inst.name}`);
        }
      });
      try {
        const skip = new Set(A().skipServices?.(ctx(), inst, fresh, r.log) ?? []);
        for (const stage of stagesFor(services)) {
          const svcs = stage.services.filter((s) => services.includes(s) && !skip.has(s));
          if (!svcs.length) continue;
          if (breach !== null) break;
          const s0 = Date.now();
          r.log(`stage ${stage.id}: ${svcs.join(", ")}`);
          await compose(inst.name, ["up", "-d", "--no-build", ...svcs], { check: true, onOutput: r.output });
          created.push(...svcs);
          await waitStage(inst, svcs, deadline, r, softWarnings);
          await A().afterStage?.(ctx(), inst, stage.id, svcs, r, softWarnings, deadline);
          timings[`stage:${stage.id}`] = Date.now() - s0;
          const now = await vmAvailableMiB();
          if (!("error" in now)) r.log(`stage ${stage.id} up in ${Math.round((Date.now() - s0) / 1000)}s; VM available ${now.mib} MiB`);
          if (!("error" in now) && now.mib < VM_FLOOR_MIB) breach = now.mib;
        }
        // wait on the profile's own FE; a profile without one has nothing to wait on
        const fe = mainFe(services);
        if ((fresh || cold) && svcDef(fe).kind === "fe") timings[`ready:${fe}`] = await waitHttp(`http://127.0.0.1:${inst.ports[fe]}${readyPath(fe)}`, deadline - Date.now());
      } finally {
        stopWatch();
      }
      if (breach !== null) {
        const used = await instanceMemMiB(inst.name);
        await compose(inst.name, ["stop"], {}).catch(() => {});
        throw new CosmosError(`stopped ${inst.name}: VM available fell to ${breach} MiB (< ${VM_FLOOR_MIB} floor) while starting; it was using ${used.total} MiB`, { instance: inst.name, vmAvailableMiB: breach, instanceMiB: used.total, byService: used.byService, floorMiB: VM_FLOOR_MIB });
      }
    }
    timings.containerMs = Date.now() - u0;
    timings.totalMs = Date.now() - t0;
    timings.cold = cold ? 1 : 0;
  } catch (e) {
    // Undo only what this run created; a fresh instance's dir holds a copy of the backend secrets.
    // Keep the evidence: every started service's last log lines, outside the instance dir that cleanup removes.
    let failLog: string | null = null;
    if (created.length && existsSync(overridePath(inst.name))) {
      const l = await compose(inst.name, ["logs", "--no-color", "--tail", "300", ...created], {}).catch(() => null);
      if (l) {
        mkdirSync(join(STATE_DIR, "failures"), { recursive: true });
        failLog = join(STATE_DIR, "failures", `${inst.name}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
        writeFileSync(failLog, `${(e as Error).message}\n\n${l.stdout}${l.stderr}`);
        r.log(`logs of ${created.join(", ")} saved to ${failLog}`);
      }
    }
    if (fresh && o.keepOnFailure) {
      r.log(`--keep-on-failure: leaving ${inst.name} as it is; cosmos rm ${inst.name} when done`);
      // the next up of this name runs the sources this one picked, live mounts included
      await withState((s) => {
        const cur = s.instances[inst.name];
        if (cur) Object.assign(cur, { src: inst.src, live: inst.live });
      }).catch((se) => r.log(`warning: could not record ${inst.name}'s sources: ${se.message}`));
    } else if (fresh) {
      if (existsSync(overridePath(inst.name))) await compose(inst.name, ["down", "-v", "--remove-orphans"], {}).catch(() => {});
      await removeVolumes((await instanceVolumes(inst.name))).catch(() => {});
      await untagImages(Object.values(inst.images ?? {})).catch(() => {});
      await removeWorktrees(inst.name, r.log).catch((we) => r.log(`warning: ${we.message}`));
      // a worktree removeWorktrees kept stays, with the src/ dir that holds it
      const keepSrc = instanceWorktrees(inst.name).length > 0;
      if (!keepSrc) rmSync(instanceDir(inst.name), { recursive: true, force: true });
      else for (const f of existsSync(instanceDir(inst.name)) ? readdirSync(instanceDir(inst.name)) : []) if (f !== "src") rmSync(join(instanceDir(inst.name), f), { recursive: true, force: true });
      await withState((s) => void delete s.instances[inst.name]).catch((se) => r.log(`warning: could not free slot ${inst.slot}: ${se.message}`));
    }
    (opLock as DirLock | null)?.release();
    if (e instanceof MemoryError) throw new CosmosError(e.message, { ...e.detail, failLog });
    if (failLog && e instanceof Error) e.message += ` (logs: ${failLog})`;
    throw e;
  }

  // The instance is up; from here a failure is reported, never torn down.
  const warnings: string[] = [...softWarnings];
  try {
    const keep = new Set(gen!.volumes);
    const stale: string[] = [];
    for (const v of await instanceVolumes(inst.name)) {
      if (keep.has(v)) continue;
      const labels = (await run(["docker", "volume", "inspect", "-f", "{{json .Labels}}", v], { quiet: true })).stdout;
      if (!labels.includes('"cosmos.data"')) stale.push(v);
    }
    if (stale.length) await removeVolumes(stale).catch((e) => warnings.push(`could not remove old volumes ${stale.join(", ")}: ${e.message}`));

    const cors = await checkInstanceCors(inst, gen!.directOrigins);
    for (const c of cors.filter((c) => !c.allowed)) {
      warnings.push(imode === "edge"
        ? `edge ${c.target} refused the preflight from ${c.origin} (${c.acao ?? c.error ?? `HTTP ${c.status}`}); see: cosmos logs ${inst.name} edge`
        : `${c.target} does not allow origin ${c.origin} (${c.acao ? `Access-Control-Allow-Origin: ${c.acao}` : c.error ?? `no Access-Control-Allow-Origin, HTTP ${c.status}`}); ${c.fe} API calls from the browser will fail CORS until that backend allowlists ${c.origin}${local ? "" : " (or drop --direct to use the edge)"}`);
    }
    for (const w of warnings) r.log(`warning: ${w}`);

    const mem = await instanceMemMiB(inst.name);
    const vmAfter = await vmAvailableMiB();
    const measured = { memMiB: mem.total, byService: mem.byService, at: new Date().toISOString() };
    if (local && timings.cold) recordMeasure((m) => void (m.profiles[profile.id] = { peakMiB: mem.total, at: measured.at, instance: inst.name }));

    for (let attempt = 1; ; attempt++) {
      try {
        await withState((s) => {
          const cur = s.instances[inst.name];
          if (cur) Object.assign(cur, { poll, mode: inst.mode, services: inst.services, ports: inst.ports, edge: inst.edge, image: inst.image, images: inst.images, src: inst.src, live: inst.live, deps: inst.deps, cors, measured, timings, warnings: softWarnings, lastUsed: new Date().toISOString() });
        });
        break;
      } catch (e: any) {
        if (attempt < 3) {
          await Bun.sleep(1000 * attempt);
          continue;
        }
        warnings.push(`instance is running but its state update failed after ${attempt} tries: ${e.message}`);
        break;
      }
    }
    return {
      ok: true, name: inst.name, label: inst.label ?? inst.name, slot: inst.slot, backend: backend.id, profile: profile.id, mode: imode, url: serviceUrl(inst), urls: serviceUrls(inst),
      ports: inst.ports, src: inst.src, live: inst.live ?? [], image: inst.image, images: inst.images ?? {}, edge: gen!.edge, cors, override: overridePath(inst.name), timings,
      memory: { instanceMiB: mem.total, byService: mem.byService, vmBeforeMiB: vmBefore, vmAfterMiB: "error" in vmAfter ? null : vmAfter.mib },
      ...(warnings.length ? { warnings } : {}),
    };
  } finally {
    (opLock as DirLock | null)?.release();
  }
}

// Brings a stopped instance back on its own slot, backend, profile and sources.
export async function start(ref: string, r: Reporter, extra: Pick<UpOpts, "timeoutS" | "owner"> = {}): Promise<UpResult> {
  const inst = getInstance(ref);
  return up({ backend: inst.backend, profile: profileOf(inst), name: inst.name, stored: inst, ...extra }, r);
}

// ---------- source switching ----------

export async function sources(ref: string) {
  const inst = getInstance(ref);
  const rows = await Promise.all(srcServices(inst.services).map(async (svc) => {
    const dir = inst.src[svc] ?? instanceSrcDir(inst.name, svc);
    const own = dir === instanceSrcDir(inst.name, svc);
    const live = !own && !!inst.live?.includes(svc);
    const shared = live ? sharedWith(inst, svc, dir) : [];
    return { ...(existsSync(dir) ? await srcState(svc, dir) : { svc, dir, branch: null, sha: null, dirty: null, pinned: await pinnedSha(svc), atPin: false, upstream: null, ahead: null, behind: null }), own, live, shared };
  }));
  return { name: inst.name, sources: rows };
}

// Other instances that mount the same live checkout for svc.
const sharedWith = (inst: Instance, svc: string, dir: string) =>
  Object.values(readState().instances).filter((i) => i.name !== inst.name && i.live?.includes(svc) && i.src[svc] === dir).map((i) => i.name);

export const sourceRefs = (svc: string, o: { fetch?: boolean } = {}) => {
  if (!svcDef(svc).srcMount) throw new CosmosError(`${svc} runs from its image; it has no source to switch`);
  return listRefs(svc, o);
};

const liveList = (cur: string[] | undefined, svc: string, on: boolean) => {
  const l = (cur ?? []).filter((s) => s !== svc).concat(on ? [svc] : []);
  return l.length ? l : undefined;
};

// Containers that bind-mount svc's checkout: the service itself, plus any service that `uses` it.
const mountsOf = (inst: Instance, svc: string) => inst.services.filter((s) => s === svc || srcSvc(s) === svc);

export type SourceResult = SwitchResult & { name: string; applied: "now" | "next start"; recreated: string[] };

// Moves one service of an instance to a branch, tag or commit (null: the project's pin), and recreates only the containers that mount it.
export async function switchSource(ref: string, svc: string, gitRef: string | null, r: Reporter, timeoutS = 600, o: { force?: boolean; live?: boolean } = {}): Promise<SourceResult> {
  const inst = getInstance(ref);
  const can = srcServices(inst.services);
  if (!can.includes(svc)) throw new CosmosError(`${inst.name} runs ${can.join(", ") || "nothing"} from source; ${svc} is not one of them`);
  if (gitRef !== null && !gitRef.trim()) throw new CosmosError("a branch, tag or commit (or --pinned) is required");
  if (gitRef === null && o.live) throw new CosmosError("--live mounts your clone for a branch it holds; --pinned has none");
  const lock = tryOpLock(inst.name);
  try {
    const sw = await switchWorktree(inst.name, svc, gitRef, r.log, o).catch((e) => {
      throw e instanceof CosmosError ? e : new CosmosError((e as Error).message);
    });
    if (sw.live) {
      const others = sharedWith(inst, svc, sw.dir);
      // node_modules and air's output are volumes or container paths, but some files are written into the source dir (SKILL.md lists them)
      if (others.length) sw.warnings.push(`${svc}: ${others.join(", ")} also mount${others.length === 1 ? "s" : ""} ${sw.dir} live; an edit there reloads all of them`);
    }
    for (const w of sw.warnings) r.log(`warning: ${w}`);
    inst.src = { ...inst.src, [svc]: sw.dir };
    inst.live = liveList(inst.live, svc, sw.live);
    // the checkout has moved, so the record follows now; a failed recreate or a timeout below cannot leave them apart
    await withState((s) => {
      const cur = s.instances[inst.name];
      if (!cur) return;
      cur.src = { ...cur.src, [svc]: sw.dir };
      cur.live = inst.live;
    });
    const mounts = mountsOf(inst, svc);
    const running = (await Promise.all(mounts.map(async (s) => ((await containerState(containerName(inst.name, s)))?.running ? s : null)))).filter((s): s is string => !!s);
    const soft: string[] = [...sw.warnings];
    const recreated: string[] = [];
    if (running.length && existsSync(overridePath(inst.name))) {
      const backend = findBackend(inst.backend)!;
      const images = { ...(inst.images ?? {}) };
      // records made before the shared-tag plan kept the main FE's image only in inst.image
      const fe = mainFe(inst.services);
      if (inst.image && !images[fe]) images[fe] = inst.image;
      generateStack({ name: inst.name, slot: inst.slot, backend, services: inst.services, ports: inst.ports, src: inst.src, images, mode: modeOf(inst), goMode: inst.goMode ?? "air", poll: inst.poll ?? false, edge: inst.edge });
      if (svcDef(svc).syncDeps) {
        await compose(inst.name, ["stop", svc], { check: true, onOutput: r.output });
        await syncDeps(inst, svc, sw.dir, r, soft);
      }
      r.log(`recreating ${running.join(", ")}`);
      await compose(inst.name, ["up", "-d", "--no-deps", "--no-build", "--force-recreate", ...running], { check: true, onOutput: r.output });
      recreated.push(...running);
      // a one-shot that mounts the source is re-created, not run
      const once = mounts.filter((s) => !running.includes(s) && svcDef(s).kind === "init");
      if (once.length) await compose(inst.name, ["up", "--no-start", "--no-deps", "--no-build", "--force-recreate", ...once], { check: true, onOutput: r.output });
      const d = svcDef(svc);
      if (d.health && inst.ports[svc]) {
        const path = d.kind === "fe" ? readyPath(svc) : d.health;
        const ms = await waitHttp(`http://127.0.0.1:${inst.ports[svc]}${path}`, timeoutS * 1000, (st) => st < 500);
        r.log(`${svc} answering in ${Math.round(ms / 1000)}s`);
      }
    } else r.log(`${inst.name} is not running ${svc}; the switch applies on its next start`);
    await withState((s) => {
      const cur = s.instances[inst.name];
      if (!cur) return;
      if (inst.deps) cur.deps = inst.deps;
      cur.warnings = [...(cur.warnings ?? []).filter((w) => !w.startsWith(`${svc}: `) && !w.startsWith(`${svc} still runs the shared`)), ...soft];
      cur.lastUsed = new Date().toISOString();
    });
    return { ...sw, warnings: soft, name: inst.name, applied: running.length ? "now" : "next start", recreated };
  } finally {
    lock.release();
  }
}

function findInstance(s: State, ref: string): Instance {
  try {
    const i = findByRef(ref, Object.values(s.instances));
    if (!i) throw new CosmosError(`no instance ${ref}`);
    return i;
  } catch (e) {
    throw e instanceof CosmosError ? e : new CosmosError((e as Error).message);
  }
}

// name may be an id or a label
export function getInstance(name: string): Instance {
  return findInstance(readState(), name);
}

export function pickInstances(names: string[], all: boolean): Instance[] {
  const s = readState();
  if (all) return Object.values(s.instances);
  if (!names.length) throw new CosmosError("name required (or --all)");
  return names.map((n) => findInstance(s, n));
}

// down: containers go, slot and volumes stay. remove: volumes, per-instance image tags and slot go too.
export async function down(names: string[], o: { all?: boolean; remove: boolean; force?: boolean }, r: Reporter): Promise<{ done: string[]; warnings: string[] }> {
  const done: string[] = [];
  const warnings: string[] = [];
  for (const i of pickInstances(names, !!o.all)) {
    const lock = tryOpLock(i.name);
    try {
      if (o.remove && !o.force) {
        const unsaved: string[] = [];
        for (const w of instanceWorktrees(i.name)) {
          const u = await unsavedWork(w.dir);
          if (u) unsaved.push(`${w.svc} (${u}, ${w.dir})`);
        }
        if (unsaved.length) throw new CosmosError(`not removing ${i.name}: its worktrees hold work that would be lost: ${unsaved.join("; ")}. Commit or push it, or rm --force`, { unsaved });
      }
      const extra = (await A().beforeDown?.(ctx(), i, { remove: o.remove }, r)) || {};
      if (i.share) await (o.remove ? endShare(i, r) : pauseShare(i, r));
      if (o.remove && i.shareName?.owned) {
        const n = i.shareName.name;
        r.log(`releasing zrok name ${n}`);
        const res = await releaseName(n);
        if (!res.ok) {
          const w = `zrok name ${n} was not released (${res.error}); the next cosmos share retries it`;
          r.log(`warning: ${w}`);
          warnings.push(w);
          await withState((s) => void (s.pendingRelease = [...new Set([...(s.pendingRelease ?? []), n])]));
        }
      }
      r.log(`${o.remove ? "removing" : "stopping"} ${i.name}`);
      if (existsSync(overridePath(i.name))) {
        await compose(i.name, o.remove ? ["down", "-v", "--remove-orphans"] : ["down"], { check: true, onOutput: r.output });
      }
      if (o.remove) {
        const vols = [...new Set([...(extra.volumes ?? []), ...(await instanceVolumes(i.name))])].filter(Boolean);
        await removeVolumes(vols);
        await untagImages(Object.entries(i.images ?? {}).filter(([k]) => !k.endsWith("@shared")).map(([, v]) => v));
        await removeWorktrees(i.name, r.log, { force: o.force });
        rmSync(instanceDir(i.name), { recursive: true, force: true });
        await withState((s) => void delete s.instances[i.name]);
      }
      done.push(i.name);
    } finally {
      lock.release();
    }
  }
  return { done, warnings };
}

// ---------- status ----------

export type SvcStatus = { service: string; port: number | null; url: string | null; status: string; running: boolean; health: string | null; http: { status: number | null; ok: boolean } | null };

export async function status(ref: string) {
  const i = getInstance(ref);
  const name = i.name;
  const cs = (await cosmosContainers()).filter((c) => c.instance === name);
  const urls = serviceUrls(i);
  const svcs: SvcStatus[] = await Promise.all(
    i.services.map(async (svc) => {
      const c = cs.find((x) => x.service === svc);
      const d = svcDef(svc);
      let http: SvcStatus["http"] = null;
      if (c?.running && d.health && i.ports[svc]) {
        try {
          const r = await fetch(`http://127.0.0.1:${i.ports[svc]}${d.health}`, { signal: AbortSignal.timeout(3000), redirect: "manual" });
          await r.arrayBuffer().catch(() => {});
          http = { status: r.status, ok: r.status < 500 };
        } catch {
          http = { status: null, ok: false };
        }
      }
      return { service: svc, port: i.ports[svc] ?? null, url: urls[svc] ?? null, status: c?.status ?? "absent", running: !!c?.running, health: c?.health ?? null, http };
    }),
  );
  const feSvc = i.share ? svcs.find((x) => x.service === i.share!.fe) : undefined;
  const share = await shareView(i, !!feSvc?.running);
  return { name, label: i.label ?? i.name, profile: profileOf(i), backend: i.backend, mode: modeOf(i), services: svcs, workers: await workers(i), cors: i.cors ?? [], measured: i.measured ?? null, share };
}

export type LsRow = Omit<Instance, "label"> & { label: string; url: string; urls: Record<string, string>; status: string; up: number; of: number; shareUp: boolean | null; shareState: ShareState | null };

// A long-running service counts; one-shot init containers do not.
const longRunning = (svcs: string[]) => svcs.filter((s) => svcDef(s).kind !== "init");

export async function list(): Promise<LsRow[]> {
  const s = readState();
  const cs = await cosmosContainers().catch(() => []);
  const shareSt: Record<string, ShareState> = {};
  await Promise.all(Object.values(s.instances).map(async (i) => {
    if (!i.share) return;
    const fe = cs.find((c) => c.instance === i.name && c.service === i.share!.fe);
    shareSt[i.name] = (await shareState(i.share, !!fe?.running)).state;
  }));
  return Object.values(s.instances)
    .sort((a, b) => a.slot - b.slot)
    .map((i) => {
      const lr = longRunning(i.services);
      const up = lr.filter((svc) => cs.find((c) => c.instance === i.name && c.service === svc)?.running).length;
      const fe = cs.find((c) => c.instance === i.name && c.service === mainFe(i.services));
      const status = lr.length === 1 ? fe?.status ?? "absent" : up === 0 ? (cs.some((c) => c.instance === i.name) ? "exited" : "absent") : up === lr.length ? "running" : `partial ${up}/${lr.length}`;
      return { ...i, label: i.label ?? i.name, url: serviceUrl(i), urls: serviceUrls(i), status, up, of: lr.length, shareUp: i.share ? shareSt[i.name] === "live" : null, shareState: shareSt[i.name] ?? null };
    });
}

// ---------- share ----------

const LOCAL_PORT = /\b(?:https?|wss?):\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})(?!\d)/g;

// Ports a share may reach under /__cosmos/<port>: only what the served FE calls (localhost URLs in its container env and
// env files: its API and edge listeners), plus what the adapter adds. Never another FE.
export async function shareReach(i: Instance, fe: string): Promise<Record<string, number>> {
  const keyOf = new Map(Object.entries(i.ports).map(([k, p]) => [p, k]));
  const texts: string[] = [];
  const r = await run(["docker", "inspect", containerName(i.name, fe)], { quiet: true });
  if (r.code === 0) {
    const c = JSON.parse(r.stdout)[0] as { Config: { Env: string[] }; Mounts: { Type: string; Source: string; Destination: string }[] };
    texts.push(c.Config.Env.join("\n"));
    for (const m of c.Mounts) {
      if (m.Type !== "bind" || !/\/envs$/.test(m.Destination) || !existsSync(m.Source)) continue;
      for (const f of readdirSync(m.Source)) try { texts.push(readFileSync(join(m.Source, f), "utf8")); } catch {}
    }
  }
  const out: Record<string, number> = {};
  for (const t of texts) for (const m of t.matchAll(LOCAL_PORT)) {
    const k = keyOf.get(Number(m[1]));
    if (k && SVC_DEFS().find((d) => d.svc === k)?.kind !== "fe") out[k] = Number(m[1]);
  }
  return A().shareReach?.(ctx(), i, fe, out) ?? out;
}

// paths a share blocks unless --expose-admin (adapter.shareBlock)
export function shareBlock(i: Instance, exposeAdmin: boolean): { port: number; prefixes: string[] }[] {
  if (exposeAdmin) return [];
  return A().shareBlock?.(ctx(), i, exposeAdmin) ?? [];
}

// One line: what someone opening the link gets (adapter.remoteView, else a generic line).
export function remoteView(i: Instance, fe: string, sh: Pick<Share, "url" | "public" | "exposeAdmin" | "notice" | "reach">): string {
  const custom = A().remoteView?.(ctx(), i, fe, sh);
  if (custom) return custom;
  const gate = sh.public ? "no password" : "share password first";
  const others = i.services.filter((s) => svcDef(s).kind === "fe" && s !== fe);
  const also = others.length ? ` ${others.join(", ")} not in this share (one FE per share: cosmos share ${i.name} --fe ${others[0]} instead).` : "";
  const r = sh.reach;
  const reach = r ? ` Reachable: ${fe} at /${Object.keys(r).length ? `, ${Object.entries(r).map(([k, p]) => `${k} at /__cosmos/${p}`).join(", ")}` : ""}; nothing else on this stack.` : "";
  return `${fe} preview build against ${modeOf(i) === "local" ? "this stack's own backends" : i.backend} (${gate}).${reach}${also}`;
}

// ifStill: restart only the share seen at that moment (the supervisor, up resuming); gives up if it was turned off or changed since.
export type ShareOpts = { fe?: string; public?: boolean; exposeAdmin?: boolean; ifStill?: Pick<Share, "startedAt" | "proxyPid"> };
export type ShareView = Share & { state: ShareState; reason: string | null; preview: ShareStatus["preview"] | null; remote: string; warnings: string[] };
export type ShareResult = ShareView & { name: string; reused: boolean };

const feUp = async (i: Instance, fe: string) => {
  try {
    await fetch(`http://127.0.0.1:${i.ports[fe]}/`, { signal: AbortSignal.timeout(5000), redirect: "manual" }).then((x) => x.arrayBuffer());
    return true;
  } catch {
    return false;
  }
};

export async function shareView(i: Instance, instanceUp?: boolean): Promise<ShareView | null> {
  if (!i.share) return null;
  const s = i.share;
  const up = instanceUp ?? (await feUp(i, s.fe));
  const st = await shareState(s, up);
  return { ...s, state: st.state, reason: st.reason, preview: st.status?.preview ?? null, remote: remoteView(i, s.fe, s), warnings: s.warnings ?? [] };
}

// Turns sharing on (or brings a share that is on back up). Never fails for zrok-side limits: the share is recorded unavailable with the reason.
export async function share(ref: string, o: ShareOpts, r: Reporter): Promise<ShareResult> {
  const name = getInstance(ref).name;
  // everything below reads the instance under the op lock, so an unshare that returned is never undone
  const lock = tryOpLock(name);
  try {
    let i = getInstance(name);
    if (o.ifStill && (!i.share || i.share.startedAt !== o.ifStill.startedAt || i.share.proxyPid !== o.ifStill.proxyPid)) {
      throw new CosmosError(`the share of ${name} was turned off or changed; not restarting it`, { stale: true });
    }
    await retryPendingReleases(r.log);
    if (i.share?.proxyPid && !i.share.unavailable) {
      const a = await shareAlive(i.share);
      const same = (o.fe === undefined || o.fe === i.share.fe) && (o.public === undefined || o.public === i.share.public) && (o.exposeAdmin === undefined || !!o.exposeAdmin === !!i.share.exposeAdmin);
      if (a.proxy && same) return { ...(await shareView(i, true))!, name: i.name, reused: true };
      r.log(a.proxy ? `resharing ${i.name} with the new options` : `the share proxy of ${i.name} is not running; starting it again`);
      await stopShare(i.name, i.share, { keep: true });
    }
    if (modeOf(i) === "direct") throw new CosmosError(`${i.name} runs in direct mode: its browser calls the real backend hosts, whose CORS will not allow the share's origin. Re-up it without --direct to share it`);
    const fes = i.services.filter((s) => svcDef(s).kind === "fe");
    const fe = o.fe ?? i.share?.fe ?? mainFe(i.services);
    if (!fes.includes(fe)) throw new CosmosError(`${i.name} runs no FE ${fe}${fes.length ? `; it has ${fes.join(", ")}` : ""}`);
    const recipe = previewRecipe(i, fe);
    if (!recipe) throw new CosmosError(`cosmos shares an FE as a preview build, and the project has no preview recipe for ${fe}`);
    const pub = o.public ?? i.share?.public ?? true;
    const exposeAdmin = o.exposeAdmin ?? i.share?.exposeAdmin ?? false;
    const port = hostPort(i.slot, "share");
    const warnings: string[] = [];
    if (findBackend(i.backend)?.live) warnings.push(`${i.backend} is live customer data; anyone with the link${pub ? "" : " and password"} reaches it as whoever signs in`);
    if (exposeAdmin) warnings.push("--expose-admin: admin paths the project blocks on shares are reachable");

    const record = async (sh: Share) => {
      const kept = await withState((s) => {
        const x = s.instances[i.name];
        if (!x) return false;
        x.share = sh;
        return true;
      });
      if (!kept) {
        await stopShare(i.name, sh, { keep: false });
        throw new CosmosError(`${i.name} was removed while it was being shared`);
      }
      i = getInstance(i.name);
      return { ...(await shareView(i))!, name: i.name, reused: false };
    };
    const base = { port, fe, public: pub, user: null, password: null, exposeAdmin, proxyPid: 0, proxyCmd: "", previewContainer: null, startedAt: new Date().toISOString() };
    const unavailable = (why: string, zrokName: string | null = i.shareName?.name ?? null) => {
      r.log(`share unavailable: ${why}`);
      return record({ ...base, url: zrokName ? `https://${zrokName}.${ZROK_HOST}` : "", zrokName, unavailable: why, warnings: [...warnings, `share unavailable: ${why}`] });
    };
    const z = await zrokInfo(false);
    if (!z.bin) return await unavailable("zrok is not installed (brew install zrok)");
    if (!z.enabled) return await unavailable("this Mac's zrok environment is not enabled (zrok enable <token>)");

    // account limits: shares across every environment on the account, and minted names when a cap is configured
    const usage = await zrokUsage();
    if (usage && usage.shares >= usage.maxShares) return await unavailable(`zrok account has ${usage.shares} of ${usage.maxShares} shares in use`);
    let named = i.shareName;
    if (!named) {
      if (usage?.maxNames && usage.names >= usage.maxNames) return await unavailable(`zrok account has ${usage.names} of ${usage.maxNames} names reserved`, null);
      const others = Object.values(readState().instances).flatMap((x) => (x.shareName ? [x.shareName.name] : []));
      const m = await mintName(i, others, r.log);
      if (m.limited) return await unavailable(m.limited, null);
      if (m.warning) warnings.push(m.warning);
      if (m.name) {
        named = { name: m.name, owned: m.owned };
        const n = named;
        await withState((s) => void (s.instances[i.name] && (s.instances[i.name].shareName = n)));
      }
    }
    const zrokName = named?.name ?? null;
    const shareNotice = zrokName ? A().shareNotice?.(ctx(), i, fe, `https://${zrokName}.${ZROK_HOST}`) ?? null : null;
    const notice = shareNotice?.text ?? null;

    const running = await feUp(i, fe);
    if (!running) {
      r.log(`${i.name}'s ${fe} is not running; the share starts with the instance`);
      return await record({ ...base, url: zrokName ? `https://${zrokName}.${ZROK_HOST}` : "", zrokName, notice, warnings });
    }
    const held = await portOwner(port);
    if (held) throw new CosmosError(`share port ${port} is held by ${held}`, { portOwner: held });
    const vm = await vmAvailableMiB();
    if (!("error" in vm) && vm.mib < recipe.needMiB + VM_FLOOR_MIB) warnings.push(`the preview build needs ~${recipe.needMiB} MiB and the VM has ${vm.mib} MiB available; it waits for memory`);
    const reach = await shareReach(i, fe);
    const sh = await startShare({
      inst: i, fe, fePort: i.ports[fe], allowed: Object.values(reach), port, public: pub, zrokName,
      block: shareBlock(i, exposeAdmin), notice: shareNotice?.html ?? null,
      previewMode: A().previewMode?.(ctx(), i, fe) ?? "production", srcDir: i.src[fe] ?? null, log: r.log,
    }).catch((e) => {
      throw new CosmosError((e as Error).message);
    });
    return await record({ ...sh, exposeAdmin, notice, warnings, reach });
  } finally {
    lock.release();
  }
}

// down: processes go, the share stays on. unshare: the share goes, the name stays for the next share. rm: the name is released.
async function pauseShare(i: Instance, r: Reporter) {
  if (!i.share) return;
  r.log(`pausing share ${i.share.url}`);
  await stopShare(i.name, i.share, { keep: true });
  await withState((s) => {
    const x = s.instances[i.name]?.share;
    if (x) Object.assign(x, { proxyPid: 0, proxyCmd: "", previewContainer: null, zrokPid: undefined, zrokCmd: undefined });
  });
}

async function endShare(i: Instance, r: Reporter) {
  if (!i.share) return;
  r.log(`stopping share ${i.share.url}`);
  await stopShare(i.name, i.share, { keep: false });
  // 9fe34f7 shares released a name they reserved on unshare
  if (i.share.reservedName && i.share.zrokName && i.share.zrokName !== i.shareName?.name) await releaseName(i.share.zrokName);
  await withState((s) => void delete s.instances[i.name]?.share);
}

export async function unshare(ref: string, r: Reporter): Promise<{ name: string; stopped: string | null }> {
  const name = getInstance(ref).name;
  const lock = tryOpLock(name);
  try {
    const i = getInstance(name);
    if (!i.share) return { name, stopped: null };
    const url = i.share.url;
    await endShare(i, r);
    return { name, stopped: url };
  } finally {
    lock.release();
  }
}

// rm's name releases that zrok refused; the next share run retries them
async function retryPendingReleases(log: (m: string) => void) {
  const pending = readState().pendingRelease ?? [];
  if (!pending.length) return;
  const done: string[] = [];
  for (const n of pending) {
    const res = await releaseName(n);
    if (res.ok) {
      log(`released zrok name ${n} (left over from rm)`);
      done.push(n);
    } else log(`zrok name ${n} is still not released: ${res.error}`);
  }
  if (done.length) await withState((s) => void (s.pendingRelease = (s.pendingRelease ?? []).filter((n) => !done.includes(n))));
}

export function ports(names: string[]) {
  const s = readState();
  const insts = names.length ? pickInstances(names, false) : Object.values(s.instances);
  const offsets = OFFSETS();
  return insts.map((i) => ({
    name: i.name,
    label: i.label ?? i.name,
    slot: i.slot,
    range: [BASE_PORT + SLOT_STRIDE * i.slot, BASE_PORT + SLOT_STRIDE * i.slot + SLOT_STRIDE - 1] as [number, number],
    enabled: i.ports,
    urls: serviceUrls(i),
    reserved: Object.fromEntries(Object.keys(offsets).map((k) => [k, hostPort(i.slot, offsets[k])])),
  }));
}

function logArgs(ref: string, svc: string, o: { tail?: number; follow?: boolean; timestamps?: boolean }) {
  const inst = getInstance(ref);
  const name = inst.name;
  if (!inst.services.includes(svc)) throw new CosmosError(`${name} has no service ${svc} (runs: ${inst.services.join(", ")})`);
  if (!existsSync(overridePath(name))) throw new CosmosError(`${name} has no compose override; it was never started`);
  return ["logs", "--no-log-prefix", ...(o.timestamps ? ["--timestamps"] : []), "--tail", String(o.tail ?? 200), ...(o.follow ? ["-f"] : []), svc];
}

export async function logs(ref: string, svc: string, o: { tail?: number; follow?: boolean; inherit?: boolean }): Promise<RunResult> {
  const name = getInstance(ref).name;
  const args = logArgs(name, svc, o);
  return o.inherit ? compose(name, args, { inherit: true }) : compose(name, args, { check: true });
}

// Long-lived follower for streaming consumers; caller kills it.
export function spawnLogs(ref: string, svc: string, tail: number) {
  const name = getInstance(ref).name;
  const args = logArgs(name, svc, { tail, follow: true, timestamps: true });
  return Bun.spawn([...composeArgs(name), ...args], { stdout: "pipe", stderr: "pipe" });
}

export async function gitInfo(dir: string): Promise<{ branch: string | null; sha: string | null; dirty: number | null }> {
  const [b, h, st] = await Promise.all([
    run(["git", "-C", dir, "symbolic-ref", "--short", "-q", "HEAD"], { quiet: true, env: GIT_ENV }),
    run(["git", "-C", dir, "rev-parse", "HEAD"], { quiet: true, env: GIT_ENV }),
    run(["git", "-C", dir, "status", "--porcelain", "--untracked-files=no"], { quiet: true, env: GIT_ENV }),
  ]);
  return {
    branch: b.code === 0 ? b.stdout.trim() : null,
    sha: h.code === 0 ? h.stdout.trim() : null,
    dirty: st.code === 0 ? st.stdout.split("\n").filter(Boolean).length : null,
  };
}

// Builds every image a profile needs, one at a time, without starting anything.
export async function buildProfile(profileId: string, o: { goMode?: "air" | "image"; force?: boolean }, r: Reporter) {
  await ensureVendor(r.log);
  const profile = findProfile(profileId);
  if (!profile) throw new CosmosError(`unknown profile ${profileId}`);
  await ensureServiceSources(profile.services, r.log);
  const goMode = o.goMode ?? "air";
  const specs: BuildSpec[] = [];
  const seen = new Set<string>();
  for (const svc of profile.services) {
    for (const spec of (await buildPlanFor(svc, goMode))?.specs ?? []) {
      if (seen.has(spec.tag)) continue;
      seen.add(spec.tag);
      specs.push(spec);
    }
  }
  const results: { tag: string; key: string; built: boolean; ms?: number }[] = [];
  for (const spec of specs) {
    const res = await ensureImage(spec, r, !!o.force).catch((e) => {
      throw e instanceof MemoryError ? new CosmosError(e.message, e.detail) : e;
    });
    results.push({ tag: spec.tag, key: spec.key, ...res });
  }
  return { profile: profile.id, images: results };
}

