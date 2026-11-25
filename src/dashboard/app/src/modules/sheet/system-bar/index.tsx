import { PlanetBar } from "./planet-bar";
import { SystemLine } from "./system-line";
import { useFocusGuard } from "./use-focus-guard";
import { useFocused } from "./use-focused";
import { useUi } from "@/state/ui-store";
import s from "./system-bar.module.css";

// the collapsed sheet: one line for the focused system, or for its planet
export function SystemBar() {
  useFocusGuard();
  const focus = useUi((u) => u.focus);
  const f = useFocused();
  return (
    <div className={s.sbar} id="sbar" hidden={!focus}>
      {f && (f.pc ? <PlanetBar i={f.i} c={f.pc} /> : <SystemLine i={f.i} d={f.d} />)}
    </div>
  );
}
