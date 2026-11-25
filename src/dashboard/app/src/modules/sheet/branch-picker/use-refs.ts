import { useEffect } from "react";
import useSWR, { mutate } from "swr";
import { genericAPIFetcher } from "@/lib/api/fetchers";
import type { RefsView } from "@/domain/types";

const refsKey = (svc: string) => [`/api/sources/${encodeURIComponent(svc)}/refs`, "get"] as [string, "get"];

// branches for one service: the cached list at once, then again after a fetch of origin
export function useRefs(svc: string) {
  const r = useSWR<RefsView>(refsKey(svc), genericAPIFetcher, { revalidateOnFocus: false });
  useEffect(() => {
    genericAPIFetcher([`${refsKey(svc)[0]}?fetch=1`, "get"]).then((d: RefsView) => mutate(refsKey(svc), d, { revalidate: false })).catch(() => {});
  }, [svc]);
  return r;
}
