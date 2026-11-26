import { parseArgs } from "util";
import { BASE_PORT } from "./offsets";
import * as ops from "./ops";
import { CosmosError } from "./errors";
import { dashboardMain } from "./dashboard/control";
import { BACKENDS, LEGACY_PROFILES, loginConfig, manifest } from "./catalog";
import { doctor, doctorDone, printDoctor, rememberDoctor } from "./doctor";
import { loadAdapter } from "./adapter";
import { HOME, hasProject } from "./paths";
import { migrateLegacy } from "./migrate";

let JSON_OUT = false;
const log = (m: string) => console.error(`[cosmos] ${m}`);
const reporter = (): ops.Reporter => ({ log, inherit: !JSON_OUT });

function emit(obj: unknown, human: () => void) {
  if (JSON_OUT) console.log(JSON.stringify(obj, null, 2));
  else human();
}

// --branch svc=ref, once per service
function branchSet(xs: string[] = []): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const x of xs) {
    const i = x.indexOf("=");
    if (i < 1) throw new CosmosError(`--branch takes <service>=<branch|tag|sha>, got "${x}"`);
    const svc = x.slice(0, i);
    if (Object.hasOwn(out, svc)) throw new CosmosError(`--branch ${svc} is given twice (${out[svc]} and ${x.slice(i + 1)}); pick one`);
    out[svc] = x.slice(i + 1);
  }
  return xs.length ? out : undefined;
}

async function cmdDoctor() {
  const d = await doctor();
  if (d.ok) rememberDoctor();
  emit(d, () => printDoctor(d));
  if (!d.ok) process.exitCode = 1;
}

async function cmdUp(v: Record<string, any>) {
  if (!v["skip-doctor"] && !doctorDone()) {
    log("first run on this machine: running cosmos doctor");
    const d = await doctor();
    if (!d.ok) {
      printDoctor(d, console.error);
      throw new CosmosError("cosmos doctor found problems; fix them and run again (or --skip-doctor)");
    }
    rememberDoctor();
  }
  const branches = branchSet(v.branch);
  if (v.live && !branches) throw new CosmosError("--live goes with --branch: it mounts your clone for the branches it holds");
  const out = await ops.up(
    {
      branches, live: v.live ? Object.keys(branches!) : undefined,
      sourceImages: v["source-images"] ? true : undefined,
      backend: v.backend, profile: v.profile, name: v.name, build: !!v.build, poll: v.poll ? true : v["no-poll"] ? false : undefined, mode: v.direct ? "direct" : undefined,
      goMode: v["no-air"] ? "image" : undefined, keepOnFailure: !!v["keep-on-failure"], share: !!v.share, timeoutS: v.timeout ? Number(v.timeout) : undefined,
    },
    reporter(),
  );
  emit(out, () => {
    console.log(`${out.name}${out.label !== out.name ? ` (${out.label})` : ""} up: ${out.url}  (slot ${out.slot}, backend ${out.backend}, profile ${out.profile}, ${out.mode}, ${Math.round(out.timings.totalMs / 1000)}s)`);
    if (Object.keys(out.urls).length > 1) for (const [svc, u] of Object.entries(out.urls)) console.log(`  ${svc.padEnd(16)} ${u}`);
    for (const e of out.edge) console.log(`  edge :${e.port} -> ${e.upstream}  (${e.keys.join(", ")})`);
    for (const c of out.cors) console.log(`  cors ${c.allowed ? "ok  " : "FAIL"} ${c.origin} -> ${c.target}${c.allowed ? "" : `  (${c.acao ?? c.error ?? `HTTP ${c.status}, no ACAO`})`}`);
    for (const svc of out.live) console.log(`  ${svc.padEnd(16)} live: ${out.src[svc]}`);
    if (out.memory) console.log(`  memory ${out.memory.instanceMiB} MiB; VM available ${out.memory.vmBeforeMiB} -> ${out.memory.vmAfterMiB} MiB`);
    if (out.share) printShare(out.share);
    for (const w of out.warnings ?? []) console.log(`  warning: ${w}`);
    printLogin("  ");
  });
}

function printLogin(pad = "") {
  const l = loginConfig();
  if (l) console.log(`${pad}login ${l.email}  password: see cosmos.yaml login.password`);
}

function printShare(s: ops.ShareView, pad = "  ") {
  console.log(`${pad}shared   ${s.url || "(no URL)"}  ${s.state}${s.reason ? ` (${s.reason})` : ""}  zrok name ${s.zrokName ?? "random"}  ${s.fe} at /`);
  if (s.public || s.user) console.log(`${pad}         ${s.public ? "public: no password" : `user ${s.user}  password ${s.password}`}`);
  if (s.preview) console.log(`${pad}         preview ${s.preview.state}${s.preview.builtAt ? `, built ${s.preview.builtAt}` : ""}${s.preview.lastMs ? ` in ${Math.round(s.preview.lastMs / 1000)}s` : ""}${s.preview.state === "failed" && s.preview.lastError ? `: ${s.preview.lastError}` : ""}`);
  console.log(`${pad}         remote viewer: ${s.remote}`);
  if (s.notice) console.log(`${pad}         ${s.notice}`);
}

async function cmdDown(names: string[], v: Record<string, any>, remove: boolean) {
  const { done, warnings } = await ops.down(names, { all: !!v.all, remove, force: !!v.force }, { log: () => {}, inherit: false });
  emit({ ok: true, [remove ? "removed" : "stopped"]: done, ...(warnings.length ? { warnings } : {}) }, () => {
    console.log(`${remove ? "removed" : "stopped"}: ${done.join(", ") || "nothing"}`);
    for (const w of warnings) console.log(`  warning: ${w}`);
  });
}

async function cmdLs() {
  const rows = await ops.list();
  emit({ instances: rows, login: hasProject() ? loginConfig()?.email ?? null : null }, () => {
    if (!rows.length) return console.log("no instances");
    for (const r of rows) console.log(`${r.name.padEnd(16)} ${(r.label !== r.name ? r.label : "").padEnd(16)} slot ${String(r.slot).padEnd(3)} ${r.backend.padEnd(10)} ${ops.profileOf(r).padEnd(15)} ${ops.modeOf(r).padEnd(6)} ${r.status.padEnd(12)} ${r.url}${r.share ? `  shared ${r.share.url} (${r.shareState})` : ""}`);
    printLogin();
  });
}

async function cmdPorts(names: string[]) {
  const rows = ops.ports(names);
  emit({ instances: rows }, () => {
    for (const r of rows) {
      console.log(`${r.name} (slot ${r.slot}, range ${r.range[0]}-${r.range[1]})`);
      for (const [svc, p] of Object.entries(r.enabled)) console.log(`  ${svc.padEnd(14)} ${p}  http://localhost:${p}`);
    }
  });
}

async function cmdStatus(names: string[]) {
  const rows = await Promise.all((names.length ? names : (await ops.list()).map((r) => r.name)).map((n) => ops.status(n)));
  emit({ instances: rows }, () => {
    for (const r of rows) {
      console.log(`${r.name}${r.label !== r.name ? ` "${r.label}"` : ""} (${r.backend}, ${r.profile}, ${r.mode})`);
      for (const s of r.services) console.log(`  ${s.service.padEnd(16)} ${s.status.padEnd(9)} ${(s.health ?? "").padEnd(9)} ${s.http ? String(s.http.status ?? "down").padEnd(5) : "     "} ${s.url ?? ""}`);
      for (const [svc, ws] of Object.entries(r.workers)) console.log(`  ${svc} workers: ${ws ? ws.map((w) => `${w.name} ${w.alive ? "alive" : "DEAD"}`).join(", ") : "container not running"}`);
      for (const c of r.cors.filter((c) => !c.allowed)) console.log(`  cors FAIL ${c.origin} -> ${c.target}`);
      if (r.share) printShare(r.share);
      else console.log(`  not shared (cosmos share ${r.name})`);
    }
  });
}

async function cmdCatalog() {
  const c = await ops.catalog({ sync: true });
  emit(c, () => {
    console.log("backends:");
    for (const b of c.backends) console.log(`  ${b.id.padEnd(11)} ${b.kind.padEnd(7)} ${b.available ? "available" : `unavailable: ${b.reason}`}${b.note ? `  (${b.note})` : ""}`);
    console.log("profiles:");
    const profileW = Math.max(...c.profiles.map((p) => p.id.length));
    for (const p of c.profiles) console.log(`  ${p.id.padEnd(profileW)} ${p.backendKind.padEnd(7)} ~${p.estMiB} MiB${p.measured ? " (measured)" : ""}  ${p.about}`);
    console.log(`vm: ${"error" in c.vm ? c.vm.error : `${c.vm.availableMiB} MiB available, floor ${c.vm.floorMiB}`}`);
    for (const x of c.combos.filter((x) => x.available)) console.log(`  ok  --backend ${x.backend} --profile ${x.profile}`);
  });
}

async function cmdProfiles() {
  const c = await ops.catalog({ sync: true });
  emit({ config: c.config, profiles: c.profiles }, () => {
    console.log(`profiles from ${c.config.file}:`);
    for (const p of c.profiles) {
      console.log(`  ${p.id}${p.default ? " (default)" : ""}  ${p.backendKind}: ${p.backends.join(", ")}  ~${p.estMiB} MiB${p.measured ? " measured" : ""}`);
      console.log(`    ${p.about}`);
      console.log(`    services: ${p.services.join(" ")}`);
      console.log(`    ${p.canRun ? "can run now" : `cannot run now: ${p.reason}`}`);
    }
    for (const w of c.config.warnings) console.log(`warning: ${w}`);
  });
}

async function cmdBuild(v: Record<string, any>) {
  const m = manifest();
  const out = await ops.buildProfile(v.profile ?? m.defaults.build ?? m.profiles.find((p) => p.backendKind === "local")?.id ?? m.profiles[0]?.id ?? "", { goMode: v["no-air"] ? "image" : "air", force: !!v.build }, reporter());
  emit(out, () => { for (const i of out.images) console.log(`${i.built ? "built " : "exists"} ${i.tag}${i.ms ? `  ${Math.round(i.ms / 1000)}s` : ""}`); });
}

async function cmdSeed(names: string[]) {
  if (!names.length) throw new CosmosError("name required");
  const rows: Awaited<ReturnType<typeof ops.seed>>[] = [];
  for (const n of names) rows.push(await ops.seed(n, reporter()));
  emit({ seeded: rows }, () => {
    for (const r of rows) {
      console.log(`${r.name}: seed ${r.ok ? "ok" : "exited non-zero"} in ${Math.round(r.ms / 1000)}s`);
      console.log(`  rows: ${Object.entries(r.counts).map(([k, v]) => `${k}=${v ?? "no table"}`).join("  ")}`);
      for (const w of r.warnings) console.log(`  warning: ${w}`);
    }
  });
}

async function cmdLogs(args: string[], v: Record<string, any>) {
  const [name, svcArg] = args;
  if (!name) throw new CosmosError("name required");
  const svc = svcArg ?? ops.mainFe(ops.getInstance(name).services);
  const tail = Number(v.tail ?? 200);
  if (JSON_OUT) {
    const r = await ops.logs(name, svc, { tail, follow: !!v.follow });
    console.log(JSON.stringify({ name, service: svc, logs: (r.stdout + r.stderr).split("\n") }, null, 2));
  } else await ops.logs(name, svc, { tail, follow: !!v.follow, inherit: true });
}

async function cmdShare(args: string[], v: Record<string, any>) {
  const [name] = args;
  if (!name) throw new CosmosError("name required: cosmos share <name> [--fe <svc>] [--password | --public] [--expose-admin] [--open]");
  if (v.password && v.public) throw new CosmosError("--password and --public contradict each other; pass one");
  const out = await ops.share(name, { fe: v.fe, public: v.password ? false : v.public ? true : undefined, exposeAdmin: v["expose-admin"] ? true : undefined }, reporter());
  emit(out, () => {
    console.log(`${out.name} ${out.reused ? "is already shared" : "shared"}`);
    printShare(out);
    for (const w of out.warnings) console.log(`  warning: ${w}`);
  });
  if (v.open) await Bun.spawn(["open", out.url]).exited;
}

async function cmdUnshare(args: string[]) {
  if (!args.length) throw new CosmosError("name required: cosmos unshare <name...>");
  const rows: Awaited<ReturnType<typeof ops.unshare>>[] = [];
  for (const n of args) rows.push(await ops.unshare(n, reporter()));
  emit({ unshared: rows }, () => { for (const r of rows) console.log(`${r.name}: ${r.stopped ? `stopped ${r.stopped}` : "was not shared"}`); });
}

const srcLine = (x: { svc: string; branch: string | null; sha: string | null; dirty: number | null; atPin: boolean; ahead: number | null; behind: number | null; dir: string; own: boolean; live: boolean; shared: string[] }) =>
  `  ${x.svc.padEnd(16)} ${(x.branch ?? "detached").padEnd(28)} ${(x.sha ?? "").slice(0, 8)}${x.atPin ? " pin" : "    "}${x.dirty ? `  ${x.dirty} changed` : ""}${x.ahead ? `  ahead ${x.ahead}` : ""}${x.behind ? `  behind ${x.behind}` : ""}  ${x.own ? x.dir : x.live ? `live: ${x.dir}${x.shared.length ? ` (also ${x.shared.join(", ")})` : ""}` : `${x.dir} (shared, moves to its own worktree on next start)`}`;

// cosmos src <name>: what each service runs; <name> <svc>: its branches; <name> <svc> <ref>: switch
async function cmdSrc(args: string[], v: Record<string, any>) {
  const [name, svc, ref] = args;
  if (!name) throw new CosmosError("name required: cosmos src <name> [svc [branch|tag|sha | --pinned]]");
  if (!svc) {
    const out = await ops.sources(name);
    return emit(out, () => { for (const x of out.sources) console.log(srcLine(x)); });
  }
  if (ref && v.pinned) throw new CosmosError("give a ref or --pinned, not both");
  if (!ref && !v.pinned) {
    const out = await ops.sourceRefs(svc, { fetch: true });
    return emit(out, () => {
      if (out.warning) log(`warning: ${out.warning}`);
      for (const x of out.refs.slice(0, Number(v.tail ?? 30))) console.log(`  ${x.name.padEnd(40)} ${x.sha.slice(0, 8)} ${x.date.slice(0, 10)} ${x.local ? "local" : "     "}${x.remote ? " origin" : "       "}${x.heldBy ? `  in ${x.heldBy}${x.clone ? " (a copy unless --live)" : x.live ? " (live)" : ""}` : ""}`);
      console.log(`  --pinned ${out.pinned.slice(0, 8)} (the project's commit)`);
    });
  }
  const out = await ops.switchSource(name, svc, v.pinned ? null : ref, reporter(), v.timeout ? Number(v.timeout) : undefined, { force: !!v.force, live: !!v.live });
  emit(out, () => {
    console.log(`${out.name} ${out.svc}: ${out.branch ?? "detached"} @ ${out.sha.slice(0, 8)}  ${out.live ? `live: ${out.dir}` : out.dir}`);
    console.log(out.applied === "now" ? `  recreated ${out.recreated.join(", ")}` : "  not running; applies on next start");
    for (const w of out.warnings) console.log(`  warning: ${w}`);
  });
}

function help(): string {
  let backends = "the backends in the project's cosmos.yaml";
  try {
    if (hasProject()) backends = BACKENDS().map((b) => [b.id, ...b.aliases].join("|")).join(" ");
  } catch {}
  return `cosmos: isolated instances of a project's stack on one machine
Install per project (bun add -d @rajvarsani/cosmos) and run as bunx cosmos <command>.

  cosmos up --backend <b> [--profile P] [--name N|"Free Text"] [--branch svc=ref ... [--live]] [--direct] [--no-air] [--keep-on-failure] [--build] [--source-images] [--poll | --no-poll] [--timeout S] [--skip-doctor] [--share]
      backends: ${backends}
      profiles: defined in cosmos.yaml (cosmos profiles); --backend defaults to local for local profiles
      file watchers get host events by default; --poll makes them poll (the default on a runtime whose mounts raise no events, like Colima without mountInotify), --no-poll forces events
      name an instance after what you are working on: cosmos up --name "Letter Platform" (id becomes letter-platform; no --name picks a star)
      remote FEs call a per-instance Caddy edge (cosmos-<name>-edge, one localhost port per backend host) that
      forwards unchanged and answers CORS for the instance; --direct points the env at the real hosts instead
      each source-mounted service runs from its own git worktree, instances/<name>/src/<svc>, made from the project's
      submodule at its pinned commit; --branch <svc>=feat/a (once per service) starts that service on a ref by the
      cosmos src rule; --live lets those branches mount the project clone
  cosmos src <name> [svc [ref | --pinned]] [--live] [--force]   what each service runs; svc alone lists its branches; ref switches it
      (branch, tag or sha; --pinned for the project's commit) and recreates only that service's containers. A branch checked out
      in a linked worktree outside cosmos (an agent's) is mounted live from there; cosmos never changes its git state, and
      rm only unmounts it. A branch held by the project clone runs as a copy, detached at its commit, unless --live mounts the
      clone. A branch another instance holds, or whose worktree dir is gone, runs detached. A local branch that is only behind
      origin is fast-forwarded when the instance's worktree is clean. Refuses to orphan commits on no branch or overwrite
      ignored files (.env.local) without --force
  cosmos share <name> [--fe svc] [--password | --public] [--expose-admin] [--open]   opt-in public link (zrok) for one FE of the instance; up --share does it at create.
      Remote viewers get a preview build (vite build, rebuilt about a minute after each save), not the dev server. API ports sit
      under /__cosmos/<port> on the same origin. Shares have no password by default; --password puts it behind a
      generated password (user cosmos; browsers prompt once, then a cookie), --public takes it off again. A share keeps its
      setting across down, start and re-share; passing either flag on a live share flips it in place, same link.
      The link is <instance>-<user>.shares.zrok.io, minted on first share and kept across unshare, down and start; rm releases it.
      Use --password when sharing outside the team. Paths the project blocks on shares stay blocked unless --expose-admin. Not for --direct
  cosmos unshare <name...>           turn sharing off: stops its zrok, proxy and preview builder (down pauses a share, start resumes it)
  cosmos seed <name...>              re-run the project's seed on a running local instance
  cosmos doctor                      check this machine: bun, the container runtime and its engine, the project and its submodules, project checks, git access, ports (runs before the first up)
  cosmos profiles                    profiles from cosmos.yaml, their services, and whether each can run now
  cosmos catalog                     every backend x profile, with availability and why
  cosmos build [--profile P] [--no-air] [--build]   build a profile's images one at a time
  cosmos status [name...]            per-service state, health, workers, CORS
  cosmos down <name...> | --all      stop and remove containers (keeps slot and volumes)
  cosmos rm <name...> | --all [--force]   down, drop volumes and worktrees, free the slot (refuses unsaved worktree work, including untracked and ignored files, without --force; never a locked worktree)
  cosmos ls
  cosmos ports [name...]
  cosmos logs <name> [svc] [--tail N] [-f]
  cosmos dashboard [--port N] [--detach | --stop | --status]   web console on http://127.0.0.1:<port> (default ${BASE_PORT}, or COSMOS_DASHBOARD_PORT)
  cosmos top                         full-screen terminal dashboard of this project's instances; works without the web dashboard
      j/k or arrows move, enter details (services, ports, URLs, share), l logs (tab cycles services), o open the main URL,
      s share on/off, d down (asks y/n), / filter by name, g galaxy view, ? help, q/esc back out of a pane, q in the list quits, ctrl-c quits

The project is the nearest dir upward with a cosmos.yaml, or --project <dir> (COSMOS_PROJECT).
Project state (instances, env copies, vendored worktrees) lives in ${HOME}/projects/<projectId>; slot and name claims of every project live in ${HOME}/registry.json. COSMOS_HOME moves both. A 0.1 layout is migrated on first run.
The container runtime (docker-desktop, colima, orbstack) is COSMOS_RUNTIME, else runtime: in ${HOME}/cosmos.local.yaml, else whatever the docker context points at; colima:<profile> picks a colima profile. cosmos never switches the docker context.
All commands take --json. Host port = ${BASE_PORT} + 100*slot + offset (offsets in cosmos.yaml); slot 0 is never assigned.`;
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      json: { type: "boolean" },
      backend: { type: "string" },
      profile: { type: "string" },
      direct: { type: "boolean" },
      "no-air": { type: "boolean" },
      "keep-on-failure": { type: "boolean" },
      name: { type: "string" },
      branch: { type: "string", multiple: true },
      live: { type: "boolean" },
      force: { type: "boolean" },
      pinned: { type: "boolean" },
      build: { type: "boolean" },
      "source-images": { type: "boolean" },
      "skip-doctor": { type: "boolean" },
      "no-poll": { type: "boolean" },
      poll: { type: "boolean" },
      timeout: { type: "string" },
      all: { type: "boolean" },
      tail: { type: "string" },
      follow: { type: "boolean", short: "f" },
      detach: { type: "boolean", short: "d" },
      stop: { type: "boolean" },
      status: { type: "boolean" },
      public: { type: "boolean" },
      password: { type: "boolean" },
      open: { type: "boolean" },
      fe: { type: "string" },
      share: { type: "boolean" },
      "expose-admin": { type: "boolean" },
      project: { type: "string" },
      port: { type: "string" },
      demo: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  JSON_OUT = !!values.json;
  if (values.project) process.env.COSMOS_PROJECT = values.project;
  const [cmd0] = positionals;
  const needsNoProject = !cmd0 || values.help || (cmd0 === "dashboard" && (values.status || values.stop)) || (cmd0 === "top" && values.demo);
  if (!needsNoProject || hasProject()) await loadAdapter().catch((e) => {
    if (!needsNoProject) throw e;
  });
  if (!needsNoProject) await migrateLegacy(log);
  const legacy = values.profile && hasProject() && LEGACY_PROFILES()[values.profile];
  if (legacy) {
    log(`note: profile "${values.profile}" is now "${legacy}"; the old name will stop working`);
    values.profile = legacy;
  }
  const [cmd, ...rest] = positionals;
  switch (cmd) {
    case "doctor": return cmdDoctor();
    case "up": return cmdUp(values);
    case "down": return cmdDown(rest, values, false);
    case "rm": return cmdDown(rest, values, true);
    case "ls": return cmdLs();
    case "ports": return cmdPorts(rest);
    case "logs": return cmdLogs(rest, values);
    case "seed": return cmdSeed(rest);
    case "src": return cmdSrc(rest, values);
    case "status": return cmdStatus(rest);
    case "share": return cmdShare(rest, values);
    case "unshare": return cmdUnshare(rest);
    case "catalog": return cmdCatalog();
    case "profiles": return cmdProfiles();
    case "build": return cmdBuild(values);
    case "dashboard": return dashboardMain(values, emit);
    case "top": return (await import("./tui")).topMain({ demo: !!values.demo });
    default:
      console.log(help());
      if (cmd && !values.help) process.exitCode = 2;
  }
}

main().catch((e) => {
  const detail = e instanceof CosmosError ? e.detail : {};
  if (JSON_OUT) console.log(JSON.stringify({ ok: false, error: e.message, ...detail }, null, 2));
  else log(`error: ${e.message}`);
  process.exitCode = 1;
});
