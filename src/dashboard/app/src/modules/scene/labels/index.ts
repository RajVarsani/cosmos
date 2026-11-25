import { esc } from "@/lib/format";
import { LABEL } from "@/domain/states";
import { methods } from "../types";

export const labels = methods({
  // ---------- labels: screen-space, collision checked, next to their object ----------
  place(list: any[]) {
    const box = this.labels, seen = new Set();
    this.lab = this.lab || new Map();
    this.held = this.held || new Map();
    list.sort((a, b) => a.prio - b.prio);
    const W = this.W, H = this.H, placed: any[] = [];
    const top = this.ins.top, pad = 4;
    for (const q of this.ins.avoid) placed.push(q);
    for (const l of list) placed.push([l.x - Math.min(l.r, 6), l.y - Math.min(l.r, 6), Math.min(l.r, 6) * 2, Math.min(l.r, 6) * 2, true]);
    const hitAny = (x: number, y: number, w: number, h: number) => placed.some((q) => x < q[0] + q[2] + pad && x + w + pad > q[0] && y < q[1] + q[3] + pad && y + h + pad > q[1]);
    const panelL = W - this.ins.r, panelT = H - this.ins.b;
    for (const l of list) {
      seen.add(l.key);
      let el: any = this.lab.get(l.key);
      if (!el) {
        el = document.createElement("div");
        el.className = "gl-l";
        box.appendChild(el);
        this.lab.set(l.key, el);
      }
      const cls = `gl-l ${l.cls}`;
      if (el.dataset.cls !== cls) { el.className = cls; el.dataset.cls = cls; }
      if (el.dataset.html !== l.html) { el.innerHTML = l.html; el.dataset.html = l.html; el._w = 0; }
      if (l.focus) el.dataset.focus = l.focus; else delete el.dataset.focus;
      if (l.c) el.style.setProperty("--c", l.c);
      if (!el._w) {
        el.classList.remove("mini");
        el._w = el.offsetWidth; el._h = el.offsetHeight;
        el.classList.add("mini"); el._wm = el.offsetWidth; el._hm = el.offsetHeight; el.classList.remove("mini");
      }
      let pick: any = null, mini = false;
      const hd = l.hold && this.held.get(l.key);
      if (hd) { pick = [hd.side, l.x + hd.dx, l.y + hd.dy, hd.w, hd.h]; mini = hd.mini; }
      else for (const compact of l.prio < 3 ? [false, true] : [false]) {
      const w = compact ? el._wm : el._w, h = compact ? el._hm : el._h, g = 9;
      const cand = { right: [l.x + l.r + g, l.y - h / 2], left: [l.x - l.r - g - w, l.y - h / 2], below: [l.x - w / 2, l.y + l.r + g * 0.6], above: [l.x - w / 2, l.y - l.r - g * 0.6 - h] };
      const far = { right: [l.x + l.r + g * 3, l.y - h / 2 - 12], left: [l.x - l.r - g * 3 - w, l.y - h / 2 + 12], below: [l.x - w / 2, l.y + l.r + g * 2.4], above: [l.x - w / 2, l.y - l.r - g * 2.4 - h] };
      const tries = l.pos.map((k: string) => [k, (cand as any)[k]]).concat(l.prio < 3 ? l.pos.map((k: string) => [k, (far as any)[k]]) : []);
      for (const [k, [x, y]] of tries) {
        if (x < 8 || y < top || x + w > panelL - 8 || y + h > Math.min(H - 8, panelT - 4)) continue;
        if (hitAny(x, y, w, h)) continue;
        pick = [k, x, y, w, h]; break;
      }
      if (pick) { mini = compact; break; }
      }
      if (!pick) { if (el.style.opacity !== "0") el.style.opacity = "0"; el.style.pointerEvents = "none"; continue; }
      placed.push([pick[1], pick[2], pick[3], pick[4]]);
      if (l.hold && !hd) this.held.set(l.key, { side: pick[0], dx: pick[1] - l.x, dy: pick[2] - l.y, w: pick[3], h: pick[4], mini });
      el.classList.toggle("mini", mini);
      el.style.opacity = "1";
      el.style.pointerEvents = "";
      el.dataset.side = pick[0];
      el.style.transform = `translate3d(${Math.round(pick[1])}px,${Math.round(pick[2])}px,0)`;
    }
    for (const [k, el] of this.lab) if (!seen.has(k)) { el.remove(); this.lab.delete(k); }
    for (const k of this.held.keys()) if (!seen.has(k)) this.held.delete(k);
  },
});

// zrok share: cyan when live or starting, amber restarting or unavailable, muted stopped; the state is named unless live
const SH_CLS: Record<string, string> = { live: "sh", starting: "sh", restarting: "sh down", unavailable: "sh down", stopped: "sh off" };
export const shareMark = (s: any) => (s.shared ? `<u class="${SH_CLS[s.shareState] ?? "sh"}">${s.shareState && s.shareState !== "live" ? `shared · ${esc(s.shareState)}` : "shared"}</u>` : "");

export function sysLabel(s: any) {
  const n = s.planets.length + (s.belt ? s.belt.count : 0);
  const st = s.progress ? `${esc(LABEL[s.state] || s.state)} ${s.progress}` : esc(LABEL[s.state] || s.state);
  return `<b>${esc(s.label || s.name)}</b><span>${esc(s.backend)} · ${n} service${n === 1 ? "" : "s"} · <i class="${esc(s.st)}"></i><em>${st}</em>${shareMark(s)}</span>`;
}
