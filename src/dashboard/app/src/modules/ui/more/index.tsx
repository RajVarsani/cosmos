import type { ReactNode } from "react";
import { setUi, useUi } from "@/state/ui-store";
import s from "./more.module.css";

// a disclosure whose open state survives re-renders, keyed in the store
export function More({ k, summary, children }: { k: string; summary: ReactNode; children: ReactNode }) {
  const open = useUi((u) => !!u.open[k]);
  return (
    <details className={s.more} open={open} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; if (o !== open) setUi((u) => ({ open: { ...u.open, [k]: o } })); }}>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}
