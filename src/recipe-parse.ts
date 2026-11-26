// Parses the run recipe in cosmos.yaml: per-service env, volumes, layouts, images, browser env, previews and init
// behaviour, plus the project-level vars, requirements, secrets, seed, share, hooks and dashboard looks.
import type { DashboardSpec, DerivedVar, EnvValue, Manifest, Preview, Requirement, Secret, SeedSpec, ShareSpec, SvcDef, SyncDeps } from "./catalog";

type V = {
  str: (k: string, v: unknown, line: number) => string;
  strList: (k: string, v: unknown, line: number) => string[];
  map: (k: string, v: unknown, line: number) => Record<string, any>;
  fail: (line: number, msg: string) => never;
};

const only = (v: V, what: string, r: Record<string, unknown>, keys: string[], line: number) => {
  for (const k of Object.keys(r)) if (!keys.includes(k)) v.fail(line, `${what}: unknown key "${k}" (allowed: ${keys.join(", ")})`);
};

const strMap = (v: V, what: string, raw: unknown, line: number): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v.map(what, raw, line))) out[k] = x === null || x === undefined ? "" : String(x);
  return out;
};

const ifList = (v: V, what: string, raw: unknown, line: number): string[] => (typeof raw === "string" ? [raw] : v.strList(`${what}.if`, raw, line));

export function parseEnv(v: V, what: string, raw: unknown, line: number): Record<string, EnvValue> {
  const out: Record<string, EnvValue> = {};
  for (const [k, x] of Object.entries(v.map(what, raw, line))) {
    if (x && typeof x === "object" && !Array.isArray(x)) {
      only(v, `${what}.${k}`, x, ["value", "if", "else"], line);
      out[k] = { value: x.value === null || x.value === undefined ? "" : String(x.value), ...(x.if !== undefined ? { if: ifList(v, `${what}.${k}`, x.if, line) } : {}), ...(x.else !== undefined ? { else: String(x.else) } : {}) };
    } else out[k] = x === null || x === undefined ? "" : String(x);
  }
  return out;
}

const kindText = (v: V, what: string, raw: unknown, line: number) => {
  const r = v.map(what, raw, line);
  only(v, what, r, ["local", "remote"], line);
  return { ...(r.local !== undefined ? { local: v.str(`${what}.local`, r.local, line) } : {}), ...(r.remote !== undefined ? { remote: v.str(`${what}.remote`, r.remote, line) } : {}) };
};

export function parseRecipe(d: SvcDef, r: Record<string, any>, sub: (k: string) => number, v: V) {
  const svc = d.svc;
  if (r.env !== undefined) d.env = parseEnv(v, `service ${svc}: env`, r.env, sub("env"));
  if (r.volumes !== undefined) d.volumes = v.strList(`${svc}.volumes`, r.volumes, sub("volumes"));
  if (r.command !== undefined) d.command = v.strList(`${svc}.command`, r.command, sub("command"));
  if (r.layouts !== undefined) {
    if (!Array.isArray(r.layouts)) v.fail(sub("layouts"), `service ${svc}: layouts must be a list of {when, vars}`);
    d.layouts = r.layouts.map((x: any) => {
      only(v, `service ${svc}: layouts`, v.map(`${svc}.layouts`, x, sub("layouts")), ["when", "vars"], sub("layouts"));
      return { ...(x.when !== undefined ? { when: v.str(`${svc}.layouts.when`, x.when, sub("layouts")) } : {}), vars: strMap(v, `${svc}.layouts.vars`, x.vars ?? {}, sub("layouts")) };
    });
  }
  if (r.image !== undefined) {
    const x = v.map(`${svc}.image`, r.image, sub("image"));
    only(v, `service ${svc}: image`, x, ["hashFiles", "shared"], sub("image"));
    d.image = { hashFiles: v.strList(`${svc}.image.hashFiles`, x.hashFiles, sub("image")), shared: !!x.shared };
  }
  if (r.browser !== undefined) {
    if (d.kind !== "fe") v.fail(sub("browser"), `service ${svc}: browser is for kind fe`);
    const x = v.map(`${svc}.browser`, r.browser, sub("browser"));
    only(v, `service ${svc}: browser`, x, ["keys", "keysIn", "files"], sub("browser"));
    const f = x.files === undefined ? {} : v.map(`${svc}.browser.files`, x.files, sub("browser"));
    only(v, `service ${svc}: browser.files`, f, ["local", "remote"], sub("browser"));
    d.browser = {
      keys: v.strList(`${svc}.browser.keys`, x.keys ?? [], sub("browser")),
      ...(x.keysIn !== undefined ? { keysIn: v.str(`${svc}.browser.keysIn`, x.keysIn, sub("browser")) } : {}),
      files: { local: v.strList(`${svc}.browser.files.local`, f.local ?? [], sub("browser")), remote: v.strList(`${svc}.browser.files.remote`, f.remote ?? [], sub("browser")) },
    };
  }
  if (r.syncDeps !== undefined) {
    if (!Array.isArray(r.syncDeps)) v.fail(sub("syncDeps"), `service ${svc}: syncDeps must be a list of {lockfile, run, entrypoint, caches, env}`);
    d.syncDeps = r.syncDeps.map((x: any): SyncDeps => {
      only(v, `service ${svc}: syncDeps`, v.map(`${svc}.syncDeps`, x, sub("syncDeps")), ["lockfile", "run", "entrypoint", "caches", "env"], sub("syncDeps"));
      return {
        lockfile: v.str(`${svc}.syncDeps.lockfile`, x.lockfile, sub("syncDeps")), run: v.strList(`${svc}.syncDeps.run`, x.run, sub("syncDeps")),
        ...(x.entrypoint !== undefined ? { entrypoint: String(x.entrypoint ?? "") } : {}),
        caches: strMap(v, `${svc}.syncDeps.caches`, x.caches ?? {}, sub("syncDeps")), env: strMap(v, `${svc}.syncDeps.env`, x.env ?? {}, sub("syncDeps")),
      };
    });
  }
  if (r.preview !== undefined) {
    const x = v.map(`${svc}.preview`, r.preview, sub("preview"));
    only(v, `service ${svc}: preview`, x, ["out", "viteTemp", "command", "mkOut", "needMiB", "dropEnv", "mode"], sub("preview"));
    const mode = x.mode === undefined ? {} : v.map(`${svc}.preview.mode`, x.mode, sub("preview"));
    for (const m of Object.values(mode)) if (m !== "production" && m !== "development") v.fail(sub("preview"), `service ${svc}: preview.mode values are production or development`);
    d.preview = {
      out: v.str(`${svc}.preview.out`, x.out, sub("preview")), viteTemp: v.str(`${svc}.preview.viteTemp`, x.viteTemp, sub("preview")),
      command: v.str(`${svc}.preview.command`, x.command, sub("preview")), mkOut: !!x.mkOut,
      needMiB: typeof x.needMiB === "number" ? x.needMiB : v.fail(sub("preview"), `service ${svc}: preview.needMiB must be a number`),
      dropEnv: v.strList(`${svc}.preview.dropEnv`, x.dropEnv ?? [], sub("preview")), mode: mode as Preview["mode"],
    };
  }
  if (r.share !== undefined) {
    const x = v.map(`${svc}.share`, r.share, sub("share"));
    only(v, `service ${svc}: share`, x, ["about", "notice"], sub("share"));
    d.share = { ...(x.about !== undefined ? { about: kindText(v, `${svc}.share.about`, x.about, sub("share")) } : {}), ...(x.notice !== undefined ? { notice: kindText(v, `${svc}.share.notice`, x.notice, sub("share")) } : {}) };
  }
  if (r.air !== undefined) {
    if (!d.go) v.fail(sub("air"), `service ${svc}: air is for go services`);
    const x = v.map(`${svc}.air`, r.air, sub("air"));
    only(v, `service ${svc}: air`, x, ["target", "build", "run"], sub("air"));
    d.air = {};
    for (const k of ["target", "build", "run"] as const) if (x[k] !== undefined) d.air[k] = v.str(`${svc}.air.${k}`, x[k], sub("air"));
  }
  if (r.skipIfExists !== undefined) d.skipIfExists = v.str(`${svc}.skipIfExists`, r.skipIfExists, sub("skipIfExists"));
  if (r.softFail !== undefined) {
    if (d.kind !== "init") v.fail(sub("softFail"), `service ${svc}: softFail is for kind init`);
    const x = v.map(`${svc}.softFail`, r.softFail, sub("softFail"));
    only(v, `service ${svc}: softFail`, x, ["match", "warning"], sub("softFail"));
    let match: RegExp;
    try {
      match = new RegExp(v.str(`${svc}.softFail.match`, x.match, sub("softFail")));
    } catch (e) {
      return v.fail(sub("softFail"), `service ${svc}: bad softFail.match: ${(e as Error).message}`);
    }
    d.softFail = { match, warning: v.str(`${svc}.softFail.warning`, x.warning, sub("softFail")) };
  }
  if (r.restartDeadWorkersAfter !== undefined) d.restartDeadWorkersAfter = v.str(`${svc}.restartDeadWorkersAfter`, r.restartDeadWorkersAfter, sub("restartDeadWorkersAfter"));
}

type Top = Pick<Manifest, "vars" | "requires" | "backendHost" | "secrets" | "seed" | "share" | "hooks" | "dashboard">;

export function parseTop(doc: any, names: Set<string>, keyLine: (k: string, indent: number, from?: number) => number, v: V): Top {
  const at = (k: string) => keyLine(k, 0);
  const known = (k: string, s: string, line: number) => (names.has(s) ? s : v.fail(line, `${k}: unknown service "${s}"`));

  const vars: Record<string, DerivedVar> = {};
  if (doc.vars !== undefined) for (const [k, x] of Object.entries<any>(v.map("vars", doc.vars, at("vars")))) {
    const n = keyLine(k, 2, at("vars") - 1);
    only(v, `vars.${k}`, v.map(`vars.${k}`, x, n), ["service", "file", "match"], n);
    try {
      new RegExp(String(x.match).replace(/\{\{[^}]*\}\}/g, "x"));
    } catch (e) {
      v.fail(n, `vars.${k}: bad match: ${(e as Error).message}`);
    }
    vars[k] = { service: known(`vars.${k}`, v.str(`vars.${k}.service`, x.service, n), n), file: v.str(`vars.${k}.file`, x.file, n), match: v.str(`vars.${k}.match`, x.match, n) };
  }

  const reqs = (raw: unknown, line: number): Requirement[] => {
    if (!Array.isArray(raw)) return v.fail(line, "requires.<kind> must be a list of {file, fix}");
    return raw.map((x: any) => {
      only(v, "requires", v.map("requires entry", x, line), ["file", "fix"], line);
      return { file: v.str("requires.file", x.file, line), ...(x.fix !== undefined ? { fix: v.str("requires.fix", x.fix, line) } : {}) };
    });
  };
  const requires: Top["requires"] = { local: [], remote: [] };
  if (doc.requires !== undefined) {
    const r = v.map("requires", doc.requires, at("requires"));
    only(v, "requires", r, ["local", "remote"], at("requires"));
    if (r.local !== undefined) requires.local = reqs(r.local, keyLine("local", 2, at("requires") - 1));
    if (r.remote !== undefined) requires.remote = reqs(r.remote, keyLine("remote", 2, at("requires") - 1));
  }

  let backendHost: Top["backendHost"] = null;
  if (doc.backendHost !== undefined) {
    const x = v.map("backendHost", doc.backendHost, at("backendHost"));
    only(v, "backendHost", x, ["file", "key"], at("backendHost"));
    backendHost = { file: v.str("backendHost.file", x.file, at("backendHost")), key: v.str("backendHost.key", x.key, at("backendHost")) };
  }

  const secrets: Secret[] = [];
  if (doc.secrets !== undefined) {
    if (!Array.isArray(doc.secrets)) v.fail(at("secrets"), "secrets must be a list of {service, file, keys, command, fix}");
    for (const x of doc.secrets) {
      const n = at("secrets");
      only(v, "secrets", v.map("secrets entry", x, n), ["service", "file", "keys", "command", "fix"], n);
      secrets.push({ service: known("secrets", v.str("secrets.service", x.service, n), n), file: v.str("secrets.file", x.file, n), keys: v.strList("secrets.keys", x.keys, n), command: v.strList("secrets.command", x.command, n), ...(x.fix !== undefined ? { fix: v.str("secrets.fix", x.fix, n) } : {}) });
    }
  }

  let seed: SeedSpec | null = null;
  if (doc.seed !== undefined) {
    const n = at("seed");
    const x = v.map("seed", doc.seed, n);
    only(v, "seed", x, ["service", "requires", "counts"], n);
    seed = { service: known("seed", v.str("seed.service", x.service, n), n), requires: (x.requires === undefined ? [] : v.strList("seed.requires", x.requires, n)).map((s) => known("seed.requires", s, n)) };
    if (x.counts !== undefined) {
      const c = v.map("seed.counts", x.counts, n);
      only(v, "seed.counts", c, ["service", "command", "stdin"], n);
      seed.counts = { service: known("seed.counts", v.str("seed.counts.service", c.service, n), n), command: v.strList("seed.counts.command", c.command, n), ...(c.stdin !== undefined ? { stdin: String(c.stdin) } : {}) };
    }
  }

  const share: ShareSpec = { reach: {}, block: {} };
  if (doc.share !== undefined) {
    const n = at("share");
    const x = v.map("share", doc.share, n);
    only(v, "share", x, ["reach", "block"], n);
    if (x.reach !== undefined) {
      const r = v.map("share.reach", x.reach, n);
      only(v, "share.reach", r, ["local", "remote"], n);
      for (const k of ["local", "remote"] as const) if (r[k] !== undefined) share.reach[k] = v.strList(`share.reach.${k}`, r[k], n).map((s) => known("share.reach", s, n));
    }
    if (x.block !== undefined) {
      const b = v.map("share.block", x.block, n);
      only(v, "share.block", b, ["local", "remote"], n);
      for (const k of ["local", "remote"] as const) if (b[k] !== undefined) {
        if (!Array.isArray(b[k])) v.fail(n, `share.block.${k} must be a list of {service, prefixes}`);
        share.block[k] = b[k].map((e: any) => ({ service: known("share.block", v.str("share.block.service", e?.service, n), n), prefixes: v.strList("share.block.prefixes", e?.prefixes, n) }));
      }
    }
  }

  const hooks: Top["hooks"] = {};
  if (doc.hooks !== undefined) {
    const x = v.map("hooks", doc.hooks, at("hooks"));
    only(v, "hooks", x, ["beforeDown"], at("hooks"));
    if (x.beforeDown !== undefined) hooks.beforeDown = v.str("hooks.beforeDown", x.beforeDown, at("hooks"));
  }

  let dashboard: DashboardSpec = {};
  if (doc.dashboard !== undefined) {
    const x = v.map("dashboard", doc.dashboard, at("dashboard"));
    only(v, "dashboard", x, ["backends", "services", "looks", "steps", "pins"], at("dashboard"));
    if (x.pins !== undefined) x.pins = v.strList("dashboard.pins", x.pins, at("dashboard")).map((s) => known("dashboard.pins", s, at("dashboard")));
    dashboard = x as DashboardSpec;
  }

  return { vars, requires, backendHost, secrets, seed, share, hooks, dashboard };
}
