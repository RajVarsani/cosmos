import { lbl } from "@/domain/states";
import { closeDrawer, focusPlanet, focusSystem } from "@/state/actions";
import { useUi } from "@/state/ui-store";
import { cx } from "@/modules/ui/glass";
import s from "./crumb.module.css";

// galaxy / system / planet
export function Crumb() {
  const i = useUi((u) => (u.focus && u.data?.instances.find((x) => x.name === u.focus)) || null);
  const planet = useUi((u) => u.planet);
  return (
    <span className={s.crumb} id="crumb" hidden={!i}>
      /{" "}
      <button type="button" className={cx(s.cb, !!planet && s.up)} id="crumb-sys" title="system view" onClick={() => focusPlanet(null)}>{lbl(i)}</button>
      <span className={s.pl} id="crumb-pl" hidden={!planet}>/ <b>{planet}</b></span>
      <button type="button" className={s.x} id="crumb-x" aria-label="back to galaxy" onClick={() => { closeDrawer(); focusSystem(null); }}>
        <svg width="10" height="10" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.6"><path d="M2 2l8 8M10 2l-8 8" /></svg>
      </button>
    </span>
  );
}
