import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { overlay, T } from "@/lib/motion/spec";
import s from "./tip.module.css";

// a hover tip above its anchor, portalled because the sheet clips; same surface as the memory popover
export function Tip({ at, open, children }: { at: RefObject<HTMLElement | null>; open: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = typeof children === "string" ? children : "";
  useLayoutEffect(() => {
    const el = ref.current, a = at.current;
    if (!open || !el || !a) return;
    const r = a.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    el.style.top = `${Math.max(8, r.top - h - 8)}px`;
  }, [open, key]);
  return createPortal(
    <AnimatePresence>
      {open && <motion.div ref={ref} className={s.tip} role="tooltip" {...overlay} transition={T.fast}>{children}</motion.div>}
    </AnimatePresence>,
    // inside the active view root, so it takes that view's tokens
    document.querySelector("[data-view]") || document.body,
  );
}
