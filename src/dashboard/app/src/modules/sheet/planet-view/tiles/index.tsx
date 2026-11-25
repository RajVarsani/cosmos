import { svcHealth } from "@/domain/services";
import type { Container, Instance } from "@/domain/types";
import { ago, mib } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { hist } from "@/state/hist";
import { Tile } from "./tile";
import s from "./tiles.module.css";

export function Tiles({ i, c }: { i: Instance; c: Container }) {
  useNow(1000);
  const h = svcHealth(c, i), pr = c.probe || {};
  return (
    <div className={s.tiles}>
      <Tile label="memory" value={c.running ? mib(c.memMiB) : "—"} spark={hist.get(`${i.name}/${c.service}`) || []} />
      <Tile label="cpu" value={c.running && c.cpuPct != null ? `${c.cpuPct.toFixed(1)}%` : "—"} />
      <Tile label="check" value={h.text} sub={pr.kind ? `${pr.kind}${pr.path ? ` ${pr.path}` : ""}` : ""} tone={h.cls} />
      <Tile label="up" value={c.running ? ago(c.startedAt) : "—"} sub={c.running ? "since start" : c.status} />
      <Tile label="restarts" value={String(c.restarts || 0)} sub={c.oomKilled ? "oom killed" : c.exitCode ? `last exit ${c.exitCode}` : ""} tone={c.restarts ? "hot" : ""} />
      <Tile label="errors" value={c.errors ? String(c.errors.count) : "—"} sub={c.errors ? `last ${c.errors.windowMin} min of logs` : ""} tone={c.errors && c.errors.count ? "hot" : ""} />
    </div>
  );
}
