import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { svcKind } from "@/domain/services";
import { overlay, T } from "@/lib/motion/spec";
import { useUi } from "@/state/ui-store";
import { ppShow, usePp } from "./pp-store";
import s from "./service-popover.module.css";

export { ppShow };

const KINDS = [["frontends", "fe"], ["backends", "app"], ["infra", "infra"], ["setup", "init"]] as const;
const hit = (e: Event) => (e.target as Element | null)?.closest?.("[data-profile]") as HTMLElement | null;

// the named service list for a profile row, placed above its .sv if it fits else below
export function ServicePopover() {
  const id = usePp((p) => p.id);
  const n = usePp((p) => p.n);
  const cat = useUi((st) => st.cat);
  const ref = useRef<HTMLDivElement>(null);
  const q = id ? cat?.profiles.find((x) => x.id === id) : null;

  useEffect(() => {
    const over = (e: PointerEvent) => { const sv = (e.target as Element | null)?.closest?.("[data-pp]"); ppShow(sv ? sv.closest<HTMLElement>("[data-profile]") : null); };
    const fin = (e: FocusEvent) => { const b = hit(e); ppShow(b && b.matches(":focus-visible") ? b : null); };
    const out = (e: FocusEvent) => { if (hit(e)) ppShow(null); };
    document.addEventListener("pointerover", over);
    document.addEventListener("focusin", fin);
    document.addEventListener("focusout", out);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("focusin", fin);
      document.removeEventListener("focusout", out);
    };
  }, []);

  useLayoutEffect(() => {
    const el = ref.current, sv = usePp.getState().at?.querySelector("[data-pp]");
    if (!el || !sv) return;
    const r = sv.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    const x = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)), above = r.top - h - 8 > 8;
    el.style.left = `${x}px`;
    el.style.top = `${above ? r.top - h - 8 : r.bottom + 8}px`;
  }, [id, n]);

  const sv = q?.services || [];
  return createPortal(
    <AnimatePresence>
      {q && (
        <motion.div ref={ref} className={s.pp} role="tooltip" variants={overlay} initial="initial" animate="animate" exit="exit" transition={T.fast}>
          {q.about && <span className={s.pa}>{q.about}</span>}
          {KINDS.map(([h, kd]) => {
            const l = sv.filter((x) => svcKind({ service: x }) === kd);
            return l.length ? <div key={h} className={s.row}><b>{h}</b><span>{l.map((x, i) => <span key={x}>{i > 0 && ", "}<em>{x}</em></span>)}</span></div> : null;
          })}
        </motion.div>
      )}
    </AnimatePresence>,
    // inside the active view root, so it takes that view's tokens
    document.querySelector("[data-view]") || document.body,
  );
}
