import { motion } from "motion/react";
import { gib } from "@/lib/format";
import { T, overlay } from "@/lib/motion/spec";
import type { Memory } from "../use-memory";
import s from "./popover.module.css";

const Row = ({ k, v }: { k: string; v: string }) => <div className={s.row}><span>{k}</span><b>{v}</b></div>;

export function MemoryPopover({ m }: { m: Memory }) {
  return (
    <motion.div className={s.tip} id="g-tip" role="region" aria-label="Docker VM memory" {...overlay} transition={T.base}>
      {m.state !== "ok" ? <span className={s.gh}>{m.state === "unreadable" ? "vm unreadable" : "measuring"}</span> : (
        <>
          <span className={s.gh}>{gib(m.v.availableMiB)} free of {gib(m.v.totalMiB)}</span>
          <div className={s.gb}><i style={{ width: `${m.pct.toFixed(1)}%` }} /></div>
          <Row k="used" v={gib(m.used)} />
          {m.per.length > 0 && <><hr />{m.per.map(([k, v]) => <Row key={k} k={k} v={gib(v)} />)}<Row k="instances" v={gib(m.per.reduce((a, x) => a + x[1], 0))} /></>}
          {m.floor != null && <><hr /><Row k="build floor" v={gib(m.floor)} /><small>builds need at least this much free VM memory to start</small></>}
        </>
      )}
    </motion.div>
  );
}
