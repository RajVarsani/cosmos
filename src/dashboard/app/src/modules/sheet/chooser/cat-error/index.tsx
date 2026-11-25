import { Button } from "@/modules/ui/button";
import { cx } from "@/modules/ui/glass";
import { setUi } from "@/state/ui-store";
import s from "./cat-error.module.css";

export function NoSlot() {
  return <div className={s.err}>No free slot. Remove a system to make room.</div>;
}

export function CatError({ err }: { err: string | null }) {
  if (!err) return <div className={cx(s.err, s.wait)}>reading the catalog…</div>;
  return (
    <div className={s.err} role="alert">
      <span>The catalog could not be read, so nothing can be launched:<br />{err}</span>
      <Button className={s.retry} onClick={() => setUi((st) => ({ catErr: null, catForce: st.catForce + 1 }))}>retry</Button>
    </div>
  );
}
