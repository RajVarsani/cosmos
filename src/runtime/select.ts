// Picks the runtime: COSMOS_RUNTIME, else `runtime:` in cosmos.local.yaml, else the engine the docker context points
// at, else the first runtime whose socket exists. Pure apart from the injected fs probes, so it is unit tested.
import { RUNTIME_IDS, type Provider, type RuntimeId, type Selection } from "./types";

export class RuntimeConfigError extends Error {}

// "colima", "colima:cosmos-test", or { name, profile } from cosmos.local.yaml
export function parseRuntimeSpec(raw: unknown, where: string): { id: RuntimeId; profile: string | null } | null {
  if (raw === undefined || raw === null || raw === "" || raw === "auto") return null;
  let name: unknown, profile: unknown;
  if (typeof raw === "string") [name, profile] = raw.trim().split(":", 2);
  else if (typeof raw === "object") ({ name, profile } = raw as { name?: unknown; profile?: unknown });
  if (typeof name !== "string" || !(RUNTIME_IDS as readonly string[]).includes(name)) {
    throw new RuntimeConfigError(`${where}: runtime must be one of ${RUNTIME_IDS.join(", ")} (or auto), optionally <runtime>:<profile>; got ${JSON.stringify(raw)}`);
  }
  if (profile !== undefined && profile !== "" && (typeof profile !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile))) {
    throw new RuntimeConfigError(`${where}: bad runtime profile ${JSON.stringify(profile)}`);
  }
  return { id: name as RuntimeId, profile: (profile as string) || null };
}

export type SelectInput = {
  envSpec?: string;
  localSpec?: unknown;
  localFile?: string;
  // the engine the docker CLI would use now: DOCKER_HOST, else the current context's endpoint
  endpoint: string | null;
  providers: Provider[];
  exists: (path: string) => boolean;
  realpath: (path: string) => string;
};

const sockPath = (endpoint: string | null) => (endpoint?.startsWith("unix://") ? endpoint.slice(7) : null);

export function selectRuntime(i: SelectInput): Selection {
  const byId = (id: RuntimeId) => i.providers.find((p) => p.id === id)!;
  const real = (p: string) => {
    try {
      return i.realpath(p);
    } catch {
      return p;
    }
  };
  const cur = sockPath(i.endpoint);
  const curReal = cur ? real(cur) : null;
  // which provider (and profile) owns the current endpoint
  const owner = (): { id: RuntimeId; profile: string | null } | null => {
    if (!curReal) return null;
    for (const p of i.providers) {
      const prof = p.profileOf(cur!) ?? p.profileOf(curReal);
      if (prof !== null) return { id: p.id, profile: prof };
      if (p.sockets(null).some((s) => real(s) === curReal)) return { id: p.id, profile: null };
    }
    return null;
  };

  const explicit = (spec: { id: RuntimeId; profile: string | null }, source: Selection["source"]): Selection => {
    const o = owner();
    // the context already points at this runtime: keep its endpoint (and colima profile) unless a profile was named
    if (o && o.id === spec.id && (spec.profile === null || spec.profile === o.profile)) return { id: spec.id, profile: o.profile ?? spec.profile, source, endpoint: i.endpoint };
    const live = byId(spec.id).sockets(spec.profile).find(i.exists) ?? null;
    const profile = spec.profile ?? (live ? byId(spec.id).profileOf(live) : null);
    return { id: spec.id, profile, source, endpoint: live ? `unix://${live}` : null };
  };

  const env = parseRuntimeSpec(i.envSpec, "COSMOS_RUNTIME");
  if (env) return explicit(env, "COSMOS_RUNTIME");
  const local = parseRuntimeSpec(i.localSpec, i.localFile ?? "cosmos.local.yaml");
  if (local) return explicit(local, "cosmos.local.yaml");

  const o = owner();
  if (o) return { ...o, source: "docker context", endpoint: i.endpoint };
  for (const p of i.providers) {
    const live = p.sockets(null).find(i.exists);
    if (live) return { id: p.id, profile: p.profileOf(live), source: "socket", endpoint: `unix://${live}` };
  }
  // nothing found: today's behaviour (Docker Desktop), on whatever endpoint the CLI has
  return { id: "docker-desktop", profile: null, source: "fallback", endpoint: i.endpoint };
}
