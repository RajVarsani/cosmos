import useSWR, { mutate } from "swr";
import { genericAPIFetcher } from "@/lib/api/fetchers";
import { TRANSIT } from "@/domain/states";
import type { Catalog, Overview } from "@/domain/types";
import { applyMeta } from "@/domain/palette";
import { births, states } from "./births";
import { recordHist } from "./hist";
import { setUi, ui, useUi } from "./ui-store";

export const OVERVIEW_KEY = ["/api/overview", "get"] as [string, "get"];
export const refreshOverview = () => mutate(OVERVIEW_KEY);

function landed(d: Overview) {
  applyMeta(d.meta);
  for (const i of d.instances) {
    const before = states.get(i.name);
    if (before && before !== "running" && i.state === "running") births.set(i.name, performance.now());
    if (!before && i.state !== "running" && TRANSIT.has(i.state)) births.delete(i.name);
    states.set(i.name, i.state);
  }
  const now = performance.now(), { pollAt, pollEvery } = ui();
  const every = pollAt ? (pollEvery ? pollEvery * 0.7 + (now - pollAt) * 0.3 : now - pollAt) : pollEvery;
  recordHist(d);
  const inline = d.catalog;
  const cat: Partial<ReturnType<typeof ui>> = {};
  if (inline && "error" in inline && inline.error) { if (ui().catErr !== inline.error) Object.assign(cat, { catErr: inline.error, cat: null }); }
  else if (inline && Array.isArray((inline as Catalog).profiles)) {
    const { at: _at, ...c } = inline as Catalog;
    if (ui().catErr || JSON.stringify(c) !== JSON.stringify(ui().cat)) Object.assign(cat, { cat: c, catErr: null });
  }
  setUi({ data: d, err: null, pollAt: now, pollEvery: every, ...cat });
}

// the one poll: every 2s while visible, 15s hidden; results land in the store the scene reads
export function useOverview() {
  useSWR<Overview>(OVERVIEW_KEY, genericAPIFetcher, {
    refreshInterval: () => (document.hidden ? 15000 : 2000),
    refreshWhenHidden: true,
    revalidateOnFocus: true,
    dedupingInterval: 0,
    onErrorRetry: (_e, _k, _c, revalidate, o) => { setTimeout(() => revalidate(o), document.hidden ? 15000 : 2000); },
    onSuccess: landed,
    onError: (e: Error) => setUi({ err: e.message }),
  });
}

// the catalog only when the overview does not carry it, or a retry asks
export function useCatalog() {
  const inline = useUi((s) => !!s.data?.catalog);
  const force = useUi((s) => s.catForce);
  useSWR<Catalog | { error?: string }>(!inline || force ? [force ? `/api/catalog?f=${force}` : "/api/catalog", "get"] : null, genericAPIFetcher, {
    refreshInterval: inline ? 0 : 15000,
    revalidateOnFocus: false,
    onSuccess: (c) => setUi(c && Array.isArray((c as Catalog).profiles) ? { cat: c as Catalog, catErr: null } : { cat: null, catErr: (c && c.error) || "the catalog came back without profiles" }),
    onError: (e: Error) => setUi({ cat: null, catErr: e.message }),
  });
}
