import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { logsAtBottom, logsBuf, useLogs } from "../logs-store";
import { colorOf, tagOf } from "../src-color";
import { LineRow } from "./line-row";
import s from "./lines.module.css";

export function Lines() {
  const view = useLogs((l) => l.view);
  const sel = useLogs((l) => l.sel);
  const wrap = useLogs((l) => l.wrap);
  const q = useLogs((l) => l.q);
  useLogs((l) => l.rev);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const { follow, paused } = useLogs.getState();
    if (ref.current && follow && !paused) ref.current.scrollTop = ref.current.scrollHeight;
  }, [view]);
  const info = useMemo(() => new Map(sel.map((k) => [k, { tag: tagOf(sel, k), color: colorOf(sel, k) }])), [sel]);
  const tagw = Math.min(24, Math.max(6, ...sel.map((k) => tagOf(sel, k).length), 0)) + 1;
  const style = { "--tagw": `${tagw}ch`, "--ws": wrap ? "pre-wrap" : "pre" } as CSSProperties;
  return (
    <div
      ref={ref}
      id="lines"
      className={s.lines}
      style={style}
      onScroll={(e) => { const b = e.currentTarget; logsAtBottom(b.scrollHeight - b.scrollTop - b.clientHeight < 24); }}
    >
      {!sel.length
        ? <div className={s.empty}>pick one or more sources<br /><span>their lines merge here by time, tagged by source</span></div>
        : !view.length
          ? <div className={s.empty}>{logsBuf().length ? "no lines match the filter" : "waiting for lines"}</div>
          : view.map((x) => {
              const i = info.get(x.key);
              return <LineRow key={x.id} x={x} q={q} tag={i ? i.tag : tagOf(sel, x.key)} color={i ? i.color : colorOf(sel, x.key)} />;
            })}
    </div>
  );
}
