import { useLayoutEffect, useRef } from "react";
import { clockMs } from "@/lib/format";
import { hasStream, logsOnly, logsTail, setLogs, useLogs } from "@/modules/sheet/logs/logs-store";
import { Cap } from "@/modules/ui/cap";
import { Chip } from "@/modules/ui/chip";
import { sheetOpen } from "@/state/actions";
import s from "./tail.module.css";

const LV: Record<string, string> = { error: s.lvError, warn: s.lvWarn, sys: s.lvSys };

// the last lines of this service, from the same buffer as the logs tab; sticks to the bottom
export function Tail({ k }: { k: string }) {
  const rev = useLogs((l) => l.rev);
  const box = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const ls = logsTail(k, 40);
  useLayoutEffect(() => {
    const el = box.current;
    if (el && atEnd.current) el.scrollTop = el.scrollHeight;
  }, [rev, k]);
  const onScroll = () => {
    const el = box.current;
    if (el) atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
  };
  return (
    <aside className={s.tail}>
      <Cap className={s.hd}>Latest lines<Chip className={s.open} onClick={() => { setLogs({ all: false }); logsOnly(k); sheetOpen("lines"); }}>open in logs</Chip></Cap>
      <div className={s.lines} ref={box} onScroll={onScroll}>
        {ls.length
          ? ls.map((x, n) => <div key={`${x.t}:${n}`} className={LV[x.lv]}><span>{clockMs(x.t).slice(0, 8)}</span>{x.text}</div>)
          : <div className={s.none}>{hasStream(k) ? "waiting for lines" : "no stream"}</div>}
      </div>
    </aside>
  );
}
