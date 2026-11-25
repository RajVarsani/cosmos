import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { MemoryPopover } from "./popover";
import { RingButton } from "./ring-button";
import { useMemory } from "./use-memory";
import s from "./memory-ring.module.css";

// a ring of vm memory in use; hover, focus or click shows the breakdown
export function MemoryRing() {
  const m = useMemory();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [kb, setKb] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const shut = () => setOpen(false);
    const key = (e: KeyboardEvent) => {
      const el = root.current;
      if (e.key === "Escape" && el && (el.dataset.open === "1" || el.contains(document.activeElement))) { shut(); el.querySelector("button")?.blur(); }
    };
    const down = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) shut(); };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", down);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", down); };
  }, []);
  const tone = m.state === "ok" ? (m.low ? "low" : m.warn ? "warn" : undefined) : undefined;
  return (
    <div ref={root} className={s.gmini} id="gauge" data-tone={tone} data-open={open ? "1" : undefined} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <RingButton m={m} open={open} active={open || hover || kb} onToggle={() => setOpen((o) => !o)} onKb={setKb} />
      <AnimatePresence>{(open || hover || kb) && <MemoryPopover m={m} />}</AnimatePresence>
    </div>
  );
}
