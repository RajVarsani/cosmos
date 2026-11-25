import { cx } from "@/modules/ui/glass";
import { useLogs } from "../logs-store";
import s from "./live-status.module.css";

export function LiveStatus() {
  const states = useLogs((l) => l.streamStates);
  const paused = useLogs((l) => l.paused);
  const ss = Object.values(states);
  const n = ss.length, live = ss.filter((x) => x === "live").length;
  const of = n > 1 ? ` · ${n} sources` : "";
  const [tone, label, sub] = !n ? ["", "idle", " · no sources"] : paused ? ["", "paused", of] : live === n ? ["on", "live", of] : ss.includes("ended") && !live ? ["end", "ended", of] : ["go", ss.includes("reconnecting") ? "reconnecting" : "connecting", ""];
  return (
    <span id="lg-live" className={cx(s.live, tone && s[tone])} role="status">
      <i /><span>{label}{sub && <b>{sub}</b>}</span>
    </span>
  );
}
