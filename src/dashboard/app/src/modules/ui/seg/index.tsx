import type { ReactNode } from "react";
import { cx } from "../glass";
import s from "./seg.module.css";

export type SegItem<K extends string> = { k: K; label: ReactNode; count?: ReactNode; tone?: "error" | "warn"; hidden?: boolean; className?: string };

// a pill group of mutually exclusive buttons
export function Seg<K extends string>({ items, value, onPick, label, className, id }: { items: SegItem<K>[]; value: K; onPick: (k: K) => void; label: string; className?: string; id?: string }) {
  return (
    <div className={cx(s.seg, className)} id={id} role="group" aria-label={label}>
      {items.map((x) => (
        <button key={x.k} type="button" hidden={x.hidden} aria-pressed={x.k === value} className={cx(x.tone && s[x.tone], x.className)} onClick={() => onPick(x.k)}>
          {x.label}{x.count != null && <span>{x.count}</span>}
        </button>
      ))}
    </div>
  );
}
