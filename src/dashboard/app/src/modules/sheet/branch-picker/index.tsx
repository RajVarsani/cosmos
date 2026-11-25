import { motion } from "motion/react";
import { useState, type KeyboardEvent } from "react";
import type { RefView } from "@/domain/types";
import { short } from "@/lib/format";
import { T, overlay } from "@/lib/motion/spec";
import { TextInput } from "@/modules/sheet/chooser/text-input";
import { useRefs } from "./use-refs";
import s from "./branch-picker.module.css";

const MAX = 40;

const where = (x: RefView) =>
  x.clone ? `held by your clone, runs a copy` : x.heldBy ? (x.live ? `live from ${x.heldBy}` : `in ${x.heldBy}, runs detached`) : x.local ? "local" : "origin";

// filter the service's branches; arrows highlight, enter takes the highlighted item, else the typed text; null ref is galaxy's pin.
// live: a branch the galaxy clone holds mounts the clone instead of a copy. A div, not a form: it also sits inside the chooser's launch form.
export function BranchPicker({ svc, current, onPick, onDone }: { svc: string; current: string | null; onPick: (ref: string | null, live: boolean) => void; onDone: () => void }) {
  const { data, error } = useRefs(svc);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(-1);
  const pick = (ref: string | null, live = false) => { onDone(); onPick(ref, live); };
  const needle = q.trim().toLowerCase();
  const refs = (data?.refs ?? []).filter((x) => !needle || x.name.toLowerCase().includes(needle));
  const shown = refs.slice(0, MAX);
  const enter = () => {
    if (hi === 0) return pick(null);
    if (hi > 0 && shown[hi - 1]) return pick(shown[hi - 1].name);
    if (!needle) return;
    const exact = refs.find((x) => x.name.toLowerCase() === needle);
    pick(exact ? exact.name : q.trim());
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") onDone();
    else if (e.key === "Enter") {
      e.preventDefault();
      enter();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(-1, Math.min(shown.length, h + (e.key === "ArrowDown" ? 1 : -1))));
    }
  };
  const mark = (i: number) => (i === hi ? { "data-hi": true, ref: (el: HTMLButtonElement | null) => el?.scrollIntoView({ block: "nearest" }) } : {});
  return (
    <motion.div className={s.pick} role="group" aria-label={`${svc} ref`} {...overlay} transition={T.base}>
      <TextInput autoFocus value={q} placeholder="branch, tag or sha" aria-label={`${svc} ref`} onChange={(e) => { setQ(e.target.value); setHi(-1); }} onKeyDown={onKey} />
      <div className={s.list} role="listbox" aria-label={`${svc} branches`}>
        <button type="button" className={s.item} onClick={() => pick(null)} {...mark(0)}>
          <b>pinned</b><span>galaxy's commit {short(data?.pinned, 8)}</span>
        </button>
        {shown.map((x, i) => (
          <div key={x.name} className={s.row}>
            <button type="button" className={s.item} data-live={x.live || undefined} aria-current={x.name === current || undefined} onClick={() => pick(x.name)} title={x.subject} {...mark(i + 1)}>
              <b>{x.name}</b>
              <span>{where(x)} · {x.date.slice(0, 10)}</span>
            </button>
            {x.clone && <button type="button" className={s.live} title={`mount ${x.heldBy} live: its uncommitted edits run, and the containers write into it`} onClick={() => pick(x.name, true)}>live</button>}
          </div>
        ))}
        {!data && !error && <p className={s.note}>reading branches</p>}
        {error && <p className={s.note}>{error.message}</p>}
        {data && refs.length > MAX && <p className={s.note}>{refs.length - MAX} more, type to narrow</p>}
        {data?.warning && <p className={s.note}>{data.warning}</p>}
      </div>
    </motion.div>
  );
}
