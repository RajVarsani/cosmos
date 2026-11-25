import { svcHealth } from "@/domain/services";
import type { Container, Instance } from "@/domain/types";
import { setLogs, useLogs } from "../../logs-store";
import { SourceRow } from "../source-row";
import s from "./band.module.css";

export function Band({ i, k, title, list }: { i: Instance; k: string; title: string; list: Container[] }) {
  const key = `${i.name}:${k}`;
  const forced = useLogs((l) => list.some((c) => l.sel.includes(`${i.name}/${c.service}`)));
  const inOpen = useLogs((l) => !!l.infraOpen[key]);
  const isOpen = k !== "infra" || inOpen || forced;
  const up = list.filter((c) => svcHealth(c, i).cls === "ok").length;
  return (
    <details
      className={s.band}
      open={isOpen}
      onToggle={(e) => {
        const o = (e.currentTarget as HTMLDetailsElement).open, cur = useLogs.getState().infraOpen;
        if (o === !!cur[key]) return;
        const next = { ...cur };
        if (o) next[key] = true; else delete next[key];
        setLogs({ infraOpen: next });
      }}
    >
      <summary><span>{title}</span><span className={s.n}>{up}/{list.length}</span></summary>
      {list.map((c) => <SourceRow key={c.service} i={i} c={c} />)}
    </details>
  );
}
