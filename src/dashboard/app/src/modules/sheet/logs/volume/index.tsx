import { useMemo } from "react";
import { useNow } from "@/lib/use-now";
import { useUi } from "@/state/ui-store";
import { logsBuf, useLogs } from "../logs-store";
import { volumeBins } from "./bins";
import s from "./volume.module.css";

export function Volume() {
  const open = useUi((u) => u.logs);
  const counts = useLogs((l) => l.counts);
  const now = useNow(open ? 1000 : 60000);
  const v = useMemo(() => volumeBins(logsBuf(), Date.now()), [counts, now]);
  return (
    <div className={s.vol} id="lg-vol">
      <svg viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true">
        {v.bars.map((b, k) => <rect key={k} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.fill} />)}
      </svg>
      <span>{v.tot === v.all ? `${v.tot} line${v.tot === 1 ? "" : "s"}` : `${v.tot} of ${v.all}`} · last {v.spanT}</span>
    </div>
  );
}
