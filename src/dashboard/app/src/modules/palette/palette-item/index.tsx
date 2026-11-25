import type { CSSProperties } from "react";
import { cx } from "@/modules/ui/glass";
import type { Cmd } from "../commands";
import s from "./palette-item.module.css";

export function PaletteItem({ x, k, on, onHover, onRun }: { x: Cmd; k: number; on: boolean; onHover: (k: number) => void; onRun: (k: number) => void }) {
  return (
    <li
      className={cx(s.i, x.dan && s.dan)} role="option" id={`pal-${k}`} aria-selected={on}
      style={x.c ? ({ "--c": x.c } as CSSProperties) : undefined}
      onPointerMove={() => { if (!on) onHover(k); }}
      onClick={() => onRun(k)}
    >
      <i className={x.c ? undefined : s.ring} />
      <span>{x.t}{x.sub && <small>{x.sub}</small>}</span>
      {x.k ? <kbd>{x.k}</kbd> : <b />}
    </li>
  );
}
