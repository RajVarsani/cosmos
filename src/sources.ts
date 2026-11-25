// Per-instance source: one git worktree per source-mounted service, made from the project's submodule checkout.
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync } from "fs";
import { join, resolve } from "path";
import { INSTANCES_DIR, STATE_DIR } from "./paths";
import { initCheck } from "./project";
import { manifest, repoOf, svcDef } from "./catalog";
import { projectDir } from "./paths";
import { withLock } from "./lock";
import { pinnedSha } from "./vendor";
import { GIT_ENV, run } from "./sh";

export const instanceSrcDir = (name: string, svc: string) => join(INSTANCES_DIR, name, "src", svc);
// services an instance runs from a bind-mounted checkout
export const srcServices = (services: string[]) => services.filter((s) => svcDef(s).srcMount);

const git = (dir: string, args: string[], timeoutMs?: number) => run(["git", "-C", dir, "-c", "advice.detachedHead=false", ...args], { quiet: true, timeoutMs, env: GIT_ENV });
const out = async (dir: string, args: string[]) => {
  const r = await git(dir, args);
  return r.code === 0 ? r.stdout.trim() : null;
};
const must = async (dir: string, args: string[]) => {
  const r = await git(dir, args);
  if (r.code !== 0) throw new Error(`git ${args.join(" ")} in ${dir} failed: ${(r.stderr || r.stdout).trim().slice(-600)}`);
  return r.stdout.trim();
};
const gitErr = (r: { code: number; stdout: string; stderr: string }) => (r.stderr || r.stdout).trim().split("\n").at(-1) || `exit ${r.code}`;
const few = (xs: string[], n = 5) => xs.slice(0, n).join(", ") + (xs.length > n ? ` and ${xs.length - n} more` : "");
const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

// The project's submodule checkout for a service; its repo is where every instance worktree hangs off.
export async function svcRepo(svc: string): Promise<string> {
  const g = projectDir();
  const bad = initCheck(g, [repoOf(svc)]);
  if (bad) throw new Error(bad);
  return join(g, manifest().sourcesDir, repoOf(svc));
}

// one git-mutating step per service repo at a time
const repoLock = <T>(svc: string, fn: () => Promise<T>) => withLock(join(STATE_DIR, "git", `${svc}.lock`), { staleMs: 10 * 60_000, waitMs: 5 * 60_000 }, fn);

export const isWorktree = (dir: string) => existsSync(join(dir, ".git"));

type Wt = { path: string; head: string | null; branch: string | null };

async function worktrees(repo: string): Promise<Wt[]> {
  const txt = (await out(repo, ["worktree", "list", "--porcelain"])) ?? "";
  return txt.split("\n\n").filter(Boolean).map((b) => {
    const get = (k: string) => b.split("\n").find((l) => l.startsWith(`${k} `))?.slice(k.length + 1) ?? null;
    return { path: get("worktree")!, head: get("HEAD"), branch: get("branch")?.replace(/^refs\/heads\//, "") ?? null };
  });
}

const cosmosOwned = (path: string) => real(path).startsWith(real(INSTANCES_DIR) + "/");

// The working dir of a listed worktree: a submodule's own checkout lists as its gitdir, so read its core.worktree.
async function workDir(path: string): Promise<string> {
  if (!/\/\.git\/modules\//.test(path)) return path;
  const wt = await out(path, ["config", "--file", join(path, "config"), "core.worktree"]);
  return wt ? resolve(path, wt) : path.replace(/\/\.git\/modules\//, "/");
}

// A foreign checkout cosmos may mount live: an existing worktree of svc's repo (by its toplevel and common dir), outside cosmos.
export async function liveCheckout(svc: string, path: string): Promise<string | null> {
  if (!existsSync(path)) return `${path} does not exist`;
  if (cosmosOwned(path)) return `${path} belongs to a cosmos instance`;
  const repo = await svcRepo(svc);
  const [top, common, want] = await Promise.all([out(path, ["rev-parse", "--show-toplevel"]), out(path, ["rev-parse", "--path-format=absolute", "--git-common-dir"]), out(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"])]);
  if (!top || real(top) !== real(path)) return `${path} is not the top of a git worktree`;
  if (!common || !want || real(common) !== real(want)) return `${path} is not a worktree of ${repo}`;
  return null;
}

// "instance vega" for a cosmos worktree, else the path (the project clone or the user's own worktrees)
export function holderOf(path: string): string {
  const m = real(path).startsWith(real(INSTANCES_DIR) + "/") ? real(path).slice(real(INSTANCES_DIR).length + 1).split("/") : null;
  if (m && m[1] === "src") return `instance ${m[0]}`;
  // a submodule's own checkout lists as its gitdir, <clone>/.git/modules/<path>
  const sub = path.match(/^(.*)\/\.git\/modules\/(.+)$/);
  return (sub ? `${sub[1]}/${sub[2]}` : path).replace(process.env.HOME ?? "~", "~");
}

// Creates the instance's worktree for svc, detached at `at`, if it is not there yet.
// A fresh instance reuses a leftover worktree of the same name only when it holds nothing unsaved.
export async function ensureWorktree(name: string, svc: string, at: string, log: (m: string) => void, o: { fresh?: boolean } = {}): Promise<string> {
  const dir = instanceSrcDir(name, svc);
  if (isWorktree(dir)) {
    if (!o.fresh) return dir;
    const u = await unsavedWork(dir);
    if (u) throw new Error(`${dir} is left from an earlier ${name} and holds ${u}. Save it there (commit, branch or push), or drop it with git -C ${await svcRepo(svc).catch(() => "<project>/" + manifest().sourcesDir + "/" + svc)} worktree remove --force ${dir}`);
    log(`${svc}: reusing the leftover worktree ${dir} (nothing unsaved in it)`);
    return dir;
  }
  const repo = await svcRepo(svc);
  await repoLock(svc, async () => {
    await git(repo, ["worktree", "prune"]);
    if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} exists, is not empty and is not a git worktree`);
    mkdirSync(join(INSTANCES_DIR, name, "src"), { recursive: true });
    await must(repo, ["worktree", "add", "--detach", dir, at]);
  });
  log(`${svc}: worktree ${at.slice(0, 8)} -> ${dir}`);
  return dir;
}

export type SrcState = { svc: string; dir: string; branch: string | null; sha: string | null; dirty: number | null; pinned: string; atPin: boolean; upstream: string | null; ahead: number | null; behind: number | null };

export async function srcState(svc: string, dir: string): Promise<SrcState> {
  const pinned = await pinnedSha(svc);
  const [branch, sha, st, up] = await Promise.all([
    out(dir, ["symbolic-ref", "--short", "-q", "HEAD"]),
    out(dir, ["rev-parse", "HEAD"]),
    out(dir, ["status", "--porcelain", "--untracked-files=no"]),
    out(dir, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
  ]);
  let ahead: number | null = null, behind: number | null = null;
  if (up) {
    const c = await out(dir, ["rev-list", "--left-right", "--count", `HEAD...${up}`]);
    if (c) [ahead, behind] = c.split(/\s+/).map(Number);
  }
  return { svc, dir, branch, sha, dirty: st === null ? null : st.split("\n").filter(Boolean).length, pinned, atPin: sha === pinned, upstream: up, ahead, behind };
}

// Fetches origin at most once a minute per repo; a failed fetch leaves the refs as they were.
const fetchedAt: Record<string, number> = {};
export async function fetchOrigin(svc: string, log: (m: string) => void, force = false): Promise<string | null> {
  if (!force && Date.now() - (fetchedAt[svc] ?? 0) < 60_000) return null;
  const repo = await svcRepo(svc);
  const r = await git(repo, ["fetch", "--prune", "--no-tags", "origin"], 90_000);
  if (r.code !== 0) return `${svc}: git fetch origin failed, using the refs already fetched (${(r.stderr || r.stdout).trim().split("\n").at(-1)})`;
  fetchedAt[svc] = Date.now();
  log(`${svc}: fetched origin`);
  return null;
}

// live: checked out in a worktree outside cosmos, so picking it mounts that checkout; clone: checked out in the user's
// clone, so picking it runs a copy unless live is asked for
export type Ref = { name: string; local: boolean; remote: boolean; sha: string; date: string; subject: string; heldBy: string | null; live: boolean; clone: boolean };

// Branches for the switcher, newest first: local and origin merged by name, with who has each checked out.
export async function listRefs(svc: string, o: { fetch?: boolean; limit?: number } = {}): Promise<{ svc: string; pinned: string; refs: Ref[]; warning: string | null }> {
  const repo = await svcRepo(svc);
  const warning = o.fetch ? await fetchOrigin(svc, () => {}) : null;
  const txt = (await out(repo, ["for-each-ref", "--sort=-committerdate", "--format=%(refname)%09%(objectname)%09%(committerdate:iso-strict)%09%(subject)", "refs/heads", "refs/remotes/origin"])) ?? "";
  const wts = await Promise.all((await worktrees(repo)).filter((w) => w.branch).map(async (w) => ({ ...w, kind: await foreignKind(repo, w.path) })));
  const held = new Map(wts.map((w) => [w.branch!, holderOf(w.path)]));
  const live = new Set(wts.filter((w) => w.kind === "worktree").map((w) => w.branch!));
  const clone = new Set(wts.filter((w) => w.kind === "clone").map((w) => w.branch!));
  const by = new Map<string, Ref>();
  for (const line of txt.split("\n").filter(Boolean)) {
    const [ref, sha, date, ...rest] = line.split("\t");
    const local = ref.startsWith("refs/heads/");
    const name = ref.replace(/^refs\/heads\/|^refs\/remotes\/origin\//, "");
    if (name === "HEAD") continue;
    const cur = by.get(name);
    if (cur) {
      cur.local ||= local;
      cur.remote ||= !local;
      if (local) cur.sha = sha;
      continue;
    }
    by.set(name, { name, local, remote: !local, sha, date, subject: rest.join("\t"), heldBy: held.get(name) ?? null, live: live.has(name), clone: clone.has(name) });
  }
  return { svc, pinned: await pinnedSha(svc), refs: [...by.values()].slice(0, o.limit ?? 300), warning };
}

// How a listed worktree outside cosmos is treated: the primary clone, a linked worktree, or gone (a prunable record).
async function foreignKind(repo: string, path: string): Promise<"clone" | "worktree" | "gone" | null> {
  if (cosmosOwned(path)) return null;
  const dir = await workDir(path);
  if (!existsSync(dir)) return "gone";
  return real(dir) === real(repo) ? "clone" : "worktree";
}

// live: dir is a foreign checkout mounted as is; cosmos never changes its git state
export type SwitchResult = { svc: string; dir: string; ref: string | null; branch: string | null; sha: string; live: boolean; warnings: string[] };

// Points svc of an instance at `ref` (null: the project's pinned commit). A branch checked out in a linked worktree outside
// cosmos is mounted live from there; one in the project clone only with live, else it runs a copy. Otherwise the instance's own worktree moves: a free local branch attaches (fast-forwarded
// when clean and only behind), an origin-only branch gets a tracking branch, a branch held by another instance and a
// sha or tag run detached. Without force it refuses to orphan commits or overwrite ignored files.
export async function switchWorktree(name: string, svc: string, ref: string | null, log: (m: string) => void, o: { force?: boolean; fresh?: boolean; live?: boolean } = {}): Promise<SwitchResult> {
  const repo = await svcRepo(svc);
  const warnings: string[] = [];
  const fw = await fetchOrigin(svc, log, true);
  if (fw) warnings.push(fw);
  const pinned = await pinnedSha(svc);
  const want = ref?.trim() || null;
  // why a branch held outside cosmos runs detached in the instance's own worktree instead of live
  let held: string | null = null;
  if (want && (await out(repo, ["rev-parse", "--verify", "-q", `refs/heads/${want}^{commit}`]))) {
    const h = (await worktrees(repo)).find((w) => w.branch === want && !cosmosOwned(w.path));
    const kind = h && (await foreignKind(repo, h.path));
    if (h && kind === "gone") held = `${svc}: ${want}'s worktree ${holderOf(h.path)} is gone (git worktree prune drops its record), so ${name} runs it detached`;
    else if (h && kind === "clone" && !o.live) held = `${svc}: ${want} is held by your clone ${holderOf(h.path)}, so ${name} runs a copy of it detached (--live mounts the clone instead)`;
    else if (h) {
      const dir = await workDir(h.path);
      const bad = await liveCheckout(svc, dir);
      if (bad) throw new Error(`${svc}: ${want} is checked out in ${dir}, which cosmos cannot mount (${bad})`);
      const st = await srcState(svc, dir);
      if (st.ahead || st.behind) warnings.push(`${svc}: ${want} in ${holderOf(dir)} is ${st.ahead ?? 0} ahead, ${st.behind ?? 0} behind ${st.upstream}`);
      log(`${svc}: live ${dir} (${want} @ ${st.sha?.slice(0, 8)})`);
      return { svc, dir, ref: want, branch: st.branch, sha: st.sha!, live: true, warnings };
    }
  }
  const dir = await ensureWorktree(name, svc, pinned, log, { fresh: o.fresh });
  return repoLock(svc, async () => {
    const st0 = await git(dir, ["status", "--porcelain", "--untracked-files=no"]);
    if (st0.code !== 0) throw new Error(`${svc} in ${name}: could not read git state in ${dir} (${gitErr(st0)}); not switching`);
    const dirty = st0.stdout.trim();
    if (dirty) throw new Error(`${svc} in ${name} has ${dirty.split("\n").length} uncommitted change(s) in ${dir}; commit or stash them there first`);
    const local = want && (await out(repo, ["rev-parse", "--verify", "-q", `refs/heads/${want}^{commit}`]));
    const remote = want && !local ? await out(repo, ["rev-parse", "--verify", "-q", `refs/remotes/origin/${want}^{commit}`]) : null;
    // a local branch strictly behind origin/<want> runs origin's commit; ahead or diverged keeps local and says so
    const originSha = want && local ? await out(repo, ["rev-parse", "--verify", "-q", `refs/remotes/origin/${want}^{commit}`]) : null;
    let useOrigin = false;
    if (local && originSha && originSha !== local) {
      const c = await out(repo, ["rev-list", "--left-right", "--count", `${local}...${originSha}`]);
      const [ah, bh] = c ? c.split(/\s+/).map(Number) : [0, 0];
      if (ah === 0 && bh > 0) useOrigin = true;
      else if (ah > 0) warnings.push(`${svc}: local ${want} ${local.slice(0, 8)} is ${ah} ahead${bh ? `, ${bh} behind` : ""} origin/${want} ${originSha.slice(0, 8)}; using local`);
    }
    const sha = (useOrigin && originSha) || local || remote || (want ? await out(repo, ["rev-parse", "--verify", "-q", `${want}^{commit}`]) : pinned);
    if (!sha) throw new Error(`${svc}: no branch, tag or commit "${want}" (fetched origin)`);
    if (!o.force) {
      const lost = await orphanCommits(dir);
      if (!lost) throw new Error(`${svc} in ${name}: could not tell whether ${dir} has commits on no branch; not switching (--force switches anyway)`);
      if (lost.length) throw new Error(`${svc} in ${name}: ${dir} has ${lost.length} commit(s) on no branch that the switch would orphan: ${few(lost)}. Keep them with git -C ${dir} branch <name>, or switch with --force`);
      const hit = await ignoredOverwrites(dir, sha);
      if (!hit) throw new Error(`${svc} in ${name}: could not list the ignored files in ${dir}; not switching (--force switches anyway)`);
      if (hit.length) throw new Error(`${svc} in ${name}: switching would overwrite ignored file(s) the target tracks: ${few(hit)} in ${dir}. Move them aside, or switch with --force`);
    }
    if (local) {
      const holder = (await worktrees(repo)).find((w) => w.branch === want && real(w.path) !== real(dir));
      if (holder) {
        await must(dir, ["checkout", "-q", "--detach", sha]);
        warnings.push(`${held ?? `${svc}: ${want} is checked out in ${holderOf(holder.path)}, so ${name} runs it detached`} at ${sha.slice(0, 8)}; commits here will not move the branch`);
      } else {
        await must(dir, ["checkout", "-q", want!]);
        const why = useOrigin ? await ffBlocker(dir, `origin/${want}`) : null;
        if (useOrigin && !why) {
          await must(dir, ["merge", "-q", "--ff-only", `origin/${want}`]);
          log(`${svc}: fast-forwarded ${want} to origin/${want}`);
        } else if (why) warnings.push(`${svc}: ${want} is behind origin/${want} but not fast-forwarded (${why})`);
      }
    } else if (remote) {
      await must(dir, ["checkout", "-q", "-b", want!, "--track", `origin/${want}`]);
      log(`${svc}: created local branch ${want} tracking origin/${want}`);
    } else await must(dir, ["checkout", "-q", "--detach", sha]);
    let st = await srcState(svc, dir);
    if (st.branch && st.behind) {
      const why = st.ahead ? `${st.ahead} local commit(s) ahead` : await ffBlocker(dir, st.upstream!);
      if (!why) {
        await must(dir, ["merge", "-q", "--ff-only", st.upstream!]);
        log(`${svc}: fast-forwarded ${st.branch} ${st.behind} commit(s) to ${st.upstream}`);
        st = await srcState(svc, dir);
      } else warnings.push(`${svc}: ${st.branch} is ${st.ahead ?? 0} ahead, ${st.behind} behind ${st.upstream}; not fast-forwarded (${why})`);
    } else if (st.branch && st.ahead) warnings.push(`${svc}: ${st.branch} is ${st.ahead} ahead of ${st.upstream}`);
    log(`${svc}: ${st.branch ?? "detached"} @ ${st.sha!.slice(0, 8)}`);
    return { svc, dir, ref: want, branch: st.branch, sha: st.sha!, live: false, warnings };
  });
}

// Why a fast-forward to `up` is unsafe in dir (any changed or untracked file, or an ignored file it would overwrite), null when safe.
async function ffBlocker(dir: string, up: string): Promise<string | null> {
  const st = await statusEntries(dir);
  if (!st) return "could not read git state";
  const changed = st.filter(([xy]) => xy !== "!!").map(([, p]) => p);
  if (changed.length) return `${changed.length} changed or untracked file(s): ${few(changed)}`;
  const target = await out(dir, ["rev-parse", "--verify", "-q", `${up}^{commit}`]);
  const hit = target && (await ignoredOverwrites(dir, target));
  if (!hit) return "could not list ignored files";
  return hit.length ? `it would overwrite ignored ${few(hit)}` : null;
}

// Worktree directories an instance has, whatever its state record says.
export function instanceWorktrees(name: string): { svc: string; dir: string }[] {
  const root = join(INSTANCES_DIR, name, "src");
  if (!existsSync(root)) return [];
  return readdirSync(root).map((svc) => ({ svc, dir: join(root, svc) })).filter((w) => isWorktree(w.dir));
}

// Ignored paths that are build output, deps or caches; anything else ignored (.env.local) counts as the user's.
const DISPOSABLE = new Set(["node_modules", ".pnpm-store", "dist", "build", "tmp", ".cache", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".turbo", ".next", ".vite", ".parcel-cache", "coverage", ".venv", "venv"]);
const disposable = (p: string) => {
  const parts = p.replace(/\/$/, "").split("/");
  return parts.some((x) => DISPOSABLE.has(x)) || parts.at(-1) === ".DS_Store" || /\.(pyc|log)$/.test(p);
};

const holdsFiles = (d: string): boolean => {
  try {
    return readdirSync(d, { withFileTypes: true }).some((e) => !e.isDirectory() || holdsFiles(join(d, e.name)));
  } catch {
    return true;
  }
};

// `status --porcelain -z --ignored=matching` as [xy, path] pairs; null when git fails. matching names each ignored path
// (apps/secure/node_modules/), not a parent dir that holds nothing else (apps/), so disposable() can judge it.
// Untracked build output (turbo's .turbo on a commit that does not ignore it) is left out: it is not work. So is an
// ignored dir with no file in it (a Docker mountpoint), which matching lists and plain --ignored does not.
async function statusEntries(dir: string): Promise<[string, string][] | null> {
  const r = await git(dir, ["status", "--porcelain", "-z", "--ignored=matching"]);
  if (r.code !== 0) return null;
  const f = r.stdout.split("\0");
  const outp: [string, string][] = [];
  for (let i = 0; i < f.length; i++) {
    if (!f[i]) continue;
    const xy = f[i].slice(0, 2);
    const p = f[i].slice(3);
    const skip = disposable(p) ? xy === "??" : xy === "!!" && p.endsWith("/") && !holdsFiles(join(dir, p));
    if (!skip) outp.push([xy, p]);
    if (xy[0] === "R" || xy[0] === "C") i++;
  }
  return outp;
}

// Commits HEAD has that no branch, tag or remote reaches, as "sha subject"; null when git cannot say.
async function orphanCommits(dir: string): Promise<string[] | null> {
  const r = await git(dir, ["log", "--format=%h %s", "HEAD", "--not", "--branches", "--tags", "--remotes"]);
  return r.code === 0 ? r.stdout.split("\n").filter(Boolean) : null;
}

// Ignored files of the user's that a checkout of `sha` would overwrite; null when git cannot say.
async function ignoredOverwrites(dir: string, sha: string): Promise<string[] | null> {
  const st = await statusEntries(dir);
  if (!st) return null;
  const mine = st.filter(([xy, p]) => xy === "!!" && !disposable(p)).map(([, p]) => p);
  if (!mine.length) return [];
  const r = await git(dir, ["ls-tree", "-r", "-z", "--name-only", sha, "--", ...mine]);
  if (r.code !== 0) return null;
  return r.stdout.split("\0").filter((p) => p && existsSync(join(dir, p)));
}

// Work that removing the worktree would lose: uncommitted or untracked files, commits no branch, tag or remote
// reaches, and ignored files that are not build output. A git error counts as unsaved.
export async function unsavedWork(dir: string): Promise<string | null> {
  const files = await fileWork(dir);
  const lost = files && (await orphanCommits(dir));
  if (!files || !lost) return unreadable(dir);
  const why = [...files];
  if (lost.length) why.push(`${lost.length} commit(s) on no branch: ${few(lost)} (keep them with git -C ${dir} branch <name>)`);
  return why.length ? why.join("; ") : null;
}

const unreadable = async (dir: string) => `unknown work: could not read git state in ${dir} (${gitErr(await git(dir, ["rev-parse", "HEAD"]))}), so cosmos treats it as unsaved`;

// uncommitted, untracked and the user's ignored files, as reasons; null when git fails
async function fileWork(dir: string): Promise<string[] | null> {
  const st = await statusEntries(dir);
  if (!st) return null;
  const why: string[] = [];
  const changed = st.filter(([xy]) => xy !== "!!").map(([, p]) => p);
  if (changed.length) why.push(`${changed.length} uncommitted file(s): ${few(changed)}`);
  const ign = st.filter(([xy, p]) => xy === "!!" && !disposable(p)).map(([, p]) => p);
  if (ign.length) why.push(`${ign.length} ignored file(s) git does not keep: ${few(ign)}`);
  return why;
}

// A shared legacy folder (vendor/..., an old --src) moves to the instance's worktree only when that loses nothing:
// no tracked, untracked or ignored edits, and a HEAD that the repo reaches from its refs.
// (A vendor checkout has no refs of its own, so reachability is judged in the repo.)
export async function legacyUnsaved(svc: string, dir: string, pinned: string): Promise<{ sha: string | null; why: string | null }> {
  const sha = await out(dir, ["rev-parse", "HEAD"]);
  const files = await fileWork(dir);
  if (!files || !sha) return { sha, why: await unreadable(dir) };
  if (files.length) return { sha, why: files.join("; ") };
  if (sha === pinned) return { sha, why: null };
  const repo = await svcRepo(svc);
  const r = await git(repo, ["rev-list", "--count", sha, "--not", "--branches", "--tags", "--remotes"]);
  if (r.code !== 0) return { sha, why: `HEAD ${sha.slice(0, 8)} is not in ${repo}` };
  if (Number(r.stdout.trim())) return { sha, why: `HEAD ${sha.slice(0, 8)} has ${r.stdout.trim()} commit(s) no branch, tag or remote in ${repo} reaches` };
  return { sha, why: null };
}

// "reason" when the worktree is locked ("" with no reason), null when not, undefined when its gitdir is unreadable
function lockOf(dir: string): string | null | undefined {
  try {
    const g = readFileSync(join(dir, ".git"), "utf8").match(/^gitdir: (.+)$/m)?.[1];
    const gd = g ? resolve(dir, g.trim()) : null;
    if (!gd || !existsSync(gd)) return undefined;
    return existsSync(join(gd, "locked")) ? readFileSync(join(gd, "locked"), "utf8").trim() : null;
  } catch {
    return undefined;
  }
}

// Removes the instance's worktrees. Without force it keeps any with unsaved work, any git cannot remove and any whose
// repo is missing; a locked worktree is kept even with force. Throws naming what it kept.
export async function removeWorktrees(name: string, log: (m: string) => void, o: { force?: boolean } = {}): Promise<void> {
  const kept: string[] = [];
  for (const { svc, dir } of instanceWorktrees(name)) {
    const lock = lockOf(dir);
    if (typeof lock === "string") {
      kept.push(`${svc}: ${dir} is locked${lock ? ` (${lock})` : ""}; git worktree unlock ${dir} lets cosmos remove it`);
      continue;
    }
    if (!o.force) {
      const u = await unsavedWork(dir);
      if (u) {
        kept.push(`${svc}: ${dir} holds ${u}`);
        continue;
      }
    }
    let repo: string;
    try {
      repo = await svcRepo(svc);
    } catch (e) {
      if (!o.force) {
        kept.push(`${svc}: ${dir} kept, its repo is unavailable (${(e as Error).message})`);
        continue;
      }
      rmSync(dir, { recursive: true, force: true });
      log(`${svc}: deleted ${dir} (--force; its repo is unavailable, so git could not remove it)`);
      continue;
    }
    const err = await repoLock(svc, async () => {
      const r = await git(repo, ["worktree", "remove", "--force", dir]);
      let msg: string | null = null;
      if (r.code !== 0) {
        if (!o.force || /locked/i.test(r.stderr)) msg = `${svc}: git worktree remove failed, ${dir} kept (${gitErr(r)})`;
        else rmSync(dir, { recursive: true, force: true });
      }
      await git(repo, ["worktree", "prune"]);
      return msg;
    });
    if (err) kept.push(err);
    else log(`${svc}: removed worktree ${dir}`);
  }
  if (kept.length) throw new Error(`kept ${kept.length} worktree(s) of ${name}: ${kept.join("; ")}${o.force ? "" : ". rm --force removes them anyway (not a locked one)"}`);
}
