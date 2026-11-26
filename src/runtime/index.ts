// The active container runtime, picked once per process (see select.ts), and the env every docker call carries.
import { createHash } from "crypto";
import { existsSync, readFileSync, realpathSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { LOCAL_FILE, expandHome } from "../paths";
import { colima } from "./providers/colima";
import { dockerDesktop } from "./providers/docker-desktop";
import { orbstack } from "./providers/orbstack";
import { RuntimeConfigError, selectRuntime } from "./select";
import type { Provider, Runtime, RuntimeInfo } from "./types";

export type { Runtime, RuntimeId, RuntimeInfo, RuntimeSource } from "./types";
export { RUNTIME_IDS } from "./types";
export { RuntimeConfigError } from "./select";

// detection order when nothing names a runtime; podman slots in here as one more provider.
// A function: providers import sh, which imports this module, so nothing here may read them at load time.
export const providers = (): Provider[] => [dockerDesktop, orbstack, colima];

// The engine the docker CLI would use with no flags: DOCKER_HOST, else DOCKER_CONTEXT or the config's current context.
export function currentEndpoint(env = process.env): string | null {
  if (env.DOCKER_HOST) return env.DOCKER_HOST;
  const cfgDir = env.DOCKER_CONFIG ? expandHome(env.DOCKER_CONFIG) : join(homedir(), ".docker");
  let name = env.DOCKER_CONTEXT;
  if (!name) {
    try {
      name = JSON.parse(readFileSync(join(cfgDir, "config.json"), "utf8")).currentContext;
    } catch {}
  }
  if (!name || name === "default") return "unix:///var/run/docker.sock";
  try {
    const meta = JSON.parse(readFileSync(join(cfgDir, "contexts", "meta", createHash("sha256").update(name).digest("hex"), "meta.json"), "utf8"));
    return meta?.Endpoints?.docker?.Host ?? null;
  } catch {
    return null;
  }
}

function localSpec(): unknown {
  if (!existsSync(LOCAL_FILE)) return undefined;
  try {
    return (Bun.YAML.parse(readFileSync(LOCAL_FILE, "utf8")) as any)?.runtime;
  } catch (e) {
    throw new RuntimeConfigError(`${LOCAL_FILE}: ${(e as Error).message}`);
  }
}

let active: Runtime | null = null;

export function runtime(): Runtime {
  if (active) return active;
  const sel = selectRuntime({
    envSpec: process.env.COSMOS_RUNTIME,
    localSpec: localSpec(),
    localFile: LOCAL_FILE,
    endpoint: currentEndpoint(),
    providers: providers(),
    exists: existsSync,
    realpath: realpathSync,
  });
  return (active = providers().find((p) => p.id === sel.id)!.create(sel));
}

// for tests
export const resetRuntime = () => void (active = null);

export function runtimeInfo(): RuntimeInfo {
  const { id, label, profile, source, dockerHost, context, hostAlias, extraHosts, watch, ports, caveats } = runtime();
  return { id, label, profile, source, dockerHost, context, hostAlias, extraHosts, watch, ports, caveats };
}

// process env for a docker/compose child: the runtime's DOCKER_HOST, and no DOCKER_CONTEXT to compete with it
export function dockerEnv(base: Record<string, string | undefined> = process.env): Record<string, string | undefined> {
  const host = runtime().dockerHost;
  if (!host) return { ...base };
  const { DOCKER_CONTEXT: _drop, ...rest } = base;
  return { ...rest, DOCKER_HOST: host };
}
