import { Cap, capN, note } from "@/modules/ui/cap";
import { cx } from "@/modules/ui/glass";
import { useUi } from "@/state/ui-store";
import { MAXS, setLogs, useLogs } from "../logs-store";
import { InstanceGroup } from "./instance-group";
import s from "./source-rail.module.css";

export function SourceRail() {
  const data = useUi((u) => u.data);
  const focus = useUi((u) => u.focus);
  const all = useLogs((l) => l.all);
  const picked = useLogs((l) => l.sel.length);
  const railOpen = useLogs((l) => l.railOpen);
  const sc = focus && !all ? focus : null;
  const groups = (data?.instances || []).filter((i) => !sc || i.name === sc);
  return (
    <aside id="lg-rail" className={cx(s.rail, railOpen && s.open)} aria-label="log sources">
      <Cap className={s.cap}>
        Sources<span className={capN}>{picked ? `${picked} of ${MAXS} picked` : "none picked"}</span>
        <button type="button" className={s.btn} id="lg-railbtn" onClick={() => setLogs({ railOpen: !railOpen })}>{railOpen ? "done" : "choose"}</button>
      </Cap>
      <div className={s.list} id="lg-list">
        {data && (groups.length ? groups.map((i) => <InstanceGroup key={i.name} i={i} scoped={!!sc} />) : <div className={cx(note, s.none)}>no instances</div>)}
      </div>
    </aside>
  );
}
