import { homedir } from "os";
import { join } from "path";
import { containerMeminfo } from "../meminfo";
import type { Provider } from "../types";

export const dockerDesktop: Provider = {
  id: "docker-desktop",
  // /var/run/docker.sock is Docker Desktop's symlink to the first when "allow the default socket" is on
  sockets: () => [join(homedir(), ".docker", "run", "docker.sock")],
  profileOf: () => null,
  create: (sel) => ({
    id: "docker-desktop",
    label: "Docker Desktop",
    profile: null,
    source: sel.source,
    dockerHost: sel.endpoint,
    context: "desktop-linux",
    hostAlias: "host.docker.internal",
    extraHosts: [],
    watch: "events",
    ports: "native",
    caveats: [],
    startHint: "start Docker Desktop (open -a Docker), wait until it is ready, then rerun",
    memoryFix: "Docker Desktop > Settings > Resources > Memory: raise it (16 GiB runs every profile)",
    cpuFix: "Docker Desktop > Settings > Resources > CPUs",
    // Docker Desktop reports bind sources as /host_mnt/<host path>
    hostPath: (p) => p.replace(/^\/host_mnt(?=\/)/, ""),
    vmMemory: containerMeminfo,
    doctor: async () => [],
  }),
};
