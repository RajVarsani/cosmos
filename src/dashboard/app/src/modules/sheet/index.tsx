import { motion } from "motion/react";
import { T } from "@/lib/motion/spec";
import { cx, glass } from "@/modules/ui/glass";
import { hlSvc } from "@/state/actions";
import { narrow, sheetPx } from "@/state/sheet-size";
import { useUi } from "@/state/ui-store";
import { Chooser } from "./chooser";
import { Grip } from "./grip";
import { SheetHeader } from "./header";
import { LogsBody } from "./logs";
import { SystemPanel } from "./overview";
import { SystemBar } from "./system-bar";
import s from "./sheet.module.css";

// a slim bar for the focused system that expands into overview / logs / activity, or the create chooser
export function Sheet() {
  const logs = useUi((u) => u.logs);
  const focus = useUi((u) => !!u.focus);
  const tab = useUi((u) => u.tab);
  const sizing = useUi((u) => u.sizing);
  useUi((u) => u.sheetD + u.sheetH);
  const on = logs || focus, mini = !logs && focus;
  // off-screen by its own height plus both margins, as translateY(calc(100% + 2 * var(--m))) did
  const off = sheetPx() + 2 * (narrow() ? 8 : 12);
  return (
    <motion.section
      className={cx(s.sheet, glass, mini && s.mini, sizing && s.sizing)} id="sheet" aria-label="system"
      data-tab={tab} data-mini={mini ? "" : undefined} data-focus={focus ? "" : undefined} data-on={on ? "" : undefined}
      initial={false}
      animate={on ? { y: 0, visibility: "visible" } : { y: off, transitionEnd: { visibility: "hidden" } }}
      transition={T.sheet}
      onPointerOver={(e) => { const r = (e.target as Element).closest<HTMLElement>("[data-row],[data-tick]"); hlSvc(r ? r.dataset.row || r.dataset.tick || null : null); }}
      onPointerLeave={() => hlSvc(null)}
    >
      <Grip />
      <SystemBar />
      <SheetHeader />
      <SystemPanel />
      <Chooser />
      <LogsBody />
    </motion.section>
  );
}
