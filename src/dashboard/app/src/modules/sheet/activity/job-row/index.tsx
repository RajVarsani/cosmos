import { cx } from "@/modules/ui/glass";
import type { Job } from "@/domain/types";
import { ago, dur } from "@/lib/format";
import { JobOutput } from "../job-output";
import { actToggle, useActivity } from "../activity-store";
import s from "./job-row.module.css";

export function JobRow({ j }: { j: Job }) {
  const open = useActivity((a) => !!a.open[j.id]);
  const cls = !j.endedAt ? "run" : j.ok ? "ok" : "bad";
  const took = j.endedAt ? dur(Date.parse(j.endedAt) - Date.parse(j.startedAt)) : "running";
  return (
    <div className={cx(s.ev, s[cls], open && s.open)}>
      <button type="button" className={s.head} aria-expanded={open} onClick={() => actToggle(j.id)}>
        <i />
        <span className={s.t}><b>{j.kind}</b> {j.target || j.backend || ""}</span>
        <span className={s.w}>{`${ago(j.startedAt)} ago · ${took}`}</span>
        {!open && (cls === "bad" || cls === "run") && <span className={s.l}>{j.error || j.last || ""}</span>}
      </button>
      {open && <JobOutput id={j.id} />}
    </div>
  );
}
