import { existsSync, readdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { join, resolve, sep } from "path";
import type { Check } from "../../api";
import { HOME, expandHome, projectDir } from "../../paths";
import { run } from "../../sh";
import { containerMeminfo, parseMeminfo } from "../meminfo";
import type { Provider } from "../types";

// COLIMA_HOME, else ~/.colima, else $XDG_CONFIG_HOME/colima (what colima itself uses when ~/.colima is absent)
export function colimaHome(env = process.env): string {
  if (env.COLIMA_HOME) return resolve(expandHome(env.COLIMA_HOME));
  const dot = join(homedir(), ".colima");
  if (existsSync(dot)) return dot;
  const xdg = join(env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "colima");
  return existsSync(xdg) ? xdg : dot;
}

const profileDir = (p: string | null) => join(colimaHome(), p ?? "default");
const profileFlag = (p: string | null) => ["--profile", p ?? "default"];

function colimaYaml(p: string | null): Record<string, any> {
  try {
    return (Bun.YAML.parse(readFileSync(join(profileDir(p), "colima.yaml"), "utf8")) as any) ?? {};
  } catch {
    return {};
  }
}

// host dirs the VM mounts; colima mounts ~ and /tmp/colima when the list is empty
export function colimaMounts(y: Record<string, any>): string[] {
  const list = Array.isArray(y.mounts) ? y.mounts.map((m: any) => (typeof m === "string" ? m.split(":")[0] : m?.location)).filter((x: unknown) => typeof x === "string") : [];
  return (list.length ? list : ["~", "/tmp/colima"]).map((l: string) => resolve(expandHome(l)));
}

const under = (p: string, dirs: string[]) => dirs.some((d) => p === d || p.startsWith(d.endsWith(sep) ? d : d + sep));

export const colima: Provider = {
  id: "colima",
  sockets: (profile) => {
    if (profile) return [join(profileDir(profile), "docker.sock")];
    const home = colimaHome();
    let dirs: string[] = [];
    try {
      dirs = readdirSync(home).filter((d) => !d.startsWith("_") && !d.startsWith("."));
    } catch {}
    // default first, then any other profile
    return ["default", ...dirs.filter((d) => d !== "default").sort()].map((d) => join(home, d, "docker.sock"));
  },
  profileOf: (socket) => {
    const m = socket.match(/^(.*)\/([^/]+)\/docker\.sock$/);
    return m && resolve(m[1]) === colimaHome() ? m[2] : null;
  },
  create: (sel) => {
    const profile = sel.profile ?? "default";
    const y = colimaYaml(profile);
    const inotify = y.mountInotify !== false;
    const flag = profileFlag(profile);
    return {
      id: "colima",
      label: "Colima",
      profile,
      source: sel.source,
      dockerHost: sel.endpoint,
      context: profile === "default" ? "colima" : `colima-${profile}`,
      // the engine maps host-gateway to the Mac (lima's host address), but nothing resolves host.docker.internal on its own
      hostAlias: "host.docker.internal",
      extraHosts: ["host.docker.internal:host-gateway"],
      watch: inotify ? "events" : "poll",
      ports: "forwarded",
      caveats: [
        "published ports reach 127.0.0.1 through lima's port forwarder, a second or two after a container starts",
        "bind mounts work only under the dirs the VM mounts (colima.yaml mounts; default ~ and /tmp/colima)",
        ...(inotify ? [] : ["mountInotify is off: host edits raise no file events in containers, so cosmos polls"]),
      ],
      startHint: `colima start ${flag.join(" ")} --cpu 4 --memory 8 --vm-type vz --mount-type virtiofs`,
      memoryFix: `colima stop ${flag.join(" ")} && colima start ${flag.join(" ")} --memory 16 (or edit ${join(profileDir(profile), "colima.yaml")})`,
      cpuFix: `colima stop ${flag.join(" ")} && colima start ${flag.join(" ")} --cpu 4`,
      hostPath: (p) => p,
      // the VM's meminfo over colima ssh needs no image; the container probe is the fallback
      vmMemory: async () => {
        const r = await run(["colima", "ssh", ...flag, "--", "cat", "/proc/meminfo"], { quiet: true, timeoutMs: 15_000 }).catch(() => null);
        if (r && r.code === 0) {
          const m = parseMeminfo(r.stdout);
          if (!("error" in m)) return m;
        }
        return containerMeminfo();
      },
      doctor: async () => {
        const out: Check[] = [];
        const st = await run(["colima", "status", ...flag], { quiet: true, timeoutMs: 15_000 }).catch(() => ({ code: -1, stdout: "", stderr: "colima not installed" }));
        out.push(st.code === 0 ? { name: "colima", ok: true, detail: `profile ${profile} running` } : { name: "colima", ok: false, detail: `profile ${profile}: ${(st.stderr || st.stdout).trim().split("\n").pop() || "not running"}`, fix: `brew install colima; ${`colima start ${flag.join(" ")}`}` });
        const [cv, bv] = await Promise.all([
          run(["docker", "compose", "version", "--short"], { quiet: true, timeoutMs: 10_000 }).catch(() => ({ code: -1, stdout: "" })),
          run(["docker", "buildx", "version"], { quiet: true, timeoutMs: 10_000 }).catch(() => ({ code: -1, stdout: "" })),
        ]);
        out.push(cv.code === 0 ? { name: "docker compose", ok: true, detail: cv.stdout.trim() } : { name: "docker compose", ok: false, detail: "the compose plugin is missing (Colima ships only the engine)", fix: "brew install docker-compose, then add ~/.docker/config.json cliPluginsExtraDirs: [\"/opt/homebrew/lib/docker/cli-plugins\"]" });
        out.push(bv.code === 0 ? { name: "docker buildx", ok: true, detail: bv.stdout.trim().split("\n")[0] } : { name: "docker buildx", ok: false, detail: "the buildx plugin is missing; cosmos builds with --progress=plain", fix: "brew install docker-buildx, then add it to cliPluginsExtraDirs as for compose" });
        const mounts = colimaMounts(y);
        let proj: string | null = null;
        try {
          proj = projectDir();
        } catch {}
        const outside = [HOME, proj].filter((p): p is string => !!p && !under(p, mounts));
        out.push(outside.length ? { name: "colima mounts", ok: false, detail: `${outside.join(", ")} not under the VM's mounts (${mounts.join(", ")}); binds from there come up empty`, fix: `add them to mounts in ${join(profileDir(profile), "colima.yaml")} and restart colima` } : { name: "colima mounts", ok: true, detail: `${mounts.join(", ")}${y.mountType ? ` (${y.mountType})` : ""}` });
        if (!inotify) out.push({ name: "colima file events", ok: false, optional: true, detail: "mountInotify is off; cosmos polls for changes", fix: `set mountInotify: true in ${join(profileDir(profile), "colima.yaml")}` });
        return out;
      },
    };
  },
};
