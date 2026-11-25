import { hash } from "@/lib/hash";
import { bk, svcC } from "@/domain/palette";
import { BAD, TRANSIT, lbl } from "@/domain/states";
import { EDGE_SVC, edgePortOf, runCount, svcHealth, svcKind } from "@/domain/services";
import { lifeOf, svcPhase } from "@/domain/life";
import type { Overview } from "@/domain/types";
import { births } from "@/state/births";
import { GOLDEN, GX, SAT_R, laneLayout, layouts, reachOf, seatOf, type Seat } from "./layout";

// the galaxy as plain data: console = black hole, instances = star systems on log-spiral arms; the engine draws it
const sysPos = new Map<string, Seat>();
let nextSeat: (Seat & { slot: number }) | null = null;

export function galaxyModel(d: Overview) {
  const systems = d.instances.map((i) => {
    const b = bk(i.backend);
    const cs = i.containers;
    const fe = cs.filter((c) => svcKind(c) === "fe"), be = cs.filter((c) => svcKind(c) === "app" && c.service !== EDGE_SVC), infra = cs.filter((c) => ["infra", "init"].includes(svcKind(c)));
    const edgeC = cs.find((c) => c.service === EDGE_SVC);
    const remote = i.backend !== "local";
    const planets: any[] = [];
    // radius grows with the square root of memory, clamped, and snapped to 0.05 so orbits only move on a real change
    const sizeOf = (c: (typeof cs)[number]) => (c.running && c.memMiB ? Math.round(Math.min(2.1, Math.max(0.75, 0.7 + 0.45 * Math.sqrt(c.memMiB / 256))) * 20) / 20 : 0.75);
    for (const [list, kind] of [[fe, "fe"], [be, "app"]] as const) for (const c of list) {
      const h = svcHealth(c, i);
      planets.push({
        svc: c.service, kind, c: svcC(c.service), size: sizeOf(c),
        running: c.running, ok: h.cls === "ok", status: h.text, mem: c.memMiB, port: c.port, cpu: c.cpuPct || 0, phase: svcPhase(c, i),
        sat: kind === "fe" && remote ? { col: bk(i.backend).c, name: i.backend, edgePort: edgeC ? edgePortOf(i) : null, r: SAT_R } : null,
      });
    }
    for (const p of planets) p.reach = reachOf(p.svc, p.size, p.sat);
    const { lane, edge } = laneLayout(i.name, planets);
    // golden-angle phases on one rigid rotation: no two bodies share a track or ever line up radially
    const ph0 = (hash(i.name) % 6283) / 1000;
    for (const p of planets) { const l = lane.get(p.svc)!; p.orbit = l.orbit; p.ph = ph0 + l.idx * GOLDEN; }
    planets.sort((x, y) => x.orbit - y.orbit);
    const edge0 = planets.length ? edge : 4;
    const ext = Math.max(edge0 + (infra.length ? 7 : 2.5), 12);
    const beltR = infra.length ? [edge0 + 2.2, edge0 + 6.2] : null;
    const infraUp = infra.filter((c) => (svcKind(c) === "init" ? c.status === "exited" && c.exitCode === 0 : c.running)).length;
    const st = i.state === "running" ? "ok" : TRANSIT.has(i.state) || i.state === "partial" ? "go" : BAD.has(i.state) ? "bad" : "off";
    const run = runCount(i);
    const probe = st === "off" ? null : Math.max(0, ...cs.map((c) => (c.http && c.http.at) || 0)) || (d.statsAt ?? null);
    return {
      name: i.name, label: lbl(i), backend: i.backend, slot: i.slot, state: i.state, st, shared: !!i.share, shareState: i.share?.state ?? null,
      col: st === "off" ? "#8c8580" : st === "bad" ? "#ff5b7a" : b.c, coreCol: st === "off" ? "#b8b1ab" : b.core, baseCol: b.c,
      sr: 2.4 * b.star, guard: !!b.guard, ext, gext: Math.min(ext, GX.FOOT), k: Math.min(1, GX.FOOT / ext), planets,
      w: 0.07 * (1 + Math.min(1.5, Math.max(0, ...planets.map((p) => p.cpu)) / 80)),
      belt: infra.length ? { r0: beltR![0], r1: beltR![1], n: 90 + infra.length * 40, up: infraUp / infra.length, count: infra.length } : null,
      progress: st === "go" && run.of > 1 ? `${run.up}/${run.of}` : null,
      probe, bornAt: births.get(i.name) || 0, life: lifeOf(i, d),
      pos: null as unknown as Seat,
    };
  });
  // seats: a placed system never moves; a newcomer's footprint is reserved at full size so its growth cannot crowd a neighbour
  const live = new Set(d.instances.map((i) => i.name));
  for (const k of sysPos.keys()) if (!live.has(k)) sysPos.delete(k);
  const fixed = () => [...sysPos.values()];
  for (const s of systems) {
    const cur = sysPos.get(s.name);
    if (cur) { s.pos = cur; continue; }
    const nx = nextSeat && nextSeat.slot === s.slot ? nextSeat : null;
    const seat = nx && fixed().every((f) => Math.hypot(nx.x - f.x, nx.z - f.z) >= 36 + f.e + GX.PAD) ? { ...nx, e: 36 } : seatOf(s.name, s.slot, 36, fixed());
    sysPos.set(s.name, seat);
    s.pos = seat;
  }
  for (const s of systems) { const q = sysPos.get(s.name)!; if (s.gext > q.e) q.e = s.gext; }
  let next: (Seat & { slot: number }) | null = null;
  if (d.nextSlot != null) {
    if (!nextSeat || nextSeat.slot !== d.nextSlot || !fixed().every((f) => Math.hypot(nextSeat!.x - f.x, nextSeat!.z - f.z) >= 36 + f.e + GX.PAD)) nextSeat = { slot: d.nextSlot, ...seatOf(`slot${d.nextSlot}`, d.nextSlot, 36, fixed()) };
    next = nextSeat;
  }
  // bounds for the home camera: always centred on the core, radius reaches the farthest system
  const pts: [number, number, number][] = [[0, 0, GX.DISK_OUT + 10], ...systems.map((s): [number, number, number] => [s.pos.x, s.pos.z, s.gext + 16])];
  if (next) pts.push([next.x, next.z, 20]);
  const R = Math.max(...pts.map(([x, z, e]) => Math.hypot(x, z) + e));
  const p0 = d.pending && d.pending[0];
  const gone = (d.jobs || []).filter((j) => j.target && !live.has(j.target) && j.endedAt && Date.now() - Date.parse(j.endedAt) < 60000)
    .map((j) => ({ name: j.target!, fail: j.ok === false, error: j.error || null, kind: j.kind }));
  for (const k of layouts.keys()) if (!live.has(k)) layouts.delete(k);
  return {
    systems, bound: { R }, gone, pending: (d.pending || []).map((p) => p.id), live: (d.jobs || []).filter((j) => !j.endedAt).map((j) => j.id),
    next: next ? { slot: next.slot, pos: { x: next.x, y: 0, z: next.z }, pending: p0 ? p0.target || `${p0.backend}-${next.slot}` : null, col: p0 ? bk(p0.backend).c : "#ffffff" } : null,
    core: { port: d.dashboard?.port ?? 20000, pid: d.dashboard?.pid ?? null },
  };
}
export type GalaxyModel = ReturnType<typeof galaxyModel>;
export type SystemModel = GalaxyModel["systems"][number];
