// A container runtime cosmos drives through the docker CLI: where the engine is, how containers reach the host,
// how the VM's memory is read, and what to check. One provider per runtime in ./providers.
import type { Check } from "../api";
import type { VmMem } from "../docker";

export const RUNTIME_IDS = ["docker-desktop", "colima", "orbstack"] as const;
export type RuntimeId = (typeof RUNTIME_IDS)[number];

// how the runtime was picked
export type RuntimeSource = "COSMOS_RUNTIME" | "cosmos.local.yaml" | "docker context" | "socket" | "fallback";

export type Selection = { id: RuntimeId; profile: string | null; source: RuntimeSource; endpoint: string | null };

// What every docker and compose call runs against.
export type RuntimeInfo = {
  id: RuntimeId;
  label: string;
  profile: string | null;
  source: RuntimeSource;
  // unix:///...; passed as DOCKER_HOST to every docker/compose call, never via the global docker context.
  // null only when no engine socket was found (the docker CLI then uses its own default and fails as before)
  dockerHost: string | null;
  // the docker context this runtime registers, for humans (cosmos never switches it)
  context: string;
  // the name a container uses to reach the host
  hostAlias: string;
  // compose extra_hosts cosmos adds to every service (empty when the runtime resolves hostAlias itself)
  extraHosts: string[];
  // file events from host edits reach containers ("events"), or watchers must poll
  watch: "events" | "poll";
  // published 127.0.0.1 ports on the host: the engine's own listener, or a forwarder that lags container start
  ports: "native" | "forwarded";
  caveats: string[];
};

export interface Runtime extends RuntimeInfo {
  startHint: string;
  memoryFix: string;
  cpuFix: string;
  // a bind source as the engine reports it -> the host path
  hostPath(p: string): string;
  // the engine VM's /proc/meminfo
  vmMemory(): Promise<VmMem | { error: string }>;
  // runtime-specific checks after the generic docker ones
  doctor(): Promise<Check[]>;
}

// A provider knows its sockets and builds the Runtime for a selection.
export interface Provider {
  id: RuntimeId;
  // candidate engine sockets, most likely first; profile narrows them where the runtime has profiles
  sockets(profile: string | null): string[];
  // the profile a socket path belongs to (colima: ~/.colima/<profile>/docker.sock), or null
  profileOf(socket: string): string | null;
  create(sel: Selection): Runtime;
}
