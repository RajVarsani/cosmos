import { AnimatePresence } from "motion/react";
import { useState } from "react";
import type { SourceView } from "@/domain/types";
import { short, tilde } from "@/lib/format";
import { Chip } from "@/modules/ui/chip";
import { BranchPicker } from "@/modules/sheet/branch-picker";
import { switchSource } from "@/state/actions";
import s from "./source-row.module.css";

const dirLine = (r: SourceView) =>
  r.own ? tilde(r.dir) : r.live ? `live: ${tilde(r.dir)}${r.shared.length ? ` · also ${r.shared.join(", ")}` : ""}` : `${tilde(r.dir)} · shared, own worktree on next start`;

export function SourceRow({ name, r, busy }: { name: string; r: SourceView; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = r.branch ?? "detached";
  return (
    <div className={s.row}>
      <span className={s.svc}>{r.svc}</span>
      <span className={s.ref} title={r.sha ?? ""}>
        <b>{ref}</b> {short(r.sha, 8)}
        {r.atPin && <i className={s.tag}>pin</i>}
        {!!r.dirty && <i className={s.warn}>{r.dirty} changed</i>}
        {r.live && <i className={s.live}>live</i>}
        {!!r.ahead && <i className={s.tag}>ahead {r.ahead}</i>}
        {!!r.behind && <i className={s.warn}>behind {r.behind}</i>}
      </span>
      <Chip className={s.btn} aria-expanded={open} disabled={busy} onClick={() => setOpen((o) => !o)}>{open ? "close" : "switch"}</Chip>
      <span className={s.dir} title={r.dir}>{dirLine(r)}</span>
      <AnimatePresence initial={false}>
        {open && <BranchPicker key="p" svc={r.svc} current={r.branch} onPick={(ref, live) => switchSource(name, r.svc, ref, live)} onDone={() => setOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
