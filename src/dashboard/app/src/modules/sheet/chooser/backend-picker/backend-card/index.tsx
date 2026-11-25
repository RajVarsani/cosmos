import type { CSSProperties } from "react";
import type { CatalogBackend, Combo } from "@/domain/types";
import { bk } from "@/domain/palette";
import s from "./backend-card.module.css";

type Props = { id: string; combo: Combo; meta?: CatalogBackend; on: boolean; onPick: (id: string) => void };

export function BackendCard({ id, combo, meta, on, onPick }: Props) {
  const warn = combo.available && meta?.live;
  return (
    <button
      type="button"
      className={s.bopt}
      data-backend={id}
      aria-pressed={on && combo.available}
      disabled={!combo.available}
      title={(!combo.available && combo.reason) || meta?.reason || meta?.note || ""}
      style={{ "--c": bk(id).c } as CSSProperties}
      onClick={(e) => { onPick(id); e.currentTarget.focus({ preventScroll: true }); }}
    >
      <span className={s.bn}><i />{id}</span>
      {combo.available ? (
        <>
          <span className={s.bw}>{meta?.host || ""}</span>
          {warn && <span className={s.lv}><i />live data</span>}
        </>
      ) : (
        <span className={s.why}>{combo.reason || "unavailable"}</span>
      )}
    </button>
  );
}
