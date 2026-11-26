import { flushSync } from "react-dom";
import { genericMutationFetcher, genericAPIFetcher } from "@/lib/api/fetchers";
import { RM } from "@/lib/motion/reduced";
import { Cz } from "@/modules/scene/handle";
import { logsOnly, logsScopeTo, logsSync, setLogs } from "@/modules/sheet/logs/logs-store";
import { actFollow } from "@/modules/sheet/activity/activity-store";
import { toast } from "@/modules/toast/toast-store";
import type { Job } from "@/domain/types";
import { mainOf } from "@/domain/services";
import { refreshOverview } from "./queries";
import { writeRoute } from "./route";
import { barPx, narrow, sheetPx, visiblePx } from "./sheet-size";
import { saveSheet, setUi, ui, type Tab, type View } from "./ui-store";

const $ = (s: string) => document.querySelector<HTMLElement>(s);

// what the camera frames around, and which screen rects hover labels must avoid
function insets() {
  const m = narrow() ? 8 : 12;
  const sh = visiblePx(), b = sh ? sh + m * 2 : 0;
  const els = [$("#bar"), $("#viewsw")].concat(sh ? [] : [$("#dock")]).filter(Boolean) as HTMLElement[];
  const avoid = els.map((el) => el.getBoundingClientRect()).filter((q) => q.width).map((q) => [q.left - 6, q.top - 6, q.width + 12, q.height + 12]);
  return { r: 0, b, avoid, top: ($("#bar")?.getBoundingClientRect().bottom ?? 56) + 6 };
}
let remeasure = 0;
export function layoutUpdate(fly = true) {
  Cz.layout(insets(), fly);
  // react commits after this call; re-read the bar's rect once it has
  cancelAnimationFrame(remeasure);
  remeasure = requestAnimationFrame(() => { if (Cz.ins) Cz.ins.avoid = insets().avoid; });
}

// ---------- the bottom sheet: a slim bar for the focused system that expands into overview / logs / activity ----------
export function sheetTab(t: Tab) { setUi({ tab: t }); }
let newT: ReturnType<typeof setTimeout> | undefined;
export function sheetShow(quiet?: boolean) {
  const s = ui(), on = s.logs || !!s.focus;
  if (!s.focus && s.tab === "sys") sheetTab("lines");
  if (!s.drawer && ui().tab === "new") {
    if (s.logs || s.focus) sheetTab(s.focus ? "sys" : "lines");
    else { clearTimeout(newT); newT = setTimeout(() => { const n = ui(); if (!n.drawer && !n.logs && n.tab === "new") sheetTab("lines"); }, 450); }
  }
  const sheet = $("#sheet");
  if (!on && sheet && sheet.contains(document.activeElement)) $("#logbtn")?.focus({ preventScroll: true });
  if (quiet) return;
  logsSync();
  logsScopeTo();
  writeRoute();
  layoutUpdate();
}
export function sheetOpen(tab?: Tab) { sheetTab(tab || (ui().focus ? "sys" : "lines")); if (!ui().logs) { setUi({ logs: true }); sheetShow(); } }
export function sheetClose() { if (ui().drawer) return closeDrawer(); if (ui().logs) { setUi({ logs: false }); sheetShow(); } }
export function sheetToggle() { ui().logs ? sheetClose() : sheetOpen(); }
// L: open on logs, or leave logs
export function sheetLogs() {
  const s = ui();
  if (s.drawer) { setUi({ drawer: false }); return sheetOpen("lines"); }
  if (!s.logs) return sheetOpen("lines");
  if (s.tab === "sys") return sheetTab("lines");
  sheetClose();
}
export function sheetSize() { setUi({ sheetD: ui().sheetD ? 0 : 1, sheetH: 0 }); saveSheet(); layoutUpdate(); }
export function sheetSet(h: number) { setUi({ sheetH: Math.round(Math.max(160, Math.min(innerHeight - (narrow() ? 60 : 80), h))) }); }
export function sheetSnap() {
  const hs = (narrow() ? [0.62, 0.9] : [0.45, 0.74]).map((f) => innerHeight * f), cur = sheetPx();
  const d = hs.reduce((best, v, k) => (Math.abs(v - cur) < Math.abs(hs[best] - cur) ? k : best), 0) as 0 | 1;
  setUi({ sheetD: d, sheetH: 0 }); saveSheet();
}
export { barPx, sheetPx };

// ---------- focus: galaxy, then a system, then one of its planets ----------
export function focusSystem(name: string | null) {
  setUi((s) => ({ focus: name, sel: null, planet: null, hoverSvc: null, ...(name && s.drawer ? { drawer: false, logs: false } : {}) }));
  sheetShow();
  logsScopeTo();
  writeRoute();
  layoutUpdate(false);
  Cz.refocus();
}
export function focusPlanet(svc: string | null) {
  const s = ui();
  if (!s.focus) return;
  const i = s.data && s.data.instances.find((x) => x.name === s.focus);
  if (svc && i && !i.containers.some((c) => c.service === svc)) svc = null;
  svc = svc || null;
  if ((s.planet || null) === svc) return;
  setUi(svc ? { planet: svc, sel: svc, hoverSvc: null } : { planet: null, hoverSvc: null });
  if (svc) { setLogs({ all: false }); logsOnly(`${s.focus}/${svc}`, true); }
  if (Cz.eng) Cz.eng.hlSvc = null;
  sheetShow();
  Cz.refocus();
}
// planet <-> row linking: hovering either highlights both
export function hlSvc(svc: string | null) {
  if (ui().hoverSvc === svc) return;
  setUi({ hoverSvc: svc });
  if (Cz.eng) { Cz.eng.hlSvc = svc; Cz.still(); }
}

// ---------- the create chooser: a tab of the sheet, opened from the black hole, N, or the palette ----------
export function openDrawer() {
  if (ui().drawer) return;
  setUi({ focus: null, planet: null, sel: null, confirm: null, drawer: true, logs: true, tab: "new" });
  if (!ui().cat) setUi((s) => ({ catForce: s.catForce + 1 }));
  sheetShow();
  Cz.refocus();
  // focus now, so keys typed right after N land in the field instead of firing shortcuts
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#sh-new input[name="name"]')?.focus({ preventScroll: true }));
}
export function closeDrawer() {
  if (!ui().drawer) return;
  setUi({ drawer: false, logs: false });
  sheetShow();
}

// ---------- actions on a system ----------
export function watchJob(job: Job, name: string | null) {
  const check = async () => {
    try {
      const j: Job = await genericAPIFetcher([`/api/jobs/${job.id}`, "get"]);
      if (!j.endedAt) return void setTimeout(check, 1500);
      if (!j.ok && name) setUi((s) => ({ lastError: { ...s.lastError, [name]: j.error || "" } }));
      if (!j.ok && !name) toast(j.error || "failed", true);
      if (j.ok) toast(`${j.kind} ${j.target || ""} ok`);
    } catch {}
  };
  setTimeout(check, 1500);
}

export async function act(kind: string, name: string, svc?: string) {
  if (kind === "logs") {
    const inst = ui().data?.instances.find((x) => x.name === name);
    const main = svc || (inst && mainOf(inst)?.service) || "";
    if (ui().focus !== name) focusSystem(name); setLogs({ all: false, railOpen: false }); logsOnly(`${name}/${main}`); return sheetOpen("lines");
  }
  if (kind === "ask") return setUi({ confirm: name });
  if (kind === "keep") return setUi({ confirm: null });
  setUi((s) => { const { [name]: _, ...rest } = s.lastError; return { lastError: rest }; });
  try {
    const r = await genericMutationFetcher(`/api/instances/${encodeURIComponent(name)}/${kind}`, { arg: { type: "post", rest: [kind === "remove" ? { confirm: name } : {}] } });
    // stay on a system while it is destroyed; the sheet lets go once it is gone
    if (kind === "remove") setUi({ confirm: null, planet: null });
    watchJob(r.job, name);
    actFollow(r.job.id);
    toast(`${kind} ${name} · progress in logs › activity (L)`);
  } catch (e) {
    setUi({ confirm: null });
    toast((e as Error).message, true);
  }
  refreshOverview();
}

// one service of a system onto a branch, tag or sha, or the project's pin when ref is null; only its containers are recreated
export async function switchSource(name: string, svc: string, ref: string | null, live = false) {
  setUi((s) => { const { [name]: _, ...rest } = s.lastError; return { lastError: rest }; });
  try {
    const r = await genericMutationFetcher(`/api/instances/${encodeURIComponent(name)}/source`, { arg: { type: "post", rest: [ref === null ? { svc, pinned: true } : { svc, ref, ...(live ? { live: true } : {}) }] } });
    watchJob(r.job, name);
    actFollow(r.job.id);
    toast(`switching ${svc} to ${ref ?? "the project's pin"}${live ? " (live)" : ""} · progress in logs › activity (L)`);
  } catch (e) {
    toast((e as Error).message, true);
  }
  refreshOverview();
}

// zrok share: answered inline, no job; the overview carries the result
export type ShareOpts = { public?: boolean; fe?: string; exposeAdmin?: boolean };
const sharing = (name: string, v: "share" | "unshare" | null) =>
  setUi((s) => { const { [name]: _, ...rest } = s.sharing; return { sharing: v ? { ...rest, [name]: v } : rest }; });
export async function shareSystem(name: string, opts: ShareOpts = {}) {
  if (ui().sharing[name]) return;
  sharing(name, "share");
  try {
    const out = await genericMutationFetcher(`/api/instances/${encodeURIComponent(name)}/share`, { arg: { type: "post", rest: [opts] } });
    const warns: string[] = out?.warnings ?? [];
    if (warns.length) toast(`${name} shared, with warnings: ${warns.join(" · ")}`, true);
    else toast(`${name} shared`);
  } catch (e) {
    toast((e as Error).message, true);
  }
  // stay busy until the overview carries the new state, so nothing flickers back
  await refreshOverview().catch(() => {});
  sharing(name, null);
}
export async function unshareSystem(name: string) {
  if (ui().sharing[name]) return;
  sharing(name, "unshare");
  try {
    await genericMutationFetcher(`/api/instances/${encodeURIComponent(name)}/unshare`, { arg: { type: "post", rest: [{}] } });
    toast(`${name} unshared`);
  } catch (e) {
    toast((e as Error).message, true);
  }
  await refreshOverview().catch(() => {});
  sharing(name, null);
}

export async function copy(text: string, done = "copied") {
  try { await navigator.clipboard.writeText(text); toast(done); } catch { toast("clipboard unavailable", true); }
}
export const toggleUi = (off?: boolean) => setUi((s) => ({ uiOff: off ?? !s.uiOff }));

// galaxy (WebGL) or lines (canvas 2D), remembered per viewer
// one whole view tree swaps for the other (each sets its own theme); the page crossfades between them
export function setView(v: View) {
  if (ui().view === v) return;
  try { localStorage.setItem("cosmos-view", v); } catch {}
  const apply = () => flushSync(() => setUi({ view: v }));
  if (RM.matches || !document.startViewTransition) return apply();
  document.startViewTransition(apply);
}
export const toggleView = () => setView(ui().view === "lines" ? "galaxy" : "lines");
