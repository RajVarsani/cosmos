import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { Chip } from "@/modules/ui/chip";
import { BranchPicker } from "@/modules/sheet/branch-picker";
import { setUi, useUi } from "@/state/ui-store";
import s from "./branch-row.module.css";

const setBranch = (svc: string, ref: string | null, live: boolean) =>
  setUi((st) => {
    const { [svc]: _, ...rest } = st.form.branches;
    const others = st.form.live.filter((x) => x !== svc);
    return { form: { ...st.form, branches: ref === null ? rest : { ...rest, [svc]: ref }, live: live && ref !== null ? [...others, svc] : others } };
  });

export function BranchRow({ svc }: { svc: string }) {
  const ref = useUi((st) => st.form.branches[svc] ?? null);
  const live = useUi((st) => st.form.live.includes(svc));
  const [open, setOpen] = useState(false);
  return (
    <div className={s.row}>
      <span className={s.svc}>{svc}</span>
      <span className={s.ref} data-set={ref !== null || undefined}>{ref ?? "pinned"}{live && <i className={s.live}> live</i>}</span>
      <Chip className={s.btn} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "close" : "change"}</Chip>
      <AnimatePresence initial={false}>
        {open && <BranchPicker key="p" svc={svc} current={ref} onPick={(r, l) => setBranch(svc, r, l)} onDone={() => setOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
