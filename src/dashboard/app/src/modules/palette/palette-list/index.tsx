import { forwardRef, useEffect, type ReactNode } from "react";
import type { Cmd } from "../commands";
import { PaletteItem } from "../palette-item";
import s from "./palette-list.module.css";

type Props = { items: Cmd[]; q: string; sel: number; onHover: (k: number) => void; onRun: (k: number) => void };

export const PaletteList = forwardRef<HTMLUListElement, Props>(function PaletteList({ items, q, sel, onHover, onRun }, ref) {
  useEffect(() => { document.getElementById(`pal-${sel}`)?.scrollIntoView({ block: "nearest" }); }, [sel]);
  const rows: ReactNode[] = [];
  let g: string | null = null;
  items.forEach((x, k) => {
    if (!q && x.g !== g) { g = x.g; rows.push(<li key={`g:${g}:${k}`} className={s.g} role="presentation">{g}</li>); }
    rows.push(<PaletteItem key={`${x.id}:${k}`} x={x} k={k} on={k === sel} onHover={onHover} onRun={onRun} />);
  });
  return (
    <ul ref={ref} className={s.list} id="pal-list" role="listbox" aria-label="commands">
      {rows.length ? rows : <li className={s.none}>nothing matches “{q}”</li>}
    </ul>
  );
});
