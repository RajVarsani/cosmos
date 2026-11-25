import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { extraDir, manifest, repoOf, SERVICES, vendorDir } from "./catalog";
import { cosmosContainers } from "./docker";
import { initCheck } from "./project";
import { projectDir } from "./paths";
import { readState } from "./state";
import { GIT_ENV, run } from "./sh";

async function headSha(dir: string): Promise<string | null> {
  const r = await run(["git", "-C", dir, "rev-parse", "HEAD"], { quiet: true, env: GIT_ENV });
  return r.code === 0 ? r.stdout.trim() : null;
}

// instances with a running container: they build from and mount the vendored worktree
async function runningInstances(): Promise<string[]> {
  const names = new Set(Object.keys(readState().instances));
  const cs = await cosmosContainers().catch(() => []);
  return [...new Set(cs.filter((c) => c.running && names.has(c.instance)).map((c) => c.instance))];
}

// HOME/vendor/<projectId>: a detached worktree of the project at its checkout's HEAD (compose file, Dockerfiles).
// It follows HEAD when HEAD moves and no instance is running; with one running it refuses rather than move under it.
export async function ensureVendor(log: (m: string) => void): Promise<{ sha: string }> {
  const project = projectDir();
  const dir = vendorDir();
  const want = await headSha(project);
  if (!want) throw new Error(`${project} is not a git checkout with a commit; cosmos vendors the project from its HEAD`);
  if (!existsSync(dir)) {
    log(`vendoring ${manifest().projectId} ${want.slice(0, 8)} -> ${dir}`);
    mkdirSync(dirname(dir), { recursive: true });
    await run(["git", "-C", project, "worktree", "add", "--detach", dir, want], { check: true });
  }
  const have = await headSha(dir);
  if (!have) throw new Error(`${dir} is a worktree of a project checkout that is gone or moved; run: rm -rf ${dir} (cosmos makes it again from ${project})`);
  if (have === want) return { sha: have };
  const busy = await runningInstances();
  if (busy.length) throw new Error(`${dir} is at ${have.slice(0, 8)} and the project's HEAD is ${want.slice(0, 8)}; running instances (${busy.join(", ")}) use it, so cosmos will not move it. Stop them (cosmos down), or check out ${have.slice(0, 8)} again`);
  const dirty = (await run(["git", "-C", dir, "status", "--porcelain", "--untracked-files=no", "--ignore-submodules=all"], { quiet: true, env: GIT_ENV })).stdout.trim();
  if (dirty) throw new Error(`${dir} has local edits; cosmos will not move it to ${want.slice(0, 8)} while dirty`);
  const fetched = (await run(["git", "-C", dir, "cat-file", "-e", `${want}^{commit}`], { quiet: true, env: GIT_ENV })).code === 0;
  if (!fetched) throw new Error(`${dir} cannot see ${want.slice(0, 8)}; it is not a worktree of ${project}. Remove it (rm -rf ${dir}) and cosmos makes it again`);
  await run(["git", "-C", dir, "-c", "advice.detachedHead=false", "checkout", "-q", "--detach", want], { check: true });
  log(`moved ${dir} to the project's HEAD ${want.slice(0, 8)}`);
  return { sha: want };
}

// The project's pinned gitlink for <sourcesDir>/<repo> (what its Dockerfiles are written against).
export async function pinnedSha(svc: string): Promise<string> {
  const rel = `${manifest().sourcesDir}/${repoOf(svc)}`;
  const r = await run(["git", "-C", vendorDir(), "ls-tree", "HEAD", rel], { quiet: true });
  const sha = r.stdout.trim().split(/\s+/)[2];
  if (!sha) throw new Error(`the project has no gitlink for ${rel}`);
  return sha;
}

// The pinned build sources: each repo at the project's pinned SHA inside the vendored worktree, fetching the one
// commit from a local clone that has it (the project's own submodule first), else from the submodule's remote.
export async function ensureServiceSources(svcs: string[], log: (m: string) => void): Promise<Record<string, string>> {
  const m = manifest();
  const project = projectDir();
  const vdir = vendorDir();
  const out: Record<string, string> = {};
  for (const s of svcs) {
    const x = SERVICES().find((d) => d.svc === s)?.extra;
    if (x) out[s] = await ensureExtra(x, log);
  }
  const sd = m.sourcesDir;
  const gitlinks = (await run(["git", "-C", vdir, "ls-tree", "HEAD", `${sd}/`], { quiet: true })).stdout;
  const repos = [...new Set(svcs.filter((s) => !SERVICES().find((d) => d.svc === s)?.extra).map(repoOf))];
  const mounted = (repo: string) => SERVICES().some((d) => repoOf(d.svc) === repo && d.srcMount);
  const uninit = initCheck(project, repos.filter((r) => gitlinks.includes(`\t${sd}/${r}\n`) && mounted(r)));
  if (uninit) throw new Error(uninit);
  for (const repo of repos) {
    // infra services have no source
    if (!gitlinks.includes(`\t${sd}/${repo}\n`)) continue;
    const sha = await pinnedSha(repo);
    const dir = join(vdir, sd, repo);
    if ((await headSha(dir)) === sha && existsSync(join(dir, ".git"))) {
      out[repo] = sha;
      continue;
    }
    if (existsSync(dir) && readdirSync(dir).length && !existsSync(join(dir, ".git"))) throw new Error(`${dir} is not empty and not a git checkout`);
    // a linked worktree must not be re-initialised in place
    if (existsSync(join(dir, ".git")) && !statSync(join(dir, ".git")).isDirectory()) throw new Error(`${dir} is a linked worktree at ${await headSha(dir)}, the project pins ${sha}; remove it (git worktree remove) once no instance mounts it`);
    const url = (await run(["git", "-C", vdir, "config", "-f", ".gitmodules", `submodule.${sd}/${repo}.url`], { quiet: true })).stdout.trim();
    const candidates = [join(project, sd, repo), url].filter(Boolean);
    await run(["git", "init", "-q", dir], { check: true });
    let got = false;
    for (const c of candidates) {
      if ((await run(["git", "-C", dir, "fetch", "-q", "--no-tags", c, sha], { quiet: true })).code === 0) {
        log(`vendored ${repo} ${sha.slice(0, 8)} from ${c}`);
        got = true;
        break;
      }
    }
    if (!got) throw new Error(`could not fetch ${repo}@${sha} from ${candidates.join(" or ")}`);
    await run(["git", "-C", dir, "-c", "advice.detachedHead=false", "checkout", "-q", "--detach", sha], { check: true });
    out[repo] = sha;
  }
  return out;
}

// HOME/vendor/<extra> at the manifest's pin: a detached checkout fetched from its url (read-only use of the repo).
export async function ensureExtra(id: string, log: (m: string) => void): Promise<string> {
  const x = manifest().extras.find((e) => e.id === id);
  if (!x) throw new Error(`no extra ${id} in the manifest`);
  const dir = extraDir(id);
  const { sha, url } = x;
  if ((await headSha(dir)) === sha) {
    const dirty = (await run(["git", "-C", dir, "status", "--porcelain"], { quiet: true, env: GIT_ENV })).stdout.trim();
    if (dirty) throw new Error(`${dir} has local edits; cosmos will not build under the pin ${sha.slice(0, 8)} while dirty`);
    return sha;
  }
  if (existsSync(dir) && readdirSync(dir).length && !existsSync(join(dir, ".git"))) throw new Error(`${dir} is not empty and not a git checkout`);
  mkdirSync(dirname(dir), { recursive: true });
  await run(["git", "init", "-q", dir], { check: true });
  const have = (await run(["git", "-C", dir, "cat-file", "-e", `${sha}^{commit}`], { quiet: true })).code === 0;
  if (!have && (await run(["git", "-C", dir, "fetch", "-q", "--no-tags", url, sha], { quiet: true })).code !== 0) {
    throw new Error(`could not fetch ${id}@${sha.slice(0, 8)} from ${url} (needs read access to that repo)`);
  }
  const dirty = (await run(["git", "-C", dir, "status", "--porcelain"], { quiet: true, env: GIT_ENV })).stdout.trim();
  if (dirty) throw new Error(`${dir} has local edits; cosmos will not move it to the pin ${sha.slice(0, 8)}`);
  await run(["git", "-C", dir, "-c", "advice.detachedHead=false", "checkout", "-q", "--detach", sha], { check: true });
  log(`vendored ${id} ${sha.slice(0, 8)} -> ${dir}`);
  return sha;
}
