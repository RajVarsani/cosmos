import { hlSvc } from "@/state/actions";
import { Cz } from "@/modules/scene/handle";
import { methods } from "@/modules/scene/types";

// one 2D canvas; no WebGL anywhere in this view. Colours come from the tokens on the view's root
export const scene = methods({
  init(host: HTMLElement) {
    this.host = host;
    this.labels = host.querySelector("#cz-labels");
    const cv = (this.cv = this.el = document.createElement("canvas"));
    cv.className = "ln";
    host.prepend(cv);
    this.ctx = cv.getContext("2d")!;
    const css = getComputedStyle(host), tok = (n: string) => css.getPropertyValue(n).trim();
    this.pal = Object.fromEntries(
      [["chalk", "--ln-chalk"], ["pencil", "--ln-pencil"], ["lead", "--ln-lead"], ["ghost", "--ln-ghost"], ["fe", "--legend-fe"], ["be", "--legend-be"], ["infra", "--legend-infra"], ["red", "--red"], ["amb", "--amb"]].map(([k, n]) => [k, tok(n)]),
    );
    (this.ro = new ResizeObserver(() => this.resize())).observe(host);
    (this.io = new IntersectionObserver((es) => { this.vis = es[0].isIntersecting; this.wake(); })).observe(host);
    const signal = (this.ac = new AbortController()).signal;
    cv.addEventListener("pointerdown", (e) => this.pdown(e), { signal });
    cv.addEventListener("pointermove", (e) => { this.pmove(e); this.still(); }, { signal });
    cv.addEventListener("pointerup", (e) => this.pup(e), { signal });
    cv.addEventListener("pointercancel", () => { this.down = null; }, { signal });
    cv.addEventListener("pointerleave", () => {
      if (!this.down) { this.setHover(null); this.setHoverSat(null); this.setHoverFree(false); this.hoverCore = false; if (this.hoverPl) { this.hoverPl = null; hlSvc(null); } }
      this.host.querySelector("#cz-tip").classList.remove("on");
    }, { signal });
    cv.addEventListener("wheel", (e) => this.wheel(e), { passive: false, signal });
    this.ok = true;
    this.resize();
  },
  resize() {
    if (!this.ok) return;
    const r = this.host.getBoundingClientRect(), W = Math.max(1, r.width), H = Math.max(1, r.height), moved = W !== this.W || H !== this.H;
    this.W = W; this.H = H;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.round(W * this.dpr); this.cv.height = Math.round(H * this.dpr);
    this.cam.aspect = W / H;
    this.cam.updateProjectionMatrix();
    this.labelSizes = new WeakMap();
    if (this.m && moved) this.refocus(true);
    this.still();
  },
  dispose() {
    for (const [n, o] of this.sys) Cz.rot.set(n, o.rot || 0);
    this.ok = false;
    cancelAnimationFrame(this.raf); clearTimeout(this.tmr); this.raf = 0; this.tmr = 0;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.ro?.disconnect(); this.io?.disconnect(); this.ac?.abort();
    this.cv?.remove();
  },
});
