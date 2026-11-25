import type { Profile } from "@/domain/types";
import type { CatView } from "../../catalog";
import { ProfileRow } from "../profile-row";
import s from "./profile-group.module.css";

type Props = { heading: string; rows: Profile[]; k: CatView; profile: string; onPick: (id: string) => void };

export function ProfileGroup({ heading, rows, k, profile, onPick }: Props) {
  return (
    <div className={s.pgrp} role="radiogroup" aria-label={heading}>
      <div className={s.pgh}>{heading}</div>
      {rows.map((q) => <ProfileRow key={q.id} q={q} k={k} on={q.id === profile} onPick={onPick} />)}
    </div>
  );
}
