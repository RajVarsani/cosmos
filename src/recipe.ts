// The run recipe from cosmos.yaml, applied: templates, conditional env, browser env files, extra volumes, image keys,
// dependency installs, init checks, seed, secrets, backend availability, share previews and dashboard looks.
// Everything here is generic; the project's specifics arrive as manifest data.
import { createHash } from "crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, isAbsolute, join, posix } from "path";
import type { BrowserEnv, BuildPlan, BuildQuery, BackendStatus, Check, GenContext, PreviewRecipe, SeedResult, ServiceDraft, StackPlan, DashboardMeta } from "./api";
import { findSvc, loginConfig, manifest, repoOf, srcSvc, svcDef, vendorDir, vendorSvcDir, type Backend, type EnvValue, type Profile, type SvcDef } from "./catalog";
import { compose, containerState, volumeExists } from "./docker";
import { envDir, parseDotenv } from "./envfile";
import { CosmosError, type Reporter } from "./errors";
import { containerName, instanceDir, slug } from "./generate";
import { waitHttp, workers } from "./probe";
import { run } from "./sh";
import { composeBuildSpec, composeDoc, gitHead, rewriteLocalPorts, writeEnvFile } from "./stack";
import type { Instance } from "./state";
import { pinnedSha } from "./vendor";

// ---------- templates ----------

export type TCtx = {
  ports?: Record<string, number>;
  origins?: string[];
  vars?: Record<string, string>;
  instance?: string;
  dir?: string;
  layout?: Record<string, string>;
  // one-off names: mode, origin, bin, code, last
  extra?: Record<string, string>;
};

export class TemplateMissing extends Error {
  constructor(public ref: string) {
    super(`no value for {{${ref}}}`);
  }
}

function lookup(ref: string, c: TCtx): string | undefined {
  const [head, ...rest] = ref.split(".");
  const tail = rest.join(".");
  switch (head) {
    case "port": return c.ports?.[tail] !== undefined ? String(c.ports[tail]) : undefined;
    case "origins": return c.origins ? c.origins.join(",") : undefined;
    case "login": {
      const l = loginConfig();
      return l ? String((l as Record<string, unknown>)[tail] ?? "") : undefined;
    }
    case "vars": return c.vars?.[tail] || undefined;
    case "env": return tail ? envDir(tail) : undefined;
    case "dir": return c.dir;
    case "instance": return c.instance;
    case "layout": return c.layout?.[tail];
    default: return c.extra?.[ref];
  }
}

// {{ref}} -> value; a ref with no value throws TemplateMissing. esc transforms each substituted value (regex escaping).
export function tmpl(s: string, c: TCtx, esc: (v: string) => string = (v) => v): string {
  return s.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, ref: string) => {
    const v = lookup(ref, c);
    if (v === undefined) throw new TemplateMissing(ref);
    return esc(v);
  });
}

export const refsOf = (s: string) => [...s.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map((m) => m[1]);

// if: service names, local, remote, poll; all must hold, !x negates
export type CondCtx = { services: string[]; local: boolean; poll: boolean };
export function holds(conds: string[] | undefined, q: CondCtx): boolean {
  return (conds ?? []).every((w) => {
    const neg = w.startsWith("!");
    const t = neg ? w.slice(1) : w;
    const yes = t === "local" ? q.local : t === "remote" ? !q.local : t === "poll" ? q.poll : q.services.includes(t);
    return neg ? !yes : yes;
  });
}

// the env entries whose condition holds, unresolved
export function envEntries(env: Record<string, EnvValue> | undefined, q: CondCtx): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(env ?? {})) {
    if (typeof v === "string") out.push([k, v]);
    else if (holds(v.if, q)) out.push([k, v.value]);
    else if (v.else !== undefined) out.push([k, v.else]);
  }
  return out;
}

function resolveEnv(svc: string, env: Record<string, EnvValue> | undefined, q: CondCtx, c: TCtx): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of envEntries(env, q)) {
    try {
      out[k] = tmpl(v, c);
    } catch (e) {
      if (e instanceof TemplateMissing) throw new CosmosError(`cosmos.yaml: ${svc} env ${k}: ${e.message}`);
      throw e;
    }
  }
  return out;
}

// ---------- vars and layouts ----------

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&");
const srcDirOf = (svc: string, src?: Record<string, string>) => src?.[svc] ?? vendorSvcDir(repoOf(svc));

// a backend's vars plus the manifest's derived vars, read from the services' sources
export function backendVars(b: Backend, src?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...b.vars };
  for (const [k, d] of Object.entries(manifest().vars)) {
    const f = join(srcDirOf(d.service, src), d.file);
    if (!existsSync(f)) continue;
    let re: RegExp;
    try {
      re = new RegExp(tmpl(d.match, { vars: b.vars }, reEsc));
    } catch {
      continue;
    }
    const m = readFileSync(f, "utf8").match(re);
    if (m?.[1]) out[k] = m[1];
  }
  return out;
}

export function layoutVars(d: SvcDef, dir: string | undefined): Record<string, string> {
  for (const l of d.layouts ?? []) if (!l.when || (dir && existsSync(join(dir, l.when)))) return l.vars;
  return {};
}

const kindOf = (i: Pick<Instance, "mode">) => (i.mode === "local" ? "local" : "remote");

// ---------- browser env ----------

function srcReads(dir: string, key: string): boolean {
  if (!existsSync(dir)) return true;
  return Bun.spawnSync(["grep", "-rqsF", "--include=*.ts", "--include=*.tsx", "--include=*.js", "--include=*.jsx", key, dir]).exitCode === 0;
}

type FePlan = Pick<StackPlan, "backend" | "ports" | "services" | "src"> & { poll?: boolean; name?: string; origins?: string[] };

// an fe's env as its browser sees it before the edge: env files, the compose environment (local), then cosmos.yaml env
export function feEnv(d: SvcDef, p: FePlan): Record<string, string> {
  const local = p.backend.kind === "local";
  const dir = srcDirOf(srcSvc(d.svc), p.src);
  const c: TCtx = { ports: p.ports, origins: p.origins, vars: backendVars(p.backend, p.src), instance: p.name, dir: p.name ? instanceDir(p.name) : undefined, layout: layoutVars(d, dir) };
  const env: Record<string, string> = {};
  for (const f of d.browser?.files[local ? "local" : "remote"] ?? []) {
    let path: string;
    try {
      path = tmpl(f, c);
    } catch {
      continue;
    }
    if (existsSync(path)) Object.assign(env, parseDotenv(readFileSync(path, "utf8")));
  }
  if (local) {
    const g = composeDoc().services[d.svc];
    for (const [k, v] of Object.entries(g?.environment ?? {})) env[k] = rewriteLocalPorts(String(v ?? ""), p.ports);
  }
  Object.assign(env, resolveEnv(d.svc, d.env, { services: p.services, local, poll: !!p.poll }, c));
  return env;
}

export function browserEnvs(p: FePlan): BrowserEnv[] {
  return p.services.flatMap((svc) => {
    const d = findSvc(svc);
    if (!d?.browser) return [];
    const dir = srcDirOf(srcSvc(svc), p.src);
    const keysIn = d.browser.keysIn ? join(dir, posix.normalize(tmpl(d.browser.keysIn, { layout: layoutVars(d, dir) }))) : null;
    return [{ fe: svc, env: feEnv(d, p), keys: keysIn ? d.browser.keys.filter((k) => srcReads(keysIn, k)) : d.browser.keys }];
  });
}

// ---------- the compose override ----------

// cosmos.yaml's part of a service: env, browser env file, extra volumes, command
export function applyRecipe(draft: ServiceDraft, gen: GenContext) {
  const d = draft.def;
  const p = gen.plan;
  const q: CondCtx = { services: p.services, local: gen.local, poll: p.poll };
  const dir = srcDirOf(srcSvc(d.svc), p.src);
  const c: TCtx = { ports: p.ports, origins: gen.origins, vars: backendVars(p.backend, p.src), instance: p.name, dir: gen.dir, layout: layoutVars(d, dir) };
  // remote stacks run their FEs alone
  if (!gen.local) draft.resetDependsOn = true;
  if (d.browser) {
    const env = feEnv(d, { ...p, origins: gen.origins });
    const keys = browserEnvs(p).find((e) => e.fe === d.svc)?.keys ?? d.browser.keys;
    const file = join(gen.dir, `${d.svc}.env`);
    writeEnvFile(file, `generated by cosmos for ${p.name} (backend ${p.backend.id}, ${p.mode})`, gen.toBrowser(d.svc, env, keys));
    Object.assign(draft, { envFile: [{ path: file, required: true }], env: {}, envOverride: true });
  } else Object.assign(draft.env, resolveEnv(d.svc, d.env, q, c));
  for (const raw of d.volumes ?? []) {
    const v = tmpl(raw, c);
    const [x, b, mode] = v.split(":");
    if (b === undefined) {
      draft.volumes.push({ type: "volume", source: gen.vol(`cosmos-${p.name}-${d.svc}-${slug(x)}-${gen.imgTag(d.svc, draft.image)}`, { "cosmos.image": draft.image ?? "" }), target: x });
      continue;
    }
    const source = x.startsWith("./") ? join(vendorDir(), x.slice(2)) : x;
    if (!isAbsolute(source)) throw new CosmosError(`cosmos.yaml: ${d.svc} volume ${raw}: source must be absolute, ./ (the project) or a template`);
    if (source.startsWith(gen.dir)) mkdirSync(source, { recursive: true });
    draft.volumes.push({ type: "bind", source, target: posix.normalize(b), read_only: mode === "ro" || undefined });
  }
  if (d.command) draft.command = d.command.map((s) => tmpl(s, c));
}

const j = (v: unknown) => JSON.stringify(v);

// services that are not in the project's compose (extras), from their manifest definition
export function extraServices(gen: GenContext): string[] {
  const p = gen.plan;
  const doc = composeDoc();
  const net = manifest().network ?? Object.keys((doc as { networks?: object }).networks ?? {})[0];
  const lines: string[] = [];
  for (const svc of p.services) {
    const d = svcDef(svc);
    if (!d.extra) continue;
    const c: TCtx = { ports: p.ports, origins: gen.origins, vars: backendVars(p.backend, p.src), instance: p.name, dir: gen.dir };
    const env = resolveEnv(svc, d.env, { services: p.services, local: gen.local, poll: p.poll }, c);
    const deps = Object.fromEntries((d.dependsOn ?? []).filter((s) => p.services.includes(s)).map((s) => [s, { condition: (doc.services[s] as { healthcheck?: unknown })?.healthcheck ? "service_healthy" : "service_started" }]));
    lines.push(
      `  ${svc}:`,
      `    container_name: ${j(containerName(p.name, svc))}`,
      `    labels: ${j({ "cosmos.instance": p.name, "cosmos.service": svc, "cosmos.project": manifest().projectId })}`,
      `    image: ${j(p.images[svc])}`,
      `    pull_policy: never`,
      `    restart: unless-stopped`,
      ...(Object.keys(deps).length ? [`    depends_on: ${j(deps)}`] : []),
      `    environment: ${j(env)}`,
      ...(d.offset !== undefined && d.containerPort ? [`    ports: ${j([`127.0.0.1:${p.ports[svc]}:${d.containerPort}`])}`] : []),
      ...(net ? [`    networks: [${net}]`] : []),
    );
  }
  return lines;
}

export function airCommands(svc: string, bin: string): { build?: string; run?: string } {
  const a = findSvc(svc)?.air;
  return { build: a?.build && tmpl(a.build, { extra: { bin } }), run: a?.run && tmpl(a.run, { extra: { bin } }) };
}

// ---------- images ----------

// undefined: the core default
export async function buildPlan(q: BuildQuery): Promise<BuildPlan | undefined> {
  const d = svcDef(q.svc);
  if (d.image) {
    const base = await composeBuildSpec(q.svc);
    if (!base) throw new CosmosError(`cosmos.yaml: ${q.svc} has image.hashFiles but its compose service has no build`);
    const h = createHash("sha256");
    for (const alt of d.image.hashFiles) {
      const f = alt.split("|").map((x) => join(vendorDir(), x)).find(existsSync);
      if (!f) throw new CosmosError(`cosmos.yaml: ${q.svc} image.hashFiles: none of ${alt} exists in ${vendorDir()}`);
      h.update(readFileSync(f));
    }
    return { specs: [{ ...base, tag: `cosmos-${srcSvc(q.svc)}:${h.digest("hex").slice(0, 12)}` }], instanceTag: !d.image.shared };
  }
  if (d.go && q.goMode === "air" && d.air?.target) {
    const spec = await composeBuildSpec(q.svc, q.sourceImages ? q.src[srcSvc(q.svc)] : undefined, d.air.target);
    if (spec) return { specs: [spec] };
  }
  return undefined;
}

// ---------- lifecycle ----------

// keys an env file lacks, read once from a command's JSON output; appended, never overwritten; logs key names only
export async function fillSecrets(services: string[], log: (m: string) => void) {
  for (const s of manifest().secrets) {
    if (!services.includes(s.service)) continue;
    const file = tmpl(s.file, {});
    const have = existsSync(file) ? parseDotenv(readFileSync(file, "utf8")) : {};
    const missing = s.keys.filter((k) => !have[k]);
    if (!missing.length) continue;
    const r = await run(s.command, { quiet: true, timeoutMs: 30_000 }).catch((e) => ({ code: 1, stdout: "", stderr: String(e) }));
    let got: Record<string, unknown> = {};
    try {
      if (r.code === 0) got = JSON.parse(r.stdout);
    } catch {}
    const found = missing.filter((k) => typeof got[k] === "string" && got[k]);
    if (!found.length) {
      log(`warning: ${s.service} env lacks ${missing.join(", ")} and ${s.command[0]} could not read them${s.fix ? ` (${s.fix})` : ""}: ${r.stderr.trim().split("\n")[0] || "keys not in the output"}`);
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    const prev = existsSync(file) ? readFileSync(file, "utf8") : "";
    const q = (v: string) => (v.includes("'") ? JSON.stringify(v) : `'${v}'`);
    appendFileSync(file, (prev && !prev.endsWith("\n") ? "\n" : "") + found.map((k) => `${k}=${q(String(got[k]))}`).join("\n") + "\n", { mode: 0o600 });
    chmodSync(file, 0o600);
    log(`filled ${found.join(", ")} into ${file}`);
  }
}

function lockHash(dir: string, lockfile: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(join(dir, lockfile))).digest("hex").slice(0, 12);
  } catch {
    return null;
  }
}

// installs the checkout's deps into the instance's volumes when its lockfile is not what those volumes hold
export async function syncDeps(inst: Instance, svc: string, dir: string, r: Reporter, soft: string[]) {
  const d = svcDef(svc);
  const s = d.syncDeps?.find((x) => existsSync(join(dir, x.lockfile)));
  if (!s) return;
  // the volumes are seeded from the image, so an install only counts for the image it was made in
  const img = inst.images?.[`${srcSvc(svc)}@shared`] ?? inst.images?.[svc] ?? inst.image ?? "";
  const want = lockHash(dir, s.lockfile);
  const done = inst.deps?.[svc]?.split("@");
  const have = done && done[0] === img ? done[1] : lockHash(vendorSvcDir(repoOf(svc)), s.lockfile);
  if (!want || want === have) return;
  r.log(`${svc}: ${s.lockfile} differs from what ${inst.name}'s volumes hold; installing`);
  for (const v of Object.keys(s.caches)) if (!(await volumeExists(v))) await run(["docker", "volume", "create", "--label", `cosmos.shared=${slug(v)}`, v], { check: true, quiet: true });
  const argv = [
    ...(s.entrypoint !== undefined ? ["--entrypoint", s.entrypoint] : []),
    ...Object.entries(s.caches).flatMap(([v, t]) => ["-v", `${v}:${t}`]),
    ...Object.entries(s.env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
    svc, ...s.run,
  ];
  const res = await compose(inst.name, ["run", "--rm", "--no-deps", "-T", ...argv], { onOutput: r.output });
  if (res.code === 0) inst.deps = { ...inst.deps, [svc]: `${img}@${want}` };
  else soft.push(`${svc}: dependency install for this checkout's ${s.lockfile} failed (exit ${res.code}); it runs on the image's deps: ${(res.stderr || res.stdout).trim().split("\n").at(-1)}`);
}

export function skipServices(inst: Instance, fresh: boolean, log: (m: string) => void): string[] {
  if (fresh) return [];
  return inst.services.filter((svc) => {
    const f = findSvc(svc)?.skipIfExists;
    if (!f || !existsSync(join(instanceDir(inst.name), f))) return false;
    log(`existing instance: ${svc} skipped (${f} exists)`);
    return true;
  });
}

// an init service that exited non-zero fails the start, unless its logs match softFail (a warning instead)
async function initResult(inst: Instance, svc: string, soft: string[]) {
  const cn = containerName(inst.name, svc);
  const code = (await run(["docker", "inspect", "-f", "{{.State.ExitCode}}", cn], { quiet: true })).stdout.trim();
  if (code === "0" || code === "") return;
  const logs = await run(["docker", "logs", "--tail", "80", cn], { quiet: true });
  const text = logs.stdout + logs.stderr;
  const last = text.trim().split("\n").filter(Boolean).slice(-2).join(" | ");
  const sf = findSvc(svc)?.softFail;
  if (!sf || !sf.match.test(text)) throw new CosmosError(`${svc} exited ${code}: ${last}; see: cosmos logs ${inst.name} ${svc}`);
  soft.push(tmpl(sf.warning, { instance: inst.name, extra: { code, last } }));
}

export async function waitInit(inst: Instance, svc: string, c: { status: string } | null, soft: string[]): Promise<boolean> {
  if (!c) return true;
  if (c.status !== "exited") return false;
  await initResult(inst, svc, soft);
  return true;
}

async function reviveWorkers(inst: Instance, after: string, r: Reporter, soft: string[], deadline: number) {
  for (const d of manifest().services.filter((x) => x.restartDeadWorkersAfter === after && inst.services.includes(x.svc))) {
    const dead = ((await workers(inst))[d.svc] ?? []).filter((w) => !w.alive).map((w) => w.name);
    if (!dead.length) continue;
    r.log(`${d.svc} ${dead.join(", ")} not running after ${after}; restarting the container once`);
    await run(["docker", "restart", containerName(inst.name, d.svc)], { check: true, quiet: true });
    if (d.health) await waitHttp(`http://127.0.0.1:${inst.ports[d.svc]}${d.health}`, deadline - Date.now(), (st) => st < 500);
    await Bun.sleep(5000);
    const still = ((await workers(inst))[d.svc] ?? []).filter((w) => !w.alive).map((w) => w.name);
    if (still.length) soft.push(`${d.svc} ${still.join(", ")} still dead after a restart; see: cosmos logs ${inst.name} ${d.svc}`);
  }
}

export async function afterStage(inst: Instance, services: string[], r: Reporter, soft: string[], deadline: number) {
  for (const s of services) if (svcDef(s).kind === "init") await reviveWorkers(inst, s, r, soft, deadline);
}

export async function beforeDown(inst: Instance, o: { remove: boolean }, r: Reporter) {
  const h = manifest().hooks.beforeDown;
  if (!h) return;
  const env = { ...process.env, COSMOS_INSTANCE: inst.name, COSMOS_INSTANCE_DIR: instanceDir(inst.name), COSMOS_BACKEND: inst.backend, COSMOS_BACKEND_KIND: kindOf(inst), COSMOS_REMOVE: o.remove ? "1" : "0" } as Record<string, string>;
  await run(["sh", "-c", h], { check: true, env, onOutput: r.output });
}

export function hasSeed() {
  return !!manifest().seed;
}

export async function seed(inst: Instance, r: Reporter): Promise<SeedResult> {
  const s = manifest().seed!;
  const name = inst.name;
  if (!inst.services.includes(s.service)) throw new CosmosError(`${name} has no ${s.service} (profile ${inst.profile})`);
  for (const svc of s.requires.filter((x) => inst.services.includes(x))) {
    if (!(await containerState(containerName(name, svc)))?.running) throw new CosmosError(`${name}: ${svc} is not running; cosmos up ${name} first`);
  }
  r.log(`running ${s.service} in ${name}`);
  const res = await run(["docker", "start", "-a", containerName(name, s.service)], { quiet: !r.inherit, inherit: r.inherit, onOutput: r.output });
  const soft: string[] = [];
  await initResult(inst, s.service, soft);
  await reviveWorkers(inst, s.service, r, soft, Date.now() + 300_000);
  const counts: Record<string, number | null> = {};
  if (s.counts) {
    const c = await run(["docker", "exec", "-i", containerName(name, s.counts.service), ...s.counts.command], { quiet: true, stdin: s.counts.stdin });
    for (const line of c.stdout.split("\n").filter(Boolean)) {
      const [k, v] = line.split("=");
      counts[k] = v === "" || v === undefined ? null : Number(v);
    }
  }
  // the warnings a previous seed left that this one may clear
  const sf = findSvc(s.service)?.softFail;
  const prefixes = [...(sf ? [reEsc(sf.warning.split("{{")[0])] : []), ...manifest().services.filter((d) => d.restartDeadWorkersAfter === s.service).map((d) => `${reEsc(d.svc)} .* still dead`)];
  return { ok: res.code === 0, warnings: soft, counts, clear: prefixes.length ? new RegExp(`^(${prefixes.join("|")})`) : undefined };
}

// ---------- envs and catalog ----------

export function envFilter(bundle: string, rel: string): boolean {
  const inc = manifest().envInclude[bundle];
  return !inc || inc.some((g) => new Bun.Glob(g).match(rel));
}

type ReqResult = { ok: boolean; file: string | null; reason: string | null };

function checkReqs(b: Backend, vars: Record<string, string>, envRoot?: Record<string, string>): ReqResult[] {
  return manifest().requires[b.kind].map((q) => {
    const c: TCtx = { vars };
    try {
      let file = tmpl(q.file, c);
      if (envRoot) for (const [bundle, dir] of Object.entries(envRoot)) if (file.startsWith(envDir(bundle) + "/")) file = join(dir, file.slice(envDir(bundle).length + 1));
      const ok = existsSync(file);
      let fix: string | null = null;
      try {
        fix = q.fix ? tmpl(q.fix, c) : null;
      } catch {}
      return { ok, file, reason: ok ? null : `missing ${file}${fix ? `; ${fix}` : ""}` };
    } catch (e) {
      return { ok: false, file: null, reason: e instanceof TemplateMissing ? `${b.id}: ${e.message} (backend vars or cosmos.yaml vars)` : (e as Error).message };
    }
  });
}

export function backendStatus(b: Backend): BackendStatus {
  const vars = backendVars(b);
  const fields: Record<string, unknown> = Object.fromEntries(Object.keys(manifest().vars).map((k) => [k, vars[k] ?? null]));
  const res = checkReqs(b, vars);
  const bad = res.find((x) => !x.ok);
  const envFile = b.kind === "remote" ? res[0]?.file ?? null : undefined;
  if (bad) return { available: false, reason: bad.reason, envFile, host: null, fields };
  let host: string | null = null;
  const bh = manifest().backendHost;
  if (bh && b.kind === "remote") {
    try {
      const f = tmpl(bh.file, { vars });
      const v = existsSync(f) ? parseDotenv(readFileSync(f, "utf8"))[bh.key] : undefined;
      host = v ? new URL(v).hostname : null;
    } catch {}
  }
  return { available: true, reason: null, envFile, host, fields };
}

// why a profile cannot run on an available backend: a remote FE whose env needs a var the backend lacks
export function profileBlocker(p: Profile, b: Backend): string | null {
  if (b.kind !== "remote") return null;
  const vars = backendVars(b);
  for (const svc of p.services) {
    const d = findSvc(svc);
    for (const [, v] of envEntries(d?.env, { services: p.services, local: false, poll: false })) {
      for (const ref of refsOf(v)) if (ref.startsWith("vars.") && !vars[ref.slice(5)]) return `${svc} needs ${ref.slice(5)}, which ${b.id} has no value for`;
    }
  }
  return null;
}

export function doctorChecks(sources: Record<string, string> | null): Check[] {
  const m = manifest();
  const out: Check[] = [];
  for (const kind of ["remote", "local"] as const) {
    if (!m.requires[kind].length) continue;
    const bs = m.backends.filter((b) => b.kind === kind);
    const missing: { b: Backend; reason: string }[] = [];
    let fromSrc = false;
    for (const b of bs) {
      const vars = backendVars(b);
      const bad = checkReqs(b, vars).find((x) => !x.ok);
      if (!bad) continue;
      const inSrc = sources && !checkReqs(b, vars, sources).some((x) => !x.ok);
      if (inSrc) fromSrc = true;
      else missing.push({ b, reason: bad.reason ?? "" });
    }
    const name = `${kind} env files`;
    if (missing.length) out.push({ name, ok: false, detail: `${missing.map((x) => x.b.id).join(", ")} not runnable`, fix: missing[0].reason });
    else out.push({ name, ok: true, detail: `${bs.length} backend(s)${fromSrc ? "; some copied from the env sources on first run" : ""}` });
  }
  return out;
}

// ---------- share ----------

const instCtx = (i: Instance, fe: string, extra: Record<string, string> = {}): TCtx => {
  const d = svcDef(fe);
  const b = manifest().backends.find((x) => x.id === i.backend || x.aliases.includes(i.backend));
  return { ports: i.ports, vars: b ? backendVars(b, i.src) : {}, instance: i.name, dir: instanceDir(i.name), layout: layoutVars(d, i.src[srcSvc(fe)] ?? vendorSvcDir(repoOf(fe))), extra };
};

export function previewRecipe(i: Instance, fe: string): PreviewRecipe | null {
  const p = findSvc(fe)?.preview;
  if (!p) return null;
  const c = instCtx(i, fe);
  return {
    out: posix.normalize(tmpl(p.out, c)), viteTemp: posix.normalize(tmpl(p.viteTemp, c)), mkOut: p.mkOut, needMiB: p.needMiB, dropEnv: p.dropEnv,
    cmd: (mode) => tmpl(p.command, instCtx(i, fe, { mode })).split(/\s+/).filter(Boolean).map((a) => (a.startsWith("/") ? posix.normalize(a) : a)),
  };
}

export const previewMode = (i: Instance, fe: string) => findSvc(fe)?.preview?.mode[kindOf(i)] ?? "production";

export function shareReach(i: Instance, reach: Record<string, number>): Record<string, number> {
  const out = { ...reach };
  for (const s of manifest().share.reach[kindOf(i)] ?? []) if (i.ports[s]) out[s] = i.ports[s];
  return out;
}

export const shareBlock = (i: Instance) => (manifest().share.block[kindOf(i)] ?? []).filter((b) => i.ports[b.service]).map((b) => ({ port: i.ports[b.service], prefixes: b.prefixes }));

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function shareNotice(i: Instance, fe: string, origin: string): { text: string; html: string } | null {
  const t = findSvc(fe)?.share?.notice?.[kindOf(i)];
  if (!t) return null;
  let text: string;
  try {
    text = tmpl(t, instCtx(i, fe, { origin }));
  } catch (e) {
    text = t.replace(/\{\{\s*origin\s*\}\}/g, origin).replace(/\{\{[^}]*\}\}/g, "(unknown)");
  }
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>cosmos share</title>
<body style="font:15px/1.6 system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#0b0d12;color:#d7dbe4"><main style="max-width:560px;padding:24px">
<h1 style="font-size:18px">Before you continue</h1><p>${esc(text)}</p>
<p><a style="color:#7cc4ff" href="/__cosmos/notice/continue">Continue to the app anyway</a></p></main></body>`;
  return { text, html };
}

export function shareAbout(i: Instance, fe: string): string {
  const t = findSvc(fe)?.share?.about?.[kindOf(i)];
  if (!t) return "";
  try {
    return ` ${tmpl(t, instCtx(i, fe))}`;
  } catch {
    return "";
  }
}

// ---------- dashboard ----------

export async function dashboardMeta(): Promise<DashboardMeta> {
  const { pins: pinSvcs, ...meta } = manifest().dashboard;
  const pins = await Promise.all((pinSvcs ?? []).map(async (svc) => {
    const pin = await pinnedSha(svc).catch(() => "");
    const dir = vendorSvcDir(repoOf(svc));
    const head = existsSync(join(dir, ".git")) ? await gitHead(dir).catch(() => "") : "";
    return { label: svc, value: pin.slice(0, 8), detail: head && head !== "nogit" ? `vendored at ${head.slice(0, 8)}` : undefined };
  }));
  return { ...meta, pins };
}
