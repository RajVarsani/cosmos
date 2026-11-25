import type { CSSProperties } from "react";
import { svcHealth, svcUrl } from "@/domain/services";
import { lbl } from "@/domain/states";
import { svcC } from "@/domain/palette";
import type { Container, Instance } from "@/domain/types";
import { mib } from "@/lib/format";
import { logsOnly, setLogs } from "@/modules/sheet/logs/logs-store";
import { IconButton } from "@/modules/ui/icon-button";
import { IconLogs } from "@/modules/ui/icons";
import { Spark } from "@/modules/ui/spark";
import { focusPlanet, sheetOpen } from "@/state/actions";
import { HIST, hist } from "@/state/hist";
import { OpenCopy } from "../bar-actions/open-copy";
import { ActsFrame } from "../bar-actions/frame";
import { BarMem } from "../bar-mem";
import { SystemId } from "../system-id";
import { MetaEm } from "../system-id/meta-em";
import s from "./planet-bar.module.css";

// the bar when a planet is focused: its health, memory trail and the same actions
export function PlanetBar({ i, c }: { i: Instance; c: Container }) {
  const h = svcHealth(c, i), url = svcUrl(c), web = c.running && /^https?:/.test(url || "");
  const k = `${i.name}/${c.service}`, col = svcC(c.service);
  const logs = () => { setLogs({ all: false }); logsOnly(k); sheetOpen("lines"); };
  return (
    <>
      <SystemId cls={h.cls} dotTitle={h.text} name={c.service} color={col}>
        {`${lbl(i)}${c.port ? ` · :${c.port}` : ""} · `}
        <MetaEm err={h.cls === "bad"} style={h.cls === "ok" ? { color: "var(--ok-tx)" } : undefined}>{h.text}</MetaEm>
        {c.restarts ? ` · ${c.restarts} restart${c.restarts === 1 ? "" : "s"}` : ""}
      </SystemId>
      <div className={s.spk} style={{ "--pc": col } as CSSProperties} title={`memory, last ${HIST} polls`}><Spark h={hist.get(k) || []} /></div>
      <BarMem>{c.running ? `${mib(c.memMiB)}${c.cpuPct != null ? ` · ${c.cpuPct.toFixed(1)}%` : ""}` : c.status}</BarMem>
      <ActsFrame
        lead={<>
          <OpenCopy url={url} open={!!web} />
          <IconButton disabled={!c.container} title="Logs  (L)" aria-label="logs" onClick={logs}><IconLogs /></IconButton>
        </>}
        back={{ title: `Back to ${lbl(i)}  (Esc)`, label: "back to system", onClick: () => focusPlanet(null) }}
      />
    </>
  );
}
