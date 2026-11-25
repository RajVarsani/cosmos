import { Chip } from "@/modules/ui/chip";
import { logsClear, logsPause, setLogs, useLogs } from "../../logs-store";
import s from "./toggles.module.css";

export function Toggles() {
  const paused = useLogs((l) => l.paused);
  const wrap = useLogs((l) => l.wrap);
  return (
    <>
      <Chip id="lg-pause" aria-pressed={paused} onClick={logsPause}>{paused ? "resume" : "pause"}</Chip>
      <Chip id="lg-wrap" aria-pressed={wrap} onClick={() => setLogs({ wrap: !wrap })}>wrap</Chip>
      <Chip id="lg-clear" className={s.clear} onClick={logsClear}>clear</Chip>
    </>
  );
}
