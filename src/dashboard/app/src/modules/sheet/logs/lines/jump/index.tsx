import { cx } from "@/modules/ui/glass";
import { logsJump, useLogs } from "../../logs-store";
import s from "./jump.module.css";

export function Jump() {
  const paused = useLogs((l) => l.paused);
  const follow = useLogs((l) => l.follow);
  const unseen = useLogs((l) => l.unseen);
  const n = `${unseen} new line${unseen === 1 ? "" : "s"}`;
  return (
    <button type="button" id="lg-jump" className={cx(s.jump, (paused || (!follow && unseen > 0)) && s.show)} onClick={logsJump}>
      {paused ? `paused · ${n} · resume` : `${n} · jump to latest`}
    </button>
  );
}
