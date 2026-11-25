import { Chip } from "@/modules/ui/chip";
import { useUi } from "@/state/ui-store";
import { logsScopeTo, setLogs, useLogs } from "../logs-store";
import s from "./scope-chip.module.css";

export function ScopeChip() {
  const focus = useUi((u) => u.focus);
  const all = useLogs((l) => l.all);
  return (
    <Chip id="lg-scope" className={s.scope} hidden={!focus} aria-pressed={!all} onClick={() => { setLogs({ all: !all }); logsScopeTo(); }}>
      {focus}<span> only</span>
    </Chip>
  );
}
