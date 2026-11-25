import { cx } from "@/modules/ui/glass";
import type { Memory } from "../use-memory";
import s from "./ring-button.module.css";

export function RingButton({ m, open, active, onToggle, onKb }: { m: Memory; open: boolean; active: boolean; onToggle: () => void; onKb: (v: boolean) => void }) {
  const pct = m.state === "ok" ? m.pct : 0;
  const label = m.state === "ok" ? m.label : m.state === "unreadable" ? "Memory: vm unreadable" : "Memory: measuring";
  return (
    <button
      type="button" className={cx(s.btn, open && s.on)} id="g-btn" aria-label={label} aria-expanded={open} aria-controls="g-tip"
      data-active={active ? "1" : undefined}
      onClick={onToggle}
      onFocus={(e) => onKb(e.currentTarget.matches(":focus-visible"))}
      onBlur={() => onKb(false)}
    >
      <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" pathLength="100" /><circle cx="10" cy="10" r="8" pathLength="100" strokeDasharray={`${pct.toFixed(2)} 100`} id="g-arc" /></svg>
    </button>
  );
}
