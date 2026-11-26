import type { Row, Snapshot, Source, SvcRow } from "../types";

// hidden `cosmos top --demo`: fake instances to see the TUI without a project or docker
const svc = (service: string, kind: string, port: number, running: boolean, memMiB: number): SvcRow =>
  ({ service, kind, port, url: `http://localhost:${port}`, status: running ? "running" : "exited", running, healthy: running, memMiB: running ? memMiB : null });

function row(name: string, slot: number, backend: string, profile: string, state: string, mem: number[], share: Row["share"] = null): Row {
  const base = 20000 + 100 * slot;
  const on = state !== "stopped" && state !== "exited";
  const services = [svc("web", "fe", base + 1, on, mem[0]), svc("api", "app", base + 2, on && state !== "partial", mem[1]), svc("db", "infra", base + 3, on, mem[2])];
  const up = services.filter((s) => s.running).length;
  return {
    name, label: name, slot, profile, backend, mode: backend === "local" ? "local" : "edge", state, up, of: 3,
    memMiB: services.reduce((n, s) => n + (s.memMiB ?? 0), 0) || null, mainService: "web", url: `http://localhost:${base + 1}`, services, share, warnings: [],
  };
}

export function demoSource(): Source {
  let rows: Row[] = [
    row("vega", 1, "local", "full", "running", [412, 830, 296], { url: "https://vega-demo.shares.zrok.io", state: "live", reason: null, public: true, user: null, fe: "web" }),
    row("altair", 2, "remote", "frontend", "booting", [188, 0, 0]),
    row("deneb", 3, "local", "full", "partial", [390, 0, 301]),
    row("sirius", 4, "local", "full", "stopped", []),
  ];
  const subs = new Set<(s: Snapshot) => void>();
  const snap = (): Snapshot => ({ project: "demo", rows, at: Date.now(), error: null });
  const emit = () => { const s = snap(); for (const f of subs) f(s); };
  const patch = (name: string, f: (r: Row) => Row) => { rows = rows.map((r) => (r.name === name ? f(r) : r)); emit(); };
  const tick = setInterval(() => patch("altair", (r) => (r.state === "booting" ? { ...r, state: "running" } : r)), 6000);

  return {
    subscribe(cb) {
      subs.add(cb);
      cb(snap());
      return () => void subs.delete(cb);
    },
    async act(action, name) {
      await Bun.sleep(900);
      if (action === "down") patch(name, (r) => row(r.name, r.slot, r.backend, r.profile, "stopped", []));
      else patch(name, (r) => ({ ...r, share: action === "unshare" ? null : { url: `https://${name}-demo.shares.zrok.io`, state: "live", reason: null, public: true, user: null, fe: r.mainService } }));
      return `${name} ${action === "down" ? "stopped" : `${action}d`}`;
    },
    logs(name, service, onLines) {
      let n = 0;
      const t = setInterval(() => onLines([{ text: `${new Date().toISOString().slice(11, 19)} ${name}/${service} line ${++n}`, err: n % 11 === 0 }]), 400);
      return () => clearInterval(t);
    },
    close() {
      clearInterval(tick);
      subs.clear();
    },
  };
}
