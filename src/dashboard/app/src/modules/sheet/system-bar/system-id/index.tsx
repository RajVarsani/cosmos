import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/modules/ui/glass";
import { useBarToggle } from "./use-bar-toggle";
import s from "./system-id.module.css";

const DOT: Record<string, string> = { ok: s.ok, go: s.go, bad: s.bad };

// state dot, name and a meta line; clicking it toggles the sheet
export function SystemId({ cls, dotTitle, name, color, children }: { cls: string; dotTitle: string; name: string; color?: string; children: ReactNode }) {
  const toggle = useBarToggle();
  return (
    <div className={s.id} style={color ? ({ "--pc": color } as CSSProperties) : undefined} onClick={toggle}>
      <i className={cx(DOT[cls])} title={dotTitle} />
      <b>{name}</b>
      <span>{children}</span>
    </div>
  );
}
