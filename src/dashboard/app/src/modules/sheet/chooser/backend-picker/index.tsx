import type { Profile } from "@/domain/types";
import { setUi } from "@/state/ui-store";
import type { CatView } from "../catalog";
import { BackendCard } from "./backend-card";
import s from "./backend-picker.module.css";

export function BackendPicker({ k, p, backend }: { k: CatView; p: Profile; backend: string | null }) {
  return (
    <div className={s.bgrid} role="group" aria-label="backend">
      {(p.backends || []).map((b) => (
        <BackendCard key={b} id={b} combo={k.combo(p.id, b)} meta={k.bmeta.get(b)} on={b === backend} onPick={(id) => setUi((st) => ({ form: { ...st.form, backend: id } }))} />
      ))}
    </div>
  );
}
