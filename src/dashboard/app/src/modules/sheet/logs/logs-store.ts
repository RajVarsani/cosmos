import { create } from "zustand";
import { svcKind } from "@/domain/services";
import { toast } from "@/modules/toast/toast-store";
import { ui } from "@/state/ui-store";
import { levelOf, type Lv } from "./levels";

export const MAXS = 4, MAXBUF = 6000, MAXDOM = 2500;
export type Line = { id: number; t: number; key: string; text: string; lv: Lv; err: boolean };
export type StreamState = "connecting" | "live" | "reconnecting" | "ended";
export type Level = "all" | "warn" | "error";

export type LogsState = {
  sel: string[]; all: boolean; railOpen: boolean; paused: boolean; follow: boolean; unseen: number;
  q: string; level: Level; wrap: boolean; olderJobs: boolean;
  openInst: Record<string, boolean>; infraOpen: Record<string, true>;
  errBy: Record<string, number>; counts: { all: number; warn: number; error: number };
  streamStates: Record<string, StreamState>;
  view: Line[]; rev: number;
};

const loadSel = () => {
  try { const s = JSON.parse(sessionStorage.getItem("cosmos-logsel") || "[]"); if (Array.isArray(s)) return s.slice(0, MAXS) as string[]; } catch {}
  return [];
};

export const useLogs = create<LogsState>(() => ({
  sel: loadSel(), all: false, railOpen: false, paused: false, follow: true, unseen: 0,
  q: "", level: "all", wrap: true, olderJobs: false,
  openInst: {}, infraOpen: {}, errBy: {}, counts: { all: 0, warn: 0, error: 0 },
  streamStates: {}, view: [], rev: 0,
}));

export const setLogs = (p: Partial<LogsState>) => useLogs.setState(p);
const get = () => useLogs.getState();
const bump = () => get().rev + 1;

type Stream = { es: EventSource | null; state: StreamState };
const streams = new Map<string, Stream>();
let buf: Line[] = [];
let pending: Line[] = [];
let dirty = false, raf = 0, seq = 0;
let countsT: ReturnType<typeof setTimeout> | undefined;

export const logsBuf = () => buf;
export const hasStream = (key: string) => streams.has(key);
export const logsScope = () => { const f = ui().focus; return f && !get().all ? f : null; };

const save = () => { try { sessionStorage.setItem("cosmos-logsel", JSON.stringify(get().sel)); } catch {} };
const publish = () => setLogs({ streamStates: Object.fromEntries([...streams].map(([k, s]) => [k, s.state])) });

export function logsTail(key: string, n: number) {
  const ls: { t: number; text: string; lv: string }[] = [];
  for (let j = buf.length - 1; j >= 0 && ls.length < n; j--) if (buf[j].key === key) ls.push({ t: buf[j].t, text: buf[j].text, lv: buf[j].lv });
  return ls.reverse();
}

function visible(x: Line) {
  const { level, q } = get();
  if (level === "error" && x.lv !== "error") return false;
  if (level === "warn" && x.lv !== "error" && x.lv !== "warn") return false;
  return !q || x.text.toLowerCase().includes(q);
}

function counts() {
  let e = 0, w = 0;
  const per: Record<string, number> = {};
  for (const x of buf) {
    if (x.lv === "error") { e++; per[x.key] = (per[x.key] || 0) + 1; }
    else if (x.lv === "warn") w++;
  }
  setLogs({ errBy: per, counts: { all: buf.length, warn: w, error: e } });
}
const countsSoon = () => { clearTimeout(countsT); countsT = setTimeout(counts, 250); };

export function logsRender() {
  dirty = false; pending = [];
  if (!get().sel.length) { setLogs({ view: [], rev: bump() }); counts(); return; }
  setLogs({ view: buf.filter(visible).slice(-MAXDOM), unseen: 0, rev: bump() });
  counts();
}

function flush() {
  raf = 0;
  if (dirty) { logsRender(); return; }
  const list = pending; pending = [];
  const st = get();
  if (!list.length) return;
  if (st.paused) { setLogs({ unseen: st.unseen + list.length, rev: bump() }); return; }
  const view = [...st.view, ...list].slice(-MAXDOM);
  setLogs(st.follow ? { view, rev: bump() } : { view, unseen: st.unseen + list.length, rev: bump() });
  countsSoon();
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(flush); };

type Wire = { ts?: string; text: string; stream?: string };
function add(key: string, lines: Wire[]) {
  let late = false;
  const last = buf.length ? buf[buf.length - 1].t : 0;
  const fresh: Line[] = [];
  for (const l of lines) {
    const t = l.ts ? Date.parse(l.ts) : Date.now();
    const x: Line = { id: ++seq, t, key, text: l.text, lv: l.stream === "sys" ? "sys" : levelOf(l.text), err: l.stream === "err" };
    if (t < last) late = true;
    buf.push(x); fresh.push(x);
  }
  if (late) buf.sort((a, b) => a.t - b.t);
  if (buf.length > MAXBUF) buf.splice(0, buf.length - MAXBUF);
  if (late) { dirty = true; schedule(); return; }
  pending.push(...fresh.filter(visible));
  schedule();
}

function open(key: string) {
  const [name, svc] = key.split("/");
  const s: Stream = { es: null, state: "connecting" };
  streams.set(key, s);
  const tail = get().sel.length > 2 ? 150 : 300;
  const es = new EventSource(`/api/instances/${encodeURIComponent(name)}/logs?svc=${encodeURIComponent(svc)}&tail=${tail}`);
  s.es = es;
  es.addEventListener("open", () => { s.state = "live"; publish(); });
  es.addEventListener("lines", (e) => { s.state = "live"; add(key, JSON.parse((e as MessageEvent).data)); publish(); });
  es.addEventListener("end", (e) => {
    const r = JSON.parse((e as MessageEvent).data);
    add(key, [{ ts: new Date().toISOString(), text: `stream ended: ${r.reason}`, stream: "sys" }]);
    s.state = "ended"; es.close(); publish();
  });
  es.onerror = () => { if (streams.get(key) === s && s.state !== "ended") { s.state = "reconnecting"; publish(); } };
}

// open/close EventSources to match the selection; only while the logs view is showing
export function logsSync(reset?: boolean) {
  const want = ui().logs ? new Set(get().sel) : new Set<string>();
  if (reset) {
    for (const [, s] of streams) s.es?.close();
    streams.clear(); buf = [];
    setLogs({ unseen: 0, paused: false, follow: true });
  }
  for (const [k, s] of streams) if (!want.has(k)) { s.es?.close(); streams.delete(k); buf = buf.filter((l) => l.key !== k); dirty = true; }
  for (const k of want) if (!streams.has(k)) open(k);
  publish();
  logsRender();
}

export function logsOnly(key: string, keepIfSame?: boolean) {
  const { sel } = get();
  if (keepIfSame && sel.length === 1 && sel[0] === key) return;
  setLogs({ sel: [key] }); save(); logsSync(true);
}

export function logsToggle(key: string) {
  const { sel } = get();
  if (sel.includes(key)) setLogs({ sel: sel.filter((k) => k !== key) });
  else {
    if (sel.length >= MAXS) { toast(`up to ${MAXS} live sources at once (browser connection limit)`, true); return; }
    setLogs({ sel: [...sel, key] });
  }
  save(); logsSync();
}

// the sheet follows the focused system: keep its sources, else pick its frontend
export function logsScopeTo() {
  const u = ui();
  if (!u.logs || !u.data) return;
  const s = logsScope();
  if (!s) return;
  const { sel } = get();
  const keep = sel.filter((k) => k.split("/")[0] === s);
  if (!keep.length) {
    const i = u.data.instances.find((x) => x.name === s);
    const c = i && (i.containers.find((q) => q.container && q.running && svcKind(q) === "fe") || i.containers.find((q) => q.container && q.running) || i.containers.find((q) => q.container));
    if (c) return logsOnly(`${s}/${c.service}`);
  }
  if (keep.length !== sel.length) { setLogs({ sel: keep }); save(); logsSync(); }
}

export const logsSetLevel = (level: Level) => { setLogs({ level }); logsRender(); };
export const logsSetQ = (q: string) => { setLogs({ q }); logsRender(); };
export const logsClear = () => { buf = []; setLogs({ unseen: 0 }); logsRender(); };
export function logsPause() {
  if (get().paused) { setLogs({ paused: false, follow: true }); logsRender(); }
  else setLogs({ paused: true });
}
export const logsJump = () => { setLogs({ paused: false, follow: true }); logsRender(); };
export function logsAtBottom(at: boolean) {
  const { follow } = get();
  if (at && !follow) setLogs({ follow: true, unseen: 0 });
  else if (!at && follow) setLogs({ follow: false });
}
