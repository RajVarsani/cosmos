import { useLogs } from "@/modules/sheet/logs/logs-store";
import { useNow } from "@/lib/use-now";
import { useUi } from "@/state/ui-store";

// last-hour window over the jobs, scoped to the focused system; ticks each second while logs are open
export function useJobs() {
  const data = useUi((s) => s.data);
  const focus = useUi((s) => s.focus);
  const logs = useUi((s) => s.logs);
  const all = useLogs((s) => s.all);
  const showOlder = useLogs((s) => s.olderJobs);
  useNow(logs ? 1000 : 60000);
  const sc = focus && !all ? focus : null;
  const jobs = (data?.jobs || []).filter((j) => !sc || j.target === sc);
  const hour = Date.now() - 3600_000;
  const recent = jobs.filter((j) => Date.parse(j.startedAt) >= hour || !j.endedAt);
  return { ready: !!data, sc, showOlder, list: showOlder ? jobs : recent, recent: recent.length, older: jobs.length - recent.length };
}
