// Compose override generation for every profile: remote FEs (edge or direct) and full local stacks.
// Core derives each service generically; the adapter's composeService adjusts what is app-specific.
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join, relative, resolve } from "path";
import type { BrowserEnv, BuildSpec, ComposeSvc, GenContext, ServiceDraft, StackPlan } from "./api";
import { composeFile, extraDir, findSvc, loadProfiles, manifest, srcSvc, SERVICES, svcDef, vendorDir } from "./catalog";
import { hostPort } from "./offsets";
import { parseDotenv, envDir } from "./envfile";
import { EDGE_IMAGE, caddyfile, rewriteToEdge, type EdgeRoute } from "./edge";
import { containerName, instanceDir, overridePath, projectName, slug } from "./generate";
import { PKG_ROOT } from "./paths";
import { A, ctx } from "./adapter";

export type { BuildSpec, StackPlan };

export function composeDoc(): { services: Record<string, ComposeSvc>; volumes?: Record<string, unknown>; networks?: Record<string, unknown> } {
  return Bun.YAML.parse(readFileSync(composeFile(), "utf8")) as any;
}

// ---------- ports ----------

// Host ports for a set of services on a slot, keyed by service (plus any extra port keys).
export function slotPorts(slot: number, services: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of services) {
    const d = svcDef(s);
    if (d.offset !== undefined) out[s] = hostPort(slot, d.offset);
    for (const x of d.extraPorts ?? []) out[x.key] = hostPort(slot, x.offset);
  }
  return out;
}

// Rewrites localhost:<project host port> (manifest hostPort) to localhost:<slot port>; unknown ports are left alone.
export function rewriteLocalPorts(v: string, ports: Record<string, number>): string {
  const byPort = new Map(SERVICES().filter((d) => d.hostPort).map((d) => [d.hostPort!, d.svc]));
  return v.replace(/\b(localhost|127\.0\.0\.1|localstack\.localhost):(\d{2,5})\b/g, (m, host, p) => {
    const key = byPort.get(Number(p));
    return key && ports[key] ? `${host}:${ports[key]}` : m;
  });
}

// Every browser origin an instance serves from (manifest services with origin: true).
export function instanceOrigins(ports: Record<string, number>): string[] {
  const out: string[] = [];
  for (const d of SERVICES()) {
    if (d.origin && ports[d.svc]) out.push(`http://localhost:${ports[d.svc]}`, `http://127.0.0.1:${ports[d.svc]}`);
  }
  return out;
}

// ---------- images ----------

export const GO_AIR_DOCKERFILE = join(PKG_ROOT, "docker", "go-air.Dockerfile");

export async function gitHead(dir: string): Promise<string> {
  const p = Bun.spawn(["git", "-C", dir, "rev-parse", "HEAD"], { stdout: "pipe", stderr: "ignore" });
  const out = (await new Response(p.stdout).text()).trim();
  await p.exited;
  return out || "nogit";
}

export const h12 = (...parts: string[]) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p).update("\0");
  return h.digest("hex").slice(0, 12);
};

// The compose build of a service at the vendored pin; source images use the instance checkout with the project's Dockerfile.
export async function composeBuildSpec(svc: string, source?: string): Promise<BuildSpec | null> {
  const x = findSvc(svc)?.extra;
  if (x) return extraBuildSpec(x);
  const g = composeDoc().services[srcSvc(svc)];
  if (!g?.build) return null;
  const vendorContext = resolve(vendorDir(), g.build.context);
  const context = source ?? vendorContext;
  const vendorDockerfile = resolve(vendorContext, g.build.dockerfile ?? "Dockerfile");
  const dfRelative = relative(vendorContext, vendorDockerfile);
  const dockerfile = source && !dfRelative.startsWith("..") ? join(source, dfRelative) : vendorDockerfile;
  const args = Object.fromEntries(Object.entries(g.build.args ?? {}).map(([k, v]) => [k, String(v)]));
  const tag = `cosmos-${srcSvc(svc)}:${h12(readFileSync(dockerfile, "utf8"), await gitHead(context), JSON.stringify(args), ...(source ? [source] : []))}`;
  return { key: srcSvc(svc), tag, dockerfile, context, args, about: `${manifest().projectId} ${srcSvc(svc)}` };
}

// an extra's own Dockerfile, keyed to the manifest pin its vendored checkout is at
export function extraBuildSpec(id: string): BuildSpec {
  const x = manifest().extras.find((e) => e.id === id);
  if (!x) throw new Error(`no extra ${id} in the manifest`);
  const dir = extraDir(id);
  return { key: id, tag: `cosmos-${id}:${x.sha.slice(0, 12)}`, dockerfile: join(dir, x.dockerfile), context: dir, args: {}, about: `${id} ${x.sha.slice(0, 8)} (its own ${x.dockerfile})` };
}

export function goAirSpec(): BuildSpec {
  const df = readFileSync(GO_AIR_DOCKERFILE, "utf8");
  return { key: "go-air", tag: `cosmos-go-air:${h12(df)}`, dockerfile: GO_AIR_DOCKERFILE, context: join(PKG_ROOT, "docker"), args: {}, about: "Go toolchain + air, shared by every Go service" };
}

export const instanceImage = (name: string, svc: string) => `cosmos-${name}-${srcSvc(svc)}:local`;

// What a service runs and the specs behind it: the adapter's plan, else go-air under air, else the compose build.
export async function buildPlanFor(svc: string, goMode: "air" | "image", sourceImages = false, src: Record<string, string> = {}): Promise<{ specs: BuildSpec[]; instanceTag: boolean } | null> {
  const a = A();
  const p = a.buildPlan ? await a.buildPlan(ctx(), { svc, goMode, sourceImages, src }) : undefined;
  if (p === null) return null;
  if (p) return { specs: p.specs, instanceTag: p.instanceTag !== false };
  const d = svcDef(svc);
  if (d.go && goMode === "air") return { specs: [goAirSpec()], instanceTag: true };
  // FEs keep the pinned image: their deps install at start from the mounted lockfile
  const spec = await composeBuildSpec(svc, sourceImages && d.kind !== "fe" ? src[srcSvc(svc)] : undefined);
  return spec ? { specs: [spec], instanceTag: true } : null;
}

// ---------- go under air ----------

const tomlStr = (s: string) => JSON.stringify(s);

// "./<goMain>" when the commit has <goMain>/main.go, else the root package of an older layout.
const goPkg = (svc: string) => {
  const main = svcDef(svc).goMain;
  return main ? `$([ -f ${main}/main.go ] && echo ./${main} || echo .)` : ".";
};

export function airToml(svc: string, poll: boolean): string {
  const bin = `/tmp/bin/${svc}`;
  const custom = A().airCommands?.(ctx(), svc, bin);
  const build = custom?.build ?? `cd /source && CGO_ENABLED=0 go build -buildvcs=false -o ${bin} ${goPkg(svc)}`;
  const run = custom?.run ?? `cd /source && exec ${bin}`;
  return `# generated by cosmos for ${svc}; air rebuilds on source edits
root = "/source"
tmp_dir = "/tmp/air"

[build]
cmd = ${tomlStr(build)}
bin = ${tomlStr(bin)}
full_bin = ${tomlStr(run)}
include_ext = ["go", "tpl", "tmpl", "html", "sql", "yaml", "yml", "json"]
exclude_dir = [".git", "vendor", "node_modules", "tmp", "bin", "docs", "yjs"]
exclude_regex = ["_test\\\\.go$"]
poll = ${poll}
poll_interval = 1500
delay = 1000
stop_on_error = false
send_interrupt = true
kill_delay = "2s"

[log]
time = true

[misc]
clean_on_exit = false
`;
}

// ---------- the override ----------

const j = (v: unknown) => JSON.stringify(v);

function envFileLine(k: string, v: string): string {
  if (/[\r\n]/.test(v)) throw new Error(`multi-line env value for ${k} is not supported`);
  return `${k}=${v.includes("'") ? j(v) : `'${v}'`}`;
}

export const writeEnvFile = (path: string, header: string, env: Record<string, string>) =>
  writeFileSync(path, `# ${header}; do not edit\n` + Object.entries(env).map(([k, v]) => envFileLine(k, v)).join("\n") + "\n");

export type StackOut = {
  override: string;
  edge: EdgeRoute[];
  // Backend origins each FE's browser code calls (the edge listeners in edge mode), keyed by FE service; for the CORS check.
  directOrigins: Record<string, string[]>;
  volumes: string[];
};

const GO_CACHE_VOLUMES = { "cosmos-go-mod": "/go/pkg/mod", "cosmos-go-build": "/root/.cache/go-build" };
export const SHARED_VOLUMES = Object.keys(GO_CACHE_VOLUMES);

export function browserEnvs(p: Pick<StackPlan, "backend" | "ports" | "services" | "src">): BrowserEnv[] {
  return A().browserEnvs?.(ctx(), p) ?? [];
}

const originsOf = (env: Record<string, string>, keys: string[]) =>
  [...new Set(keys.map((k) => env[k]).filter((v) => v && /^(https?|wss?):\/\//i.test(v)).map((v) => {
    const u = new URL(v.replace(/^ws/i, "http"));
    return `${u.protocol}//${u.host}`;
  }))];

// a service's private env override: instances/<name>/envs/<svc>.local.env (mode 600), local stacks only
function localEnvOverride(dir: string, svc: string): Record<string, string> {
  const localEnv = join(dir, "envs", `${svc}.local.env`);
  if (!existsSync(localEnv)) return {};
  if (statSync(localEnv).mode & 0o077) throw new Error(`${svc} instance environment override must be private (mode 600)`);
  const text = readFileSync(localEnv, "utf8");
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    const assignment = line.match(/^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*)$/);
    const value = assignment?.[1] ?? "";
    const unclosedQuote = (value[0] === "'" || value[0] === '"') && value.lastIndexOf(value[0]) === 0;
    if (line && !line.startsWith("#") && (!assignment || unclosedQuote)) throw new Error(`Invalid ${svc} instance environment override at line ${index + 1}`);
  }
  return parseDotenv(text);
}

export function generateStack(p: StackPlan): StackOut {
  const m = manifest();
  const dir = instanceDir(p.name);
  mkdirSync(dir, { recursive: true });
  const doc = composeDoc();
  const services = doc.services;
  const local = p.backend.kind === "local";
  const lines: string[] = [`# generated by cosmos for instance ${p.name} (${p.backend.id}); layered over ${composeFile()}`, `name: ${j(projectName(p.name))}`, "services:"];
  // top-level volume key -> { name, labels }; every volume an instance touches carries cosmos.instance
  const registry: Record<string, { name: string; labels: Record<string, string> }> = {};
  const used = new Set<string>();
  const directOrigins: Record<string, string[]> = {};
  const origins = instanceOrigins(p.ports);
  const vol = (key: string, labels: Record<string, string> = {}, name = key) => ((registry[key] = { name, labels: { "cosmos.instance": p.name, ...labels } }), key);
  const gen: GenContext = {
    plan: p, dir, local, origins, compose: services, vol,
    toBrowser: (fe, env, keys) => {
      const out = p.mode === "edge" ? rewriteToEdge(env, keys, p.edge ?? []) : env;
      directOrigins[fe] = originsOf(out, keys);
      return out;
    },
    rewriteLocalPorts: (v) => rewriteLocalPorts(v, p.ports),
    imgTag: (svc, image) => (p.images[`${srcSvc(svc)}@shared`] ?? image ?? p.images[svc] ?? "img").split(":").pop()!.slice(0, 12),
  };
  const a = A();
  const projectNamed = Object.keys(doc.volumes ?? {});
  const sd = m.sourcesDir;

  for (const [svc, g] of Object.entries(services)) {
    lines.push(`  ${svc}:`, `    container_name: ${j(containerName(p.name, svc))}`, `    labels: ${j({ "cosmos.instance": p.name, "cosmos.service": svc })}`);
    if (!p.services.includes(svc)) {
      lines.push(`    profiles: ["cosmos-disabled"]`, `    ports: !reset []`, `    env_file: !reset []`);
      continue;
    }
    const d = svcDef(svc);
    // ports: loopback only, slot-derived
    const pub: string[] = [];
    if (d.offset !== undefined && d.containerPort) pub.push(`127.0.0.1:${p.ports[svc]}:${d.containerPort}`);
    for (const x of d.extraPorts ?? []) pub.push(`127.0.0.1:${p.ports[x.key]}:${x.containerPort}`);
    lines.push(`    ports: !override ${j(pub)}`);

    const isGoAir = !!d.go && p.goMode === "air";
    const image = isGoAir ? p.images[svc] : p.images[svc] ?? (g.image ? loadProfiles().images[g.image] ?? g.image : undefined);
    const draft: ServiceDraft = { svc, def: d, compose: g, image, neverPull: !!g.build, env: {}, volumes: [], lines: [] };

    // env files: the compose's env bundle layout, from cosmos's own copy in HOME/envs
    if (g.env_file) {
      const ef = m.composeEnvFiles;
      draft.envFile = g.env_file.map((e) => {
        const path = typeof e === "string" ? e : e.path;
        return { path: ef && path.startsWith(ef.prefix) ? join(envDir(ef.bundle), path.slice(ef.prefix.length)) : join(vendorDir(), path), required: false };
      });
    }
    // environment: the compose values with browser-facing localhost ports moved to this slot
    for (const [k, v] of Object.entries(g.environment ?? {})) {
      const s = v === null || v === undefined ? "" : String(v);
      const r = rewriteLocalPorts(s, p.ports);
      if (r !== s) draft.env[k] = r;
    }
    if (isGoAir) Object.assign(draft.env, { GOFLAGS: "-p=2", GOTOOLCHAIN: "auto", GOCACHE: GO_CACHE_VOLUMES["cosmos-go-build"], GOMODCACHE: GO_CACHE_VOLUMES["cosmos-go-mod"] });

    // volumes: absolute binds, per-instance named volumes for data and for image-seeded dirs
    // image-seeded volumes are keyed to the shared (content-hashed) tag, not the per-instance alias
    const imgTag = gen.imgTag(svc, image);
    for (const raw of g.volumes ?? []) {
      const [x, b, mode] = raw.split(":");
      if (b === undefined) {
        // anonymous volume: seeded from the image, so key it to the image
        draft.volumes.push({ type: "volume", source: vol(`cosmos-${p.name}-${svc}-${slug(x)}-${imgTag}`, { "cosmos.image": image ?? "" }), target: x });
      } else if (x.startsWith(`./${sd}/`)) {
        const owner = x.split("/")[2];
        const base = p.src[owner] ?? join(vendorDir(), sd, owner);
        draft.volumes.push({ type: "bind", source: join(base, x.split("/").slice(3).join("/")), target: b, read_only: mode === "ro" || undefined });
      } else if (x.startsWith("./")) {
        draft.volumes.push({ type: "bind", source: join(vendorDir(), x.slice(2)), target: b, read_only: mode === "ro" || undefined });
      } else {
        draft.volumes.push({ type: "volume", source: vol(x, { "cosmos.data": "1" }, `cosmos-${p.name}-${slug(x)}`), target: b });
      }
    }
    if (isGoAir) {
      mkdirSync(join(dir, "air"), { recursive: true });
      writeFileSync(join(dir, "air", `${svc}.toml`), airToml(svc, p.poll));
      draft.volumes.push({ type: "bind", source: join(dir, "air", `${svc}.toml`), target: "/cosmos/air.toml", read_only: true });
      for (const [v, target] of Object.entries(GO_CACHE_VOLUMES)) draft.volumes.push({ type: "volume", source: v, target });
      Object.assign(draft, { workingDir: "/source", entrypoint: [], command: ["air", "-c", "/cosmos/air.toml"] });
    }

    a.composeService?.(ctx(), draft, gen);
    if (local && d.kind !== "fe") Object.assign(draft.env, localEnvOverride(dir, svc));
    emitService(lines, draft);
    for (const v of draft.volumes as { type?: string; source?: string }[]) if (v?.type === "volume" && v.source && registry[v.source]) used.add(v.source);
  }

  for (const l of a.composeExtra?.(ctx(), gen) ?? []) lines.push(l);
  if (p.edge?.length) generateEdge(p, lines, origins);
  const net = m.network ?? Object.keys(doc.networks ?? {})[0];
  if (net) lines.push("networks:", `  ${net}:`, `    name: ${j(`cosmos-${p.name}-net`)}`);
  lines.push("volumes:");
  // the project's own named volumes always get cosmos names, used or not, so nothing ever lands on the project's.
  for (const k of projectNamed) {
    if (!registry[k]) vol(k, { "cosmos.data": "1" }, `cosmos-${p.name}-${slug(k)}`);
    used.add(k);
  }
  const keep = Object.entries(registry).filter(([k]) => used.has(k));
  for (const [k, v] of keep) lines.push(`  ${k}:`, `    name: ${j(v.name)}`, `    labels: ${j(v.labels)}`);
  if (p.goMode === "air" && p.services.some((s) => svcDef(s).go)) for (const v of SHARED_VOLUMES) lines.push(`  ${v}:`, `    name: ${j(v)}`, `    external: true`);
  lines.push("");
  const override = lines.join("\n");
  writeFileSync(overridePath(p.name), override);
  return { override, edge: p.edge ?? [], directOrigins, volumes: keep.map(([, v]) => v.name) };
}

function emitService(lines: string[], d: ServiceDraft) {
  if (d.image) lines.push(`    image: ${j(d.image)}`);
  if (d.neverPull) lines.push(`    pull_policy: never`, `    build: !reset null`);
  if (d.envFile) lines.push(`    env_file: !override ${j(d.envFile)}`);
  if (d.envOverride) lines.push(`    environment: !override ${j(d.env)}`);
  else if (Object.keys(d.env).length) lines.push(`    environment: ${j(d.env)}`);
  if (d.workingDir) lines.push(`    working_dir: ${j(d.workingDir)}`);
  if (d.entrypoint) lines.push(d.entrypoint.length ? `    entrypoint: !override ${j(d.entrypoint)}` : `    entrypoint: !reset []`);
  if (d.command) lines.push(`    command: !override ${j(d.command)}`);
  if (d.resetDependsOn) lines.push(`    depends_on: !reset {}`);
  lines.push(`    volumes: !override ${j(d.volumes)}`);
  lines.push(...d.lines);
}

// cosmos-<name>-edge: Caddy with one loopback listener per upstream host (the container listens on the host port number).
function generateEdge(p: StackPlan, lines: string[], origins: string[]) {
  const dir = join(instanceDir(p.name), "edge");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "Caddyfile"), caddyfile(p.edge!, origins));
  const net = manifest().network ?? Object.keys(composeDoc().networks ?? {})[0];
  lines.push(
    `  edge:`,
    `    container_name: ${j(containerName(p.name, "edge"))}`,
    `    labels: ${j({ "cosmos.instance": p.name, "cosmos.service": "edge" })}`,
    `    image: ${j(EDGE_IMAGE)}`,
    `    restart: unless-stopped`,
    `    command: ${j(["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"])}`,
    `    ports: ${j(p.edge!.map((r) => `127.0.0.1:${r.port}:${r.port}`))}`,
    `    volumes: ${j([{ type: "bind", source: join(dir, "Caddyfile"), target: "/etc/caddy/Caddyfile", read_only: true }])}`,
    ...(net ? [`    networks: [${net}]`] : []),
  );
}
