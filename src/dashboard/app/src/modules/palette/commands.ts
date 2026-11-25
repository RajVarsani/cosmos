import { bk } from "@/domain/palette";
import { mainOf, svcKind } from "@/domain/services";
import { canShare } from "@/domain/share";
import { LABEL, TRANSIT, lbl } from "@/domain/states";
import type { Instance } from "@/domain/types";
import { act, focusSystem, openDrawer, shareSystem, sheetLogs, sheetToggle, toggleUi, toggleView, unshareSystem } from "@/state/actions";
import { setUi, ui } from "@/state/ui-store";
import { recent } from "./recent";
import { score } from "./score";

export type Cmd = { id: string; g: string; t: string; sub?: string; k?: string; c?: string; dan?: boolean; run: () => void };

// context first, then systems, then actions
function inst(i: Instance, g: string, all: boolean): Cmd[] {
  const out: Cmd[] = [], busy = TRANSIT.has(i.state) && i.state !== "booting", live = i.containers.some((c) => c.running);
  const main = mainOf(i), s0 = ui();
  const fe = i.containers.find((c) => c.running && svcKind(c) === "fe" && (c.url || c.port));
  const url = i.url || (fe && (fe.url || `http://localhost:${fe.port}`));
  if (main) out.push({ id: `logs:${i.name}`, g, t: `Logs for ${lbl(i)}`, k: all ? "" : "L", run: () => act("logs", i.name, main.service) });
  if (url && live) out.push({ id: `open:${i.name}`, g, t: `Open ${lbl(i)}`, sub: url.replace(/^https?:\/\//, ""), run: () => window.open(url, "_blank", "noopener") });
  if (!s0.sharing[i.name]) {
    if (i.share) out.push({ id: `unshare:${i.name}`, g, t: `Unshare ${lbl(i)}`, sub: i.share.url.replace(/^https?:\/\//, ""), run: () => unshareSystem(i.name) });
    else if (canShare(i)) out.push({ id: `share:${i.name}`, g, t: `Share ${lbl(i)}`, sub: "zrok link, no password", run: () => shareSystem(i.name) });
  }
  if (!busy) out.push(live ? { id: `stop:${i.name}`, g, t: `Stop ${lbl(i)}`, run: () => act("stop", i.name) } : { id: `start:${i.name}`, g, t: `Start ${lbl(i)}`, run: () => act("start", i.name) });
  if (!busy) out.push({ id: `rm:${i.name}`, g, t: `Remove ${lbl(i)}…`, dan: true, run: () => {
    if (ui().focus !== i.name) focusSystem(i.name);
    setUi({ confirm: i.name });
    requestAnimationFrame(() => document.querySelector<HTMLElement>('#sbar [data-act="keep"]')?.focus({ preventScroll: true }));
  } });
  return out;
}

function all(q: string): Cmd[] {
  const s = ui(), d = s.data, out: Cmd[] = [];
  const f = s.focus && d ? d.instances.find((x) => x.name === s.focus) : undefined;
  if (f) { out.push(...inst(f, f.name, false)); out.push({ id: "home", g: lbl(f), t: "Back to galaxy", k: "esc", run: () => focusSystem(null) }); }
  if (d) for (const i of d.instances) out.push({ id: `go:${i.name}`, g: "Systems", t: lbl(i), sub: `${lbl(i) !== i.name ? `${i.name} · ` : ""}${i.backend} · ${LABEL[i.state] || i.state}`, c: bk(i.backend).c, run: () => focusSystem(i.name) });
  out.push({ id: "new", g: "Actions", t: "New system", k: "N", run: () => openDrawer() });
  out.push({ id: "logs", g: "Actions", t: s.logs && s.tab !== "sys" ? "Hide logs" : "Show logs", k: "L", run: () => sheetLogs() });
  if (f) out.push({ id: "exp", g: lbl(f), t: s.logs ? "Collapse details" : "Expand details", k: "E", run: () => sheetToggle() });
  out.push({ id: "view", g: "Actions", t: "Switch view", sub: "galaxy (3D) or lines (hand-drawn, light on the GPU)", k: "V", run: () => toggleView() });
  out.push({ id: "ui", g: "Actions", t: "Hide interface", k: "\\", run: () => toggleUi(true) });
  if (q && d) for (const i of d.instances) if (!f || i.name !== f.name) out.push(...inst(i, "Commands", true));
  return out;
}

export function commands(raw: string): Cmd[] {
  const q = raw.trim().toLowerCase();
  let items = all(q);
  if (q) return items.map((x) => ({ x, s: score(q, `${x.t} ${x.sub || ""}`) })).filter((o) => o.s >= 0).sort((a, b) => b.s - a.s).map((o) => o.x);
  const ctx = ui().focus || "";
  const rec = recent().map((id) => items.find((x) => x.id === id && x.g !== ctx)).filter((x): x is Cmd => !!x).slice(0, 4);
  return items.filter((x) => x.g === ctx).concat(rec.map((x) => ({ ...x, g: "Recent" })), items.filter((x) => x.g !== ctx && !rec.includes(x)));
}
