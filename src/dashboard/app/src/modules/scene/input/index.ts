import { focusPlanet, focusSystem, hlSvc, openDrawer } from "@/state/actions";
import { ui } from "@/state/ui-store";
import { esc, mib } from "@/lib/format";
import { RM } from "@/lib/motion/reduced";
import { clamp } from "../math";
import { PHI_MAX, PHI_MIN } from "../camera";
import { methods } from "../types";

export const input = methods({
  // ---------- input ----------
  xy(e: PointerEvent) { const r = this.el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; },
  pdown(e: PointerEvent) {
    const [x, y] = this.xy(e);
    this.down = { x, y, lx: x, ly: y, t: performance.now(), moved: false, id: e.pointerId, type: e.pointerType };
    this.ctl.vt = this.ctl.vp = 0;
  },
  pmove(e: PointerEvent) {
    const [x, y] = this.xy(e);
    const d = this.down;
    if (d && d.id === e.pointerId) {
      const dx = x - d.lx, dy = y - d.ly;
      if (!d.moved && Math.hypot(x - d.x, y - d.y) > 5) {
        d.moved = true;
        try { this.el.setPointerCapture(e.pointerId); } catch {}
        this.el.classList.add("drag");
        this.markBusy();
        // hover is frozen mid-drag (this branch returns before the hover pick below runs); drop any stale hover now
        this.hover = null; this.hoverSat = null; this.hoverFree = false;
        this.host.querySelector("#cz-tip").classList.remove("on");
      }
      if (d.moved) {
        const now = performance.now(), dt = Math.max(8, now - d.t) / 1000;
        const k = 0.0058, kp = d.type === "touch" ? 0 : 0.0042;
        this.ctl.theta += dx * k; this.ctl.phi = clamp(this.ctl.phi - dy * kp, PHI_MIN, PHI_MAX);
        this.ctl.vt = (dx * k) / dt * 0.6; this.ctl.vp = (-dy * kp) / dt * 0.6;
        d.t = now; this.lastInput = now; this.easeHome = false;
        this.still();
      }
      d.lx = x; d.ly = y;
      return;
    }
    const hit = this.pick(x, y);
    this.el.style.cursor = hit ? "pointer" : "";
    this.setHover(hit && hit.type === "sys" ? hit.name : null);
    this.setHoverSat(hit && hit.type === "sat" ? hit.id : null);
    this.setHoverFree(!!(hit && hit.type === "free"));
    this.hoverCore = !!(hit && hit.type === "core");
    const ps = hit && hit.type === "planet" ? hit.svc : null;
    if (ps || this.hoverPl) { this.hoverPl = ps; hlSvc(ps); }
    this.tip(hit, x, y);
  },
  pup(e: PointerEvent) {
    const d = this.down;
    this.down = null;
    this.el.classList.remove("drag");
    // no continuous rAF loop under reduced-motion to watch inertia decay away, so settle right away
    if (d && d.moved && RM.matches) this.scheduleSettle();
    if (!d || d.moved) return;
    const [x, y] = this.xy(e);
    const hit = this.pick(x, y);
    this.lastInput = performance.now();
    if (!hit) { if (ui().planet) focusPlanet(null); else if (ui().focus) focusSystem(null); return; }
    if (hit.type === "sys") focusSystem(hit.name);
    else if (hit.type === "planet") { if (ui().focus !== hit.name) focusSystem(hit.name); focusPlanet(hit.svc); }
    else if (hit.type === "free" || hit.type === "core") openDrawer();
  },
  wheel(e: WheelEvent) {
    e.preventDefault();
    const c = this.ctl, pg = ui().focus && ui().planet && this.planetGoal(ui().focus, ui().planet);
    const base = pg ? pg.dist : ui().focus ? this.focusGoal(this.m.systems.find((s: any) => s.name === ui().focus) || { pos: c.tgt, ext: 30 }).dist : (this.home || this.homeGoal()).dist;
    c.dist = clamp(c.dist * Math.exp(e.deltaY * (e.deltaMode ? 0.05 : 0.0012)), base * 0.3, base * 2.2);
    this.lastInput = performance.now(); this.easeHome = false; this.flight = null;
    this.markBusy(); this.scheduleSettle();
    this.still();
  },
  setHover(n: string | null) { if (n !== this.hover) { this.hover = n; this.still(); } },
  setHoverSat(id: string | null) { if (id !== this.hoverSat) { this.hoverSat = id; this.still(); } },
  setHoverFree(v: boolean) { if (v !== this.hoverFree) { this.hoverFree = v; this.still(); } },
  pick(x: number, y: number) {
    let best: any = null, bd = Infinity;
    for (const h of this.hits) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d > h.r) continue;
      const score = d - (h.type === "sat" ? 55 : h.type === "planet" ? 40 : 0);
      if (score < bd) { bd = score; best = h; }
    }
    return best;
  },
  tip(hit: any, x: number, y: number) {
    const tip = this.host.querySelector("#cz-tip"), d = ui().data;
    let html = "";
    if (hit && d) {
      if (hit.type === "free") html = "";
      else if (hit.type === "core") html = `<b>New system</b> <kbd>N</kbd><br>click the horizon · console :${this.m.core.port}`;
      else if (hit.type === "sat") html = `<b>${esc(hit.backend)}${hit.edgePort ? ` · via edge :${hit.edgePort}` : ""}</b>`;
      else if (hit.type === "planet") {
        const i = d.instances.find((q) => q.name === hit.name), c = i && i.containers.find((q) => q.service === hit.svc);
        if (c) html = `<b>${esc(c.service)}</b><br>:${esc(c.port ?? "—")} · ${c.running ? mib(c.memMiB) : esc(c.status)}${c.http && c.http.ok ? ` · ${c.http.status}` : ""}`;
      }
    }
    tip.innerHTML = html; tip.style.left = `${x}px`; tip.style.top = `${y}px`; tip.classList.toggle("on", !!html);
  },
});
