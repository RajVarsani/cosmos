import { create } from "zustand";
import type { JobLine } from "@/domain/types";
import { genericAPIFetcher } from "@/lib/api/fetchers";
import { refreshOverview } from "@/state/queries";
import { ui } from "@/state/ui-store";

type ActState = { open: Record<string, true>; lines: Record<string, JobLine[]>; esId: string | null };
export const useActivity = create<ActState>(() => ({ open: {}, lines: {}, esId: null }));

const get = () => useActivity.getState();
const setLines = (id: string, a: JobLine[]) => useActivity.setState({ lines: { ...get().lines, [id]: a } });
let es: EventSource | null = null;

function stop() {
  if (es) { es.close(); es = null; useActivity.setState({ esId: null }); }
}

function stream(id: string) {
  if (get().esId === id) return;
  stop();
  const src = new EventSource(`/api/jobs/${encodeURIComponent(id)}/events`);
  es = src;
  useActivity.setState({ esId: id });
  setLines(id, []);
  src.addEventListener("lines", (e) => {
    const a = [...(get().lines[id] || []), ...JSON.parse((e as MessageEvent).data)];
    setLines(id, a.length > 400 ? a.slice(a.length - 400) : a);
  });
  src.addEventListener("end", () => { stop(); refreshOverview(); });
}

async function load(id: string) {
  const j = ui().data?.jobs?.find((x) => x.id === id);
  if (j && !j.endedAt) { stream(id); return; }
  try { const r = await genericAPIFetcher([`/api/jobs/${id}`, "get"]); setLines(id, r.lines || []); }
  catch (e) { setLines(id, [{ t: Date.now(), kind: "error", text: (e as Error).message }]); }
}

export function actFollow(id: string) {
  useActivity.setState({ open: { ...get().open, [id]: true } });
  load(id);
}

export function actToggle(id: string) {
  const { open, esId } = get();
  if (open[id]) {
    const rest = { ...open };
    delete rest[id];
    useActivity.setState({ open: rest });
    if (esId === id) stop();
  } else actFollow(id);
}
