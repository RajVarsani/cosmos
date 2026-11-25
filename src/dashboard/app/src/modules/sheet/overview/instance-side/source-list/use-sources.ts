import { useEffect } from "react";
import useSWR, { mutate } from "swr";
import { genericAPIFetcher } from "@/lib/api/fetchers";
import type { SourcesView } from "@/domain/types";

export const sourcesKey = (name: string) => [`/api/instances/${encodeURIComponent(name)}/sources`, "get"] as [string, "get"];

// what each source-mounted service runs; re-read when a job on the instance ends
export function useSources(name: string, job: string | null) {
  const r = useSWR<SourcesView>(sourcesKey(name), genericAPIFetcher, { refreshInterval: 15000, revalidateOnFocus: false });
  useEffect(() => { if (!job) mutate(sourcesKey(name)); }, [job, name]);
  return r;
}

