import { EDGE_SVC } from "@/domain/services";
import { plural } from "@/lib/format";
import { useUi } from "@/state/ui-store";
import { cx } from "@/modules/ui/glass";
import s from "./pulse.module.css";

// systems up and planets lit, or that the console is unreachable
export function Pulse() {
  const d = useUi((u) => u.data);
  const err = useUi((u) => u.err);
  if (!d) return <div className={cx(s.pulse, !!err && s.off)} id="pulse" role="status"><i /><span>{err ? "console unreachable" : ""}</span></div>;
  const up = d.instances.filter((i) => i.state === "running").length;
  const planets = d.instances.flatMap((i) => i.containers).filter((c) => c.running && c.service !== EDGE_SVC).length;
  return (
    <div className={cx(s.pulse, !!err && s.off)} id="pulse" role="status">
      <i />
      <span>{err ? "console unreachable" : <><b>{up}/{d.instances.length}</b> up<span className={s.xt}> · {planets} {plural(planets, "planet")}</span></>}</span>
    </div>
  );
}
