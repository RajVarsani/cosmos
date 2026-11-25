import type { CSSProperties } from "react";
import { MAXS, logsToggle, useLogs } from "../../logs-store";
import { colorOf } from "../../src-color";
import s from "./selected-pills.module.css";

export function SelectedPills() {
  const sel = useLogs((l) => l.sel);
  return (
    <div className={s.sel} id="lg-sel" aria-label="selected sources">
      {sel.length
        ? sel.map((k) => (
            <button key={k} type="button" className={s.pill} style={{ "--c": colorOf(sel, k) } as CSSProperties} aria-label={`remove ${k}`} onClick={() => logsToggle(k)}>
              <i />{k}<span aria-hidden="true">×</span>
            </button>
          ))
        : <span className={s.none}>no sources picked · choose up to {MAXS}</span>}
    </div>
  );
}
