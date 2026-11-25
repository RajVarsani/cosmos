import { useJobs } from "../use-jobs";

export function ActTabCount() {
  const { recent } = useJobs();
  return <span id="act-n2">{recent ? ` ${recent}` : ""}</span>;
}
