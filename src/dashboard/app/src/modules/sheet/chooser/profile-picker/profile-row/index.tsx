import type { CSSProperties } from "react";
import type { Profile } from "@/domain/types";
import { svcC, titleOf } from "@/domain/palette";
import type { CatView } from "../../catalog";
import { rowInfo } from "./row-info";
import s from "./profile-row.module.css";

type Props = { q: Profile; k: CatView; on: boolean; onPick: (id: string) => void };

export function ProfileRow({ q, k, on, onPick }: Props) {
  const { enabled, why, sv, infra, count, est, src } = rowInfo(q, k);
  return (
    <button
      type="button"
      className={s.popt}
      role="radio"
      data-profile={q.id}
      aria-checked={on}
      tabIndex={on ? 0 : -1}
      disabled={!enabled}
      aria-describedby={`pp-${q.id}`}
      onClick={(e) => { onPick(q.id); e.currentTarget.focus({ preventScroll: true }); }}
    >
      <span className={s.pn}>{q.title || titleOf(q.id)}</span>
      <span className={s.est}>{est}</span>
      <span className={s.ck} aria-hidden="true" />
      <span className={s.ab}>{why || q.about || ""}</span>
      <span className={s.sv} data-pp={q.id}>
        <span className={s.dots} aria-hidden="true">
          {sv.map((x) => <i key={x} style={{ "--pc": svcC(x) } as CSSProperties} />)}
          {infra.map((x) => <i key={x} className={s.inf} />)}
        </span>
        <span className={s.cnt}>{count}</span>
      </span>
      <span id={`pp-${q.id}`} hidden>{src}</span>
    </button>
  );
}
