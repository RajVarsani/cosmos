import type { CSSProperties, MouseEvent } from "react";
import { svcC } from "@/domain/palette";
import { EDGE_SVC, edgePortOf, svcHealth, svcKind, svcUrl } from "@/domain/services";
import type { Container, Instance } from "@/domain/types";
import { ago, mib } from "@/lib/format";
import { Spark } from "@/modules/ui/spark";
import { cx } from "@/modules/ui/glass";
import { act } from "@/state/actions";
import { hist } from "@/state/hist";
import { setUi, useUi } from "@/state/ui-store";
import { Cz } from "@/modules/scene/handle";
import grid from "../row-grid.module.css";
import s from "./service-row.module.css";

const TONE: Record<string, string> = { ok: s.ok, go: s.go, bad: s.bad };

// one service; the sheet frame lights it up on hover through data-row
export function ServiceRow({ i, c }: { i: Instance; c: Container }) {
  const sel = useUi((u) => u.sel === c.service);
  const hl = useUi((u) => u.hoverSvc === c.service);
  const init = svcKind(c) === "init", h = svcHealth(c, i), url = svcUrl(c);
  const edgeC = svcKind(c) === "fe" && c === i.containers.find((x) => svcKind(x) === "fe") ? i.containers.find((x) => x.service === EDGE_SVC) : null;
  const edgePort = edgeC ? edgePortOf(i) : null;
  const rs = c.restarts || 0;
  const pick = (e: MouseEvent) => {
    if ((e.target as Element).closest("a,button")) return;
    setUi({ sel: c.service });
    Cz.still();
  };
  return (
    <div className={cx(grid.cols, s.svr, sel && s.sel, hl && s.hl)} data-row={c.service} style={{ "--pc": svcC(c.service) } as CSSProperties} onClick={pick}>
      <span className={s.nm}><i /><b>{c.service}</b>{edgeC && <small>via edge{edgePort ? ` :${edgePort}` : ""}</small>}</span>
      {init ? <span className={s.dead}>one-shot</span>
        : !c.port ? <span className={s.dead}>—</span>
        : c.running && /^https?:/.test(url || "") ? <a href={url!} target="_blank" rel="noopener">:{c.port} ↗</a>
        : <span className={s.dead}>:{c.port}</span>}
      <span className={s.mm}><span><Spark h={hist.get(`${i.name}/${c.service}`) || []} peak={false} /></span><span>{c.running ? mib(c.memMiB) : "—"}</span></span>
      <span className={s.r}>{c.running && c.cpuPct != null ? `${c.cpuPct.toFixed(1)}%` : "—"}</span>
      <span className={cx(s.r, TONE[h.cls])}>{h.text}</span>
      <span className={s.r}>{c.running ? ago(c.startedAt) : "—"}</span>
      <span className={cx(s.r, rs > 0 && s.hot)}>{rs}</span>
      <button className={s.lg} type="button" disabled={!c.container} onClick={() => act("logs", i.name, c.service)}>logs</button>
    </div>
  );
}
