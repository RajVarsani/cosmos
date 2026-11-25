import { useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import type { Instance } from "@/domain/types";
import { overlay, T } from "@/lib/motion/spec";
import { useNow } from "@/lib/use-now";
import { ShareBody } from "@/modules/sheet/overview/instance-side/share-section/share-body";
import s from "./share-panel.module.css";

// the bar's share popover: the same body as the side column's SHARE section, floated above the sheet, which clips
export function SharePanel({ i, open, at }: { i: Instance; open: boolean; at: RefObject<HTMLSpanElement | null> }) {
  useNow(1000);
  const ref = useRef<HTMLDivElement>(null);
  const sh = i.share;
  useLayoutEffect(() => {
    const el = ref.current, b = at.current;
    if (!open || !el || !b) return;
    const r = b.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.right - w))}px`;
    el.style.top = `${Math.max(8, r.top - h - 10)}px`;
  }, [open, sh?.url, sh?.state, sh?.public, sh?.notice, sh?.warnings?.length, sh?.preview?.state]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div ref={ref} className={s.panel} data-share-panel role="dialog" aria-label={`share ${i.name}`} variants={overlay} initial="initial" animate="animate" exit="exit" transition={T.base}>
          <span className={s.head}>share</span>
          <ShareBody i={i} />
        </motion.div>
      )}
    </AnimatePresence>,
    // inside the active view root, so it takes that view's tokens
    document.querySelector("[data-view]") || document.body,
  );
}
