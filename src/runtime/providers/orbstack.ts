import { homedir } from "os";
import { join } from "path";
import { containerMeminfo } from "../meminfo";
import type { Provider } from "../types";

export const orbstack: Provider = {
  id: "orbstack",
  sockets: () => [join(homedir(), ".orbstack", "run", "docker.sock")],
  profileOf: () => null,
  create: (sel) => ({
    id: "orbstack",
    label: "OrbStack",
    profile: null,
    source: sel.source,
    dockerHost: sel.endpoint,
    context: "orbstack",
    // OrbStack resolves host.docker.internal (and host.orb.internal) itself
    hostAlias: "host.docker.internal",
    extraHosts: [],
    watch: "events",
    ports: "native",
    caveats: ["the VM's memory grows on demand up to OrbStack's limit, so available memory reads lower than the limit until it is used"],
    startHint: "start OrbStack (orb start, or open -a OrbStack), then rerun",
    memoryFix: "OrbStack > Settings > System > Memory limit: raise it (16 GiB runs every profile)",
    cpuFix: "OrbStack > Settings > System > CPU limit",
    hostPath: (p) => p,
    vmMemory: containerMeminfo,
    doctor: async () => [],
  }),
};
