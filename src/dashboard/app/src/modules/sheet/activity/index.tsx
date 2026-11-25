import { Cap, note } from "@/modules/ui/cap";
import { Chip } from "@/modules/ui/chip";
import { cx } from "@/modules/ui/glass";
import { JobRow } from "./job-row";
import { setLogs } from "../logs/logs-store";
import { useJobs } from "./use-jobs";
import s from "./activity.module.css";

export function Activity() {
  const { ready, sc, showOlder, list, recent, older } = useJobs();
  return (
    <aside className={s.act} aria-label="activity">
      <Cap className={s.cap} n={ready ? `${recent} in the last hour` : undefined}>Activity</Cap>
      <div id="act-list" className={s.list}>
        {ready && (
          <>
            {list.length ? list.map((j) => <JobRow key={j.id} j={j} />) : <div className={cx(note, s.none)}>no create, start, stop or remove{sc ? ` for ${sc}` : ""} in the last hour</div>}
            {older > 0 && <Chip className={s.more} onClick={() => setLogs({ olderJobs: !showOlder })}>{showOlder ? "last hour only" : `show ${older} older`}</Chip>}
          </>
        )}
      </div>
    </aside>
  );
}
