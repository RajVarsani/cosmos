import { THREE } from "../../three";
import { esc } from "@/lib/format";
import { clamp } from "../../util";
import { methods } from "@/modules/scene/types";

export const remnants = methods({
  drawRemnants(nowS: number, dt: number, rm: boolean, labels: any[], proj: (v: THREE.Vector3) => any) {
    this.feedE = 0;
    for (const q of [...this.remnants]) {
      const age = nowS - q.t0;
      if (q.kind === "sn") {
        this.drawEjecta(q, age, dt, rm);
      } else {
        const u = clamp(age / q.dur, 0, 1);
        q.haze.material.opacity = 0.12 * (1 - u); q.haze.scale.multiplyScalar(1 + 0.004);
        if (q.error) {
          const sp = proj(q.pos);
          if (sp.z < 1) labels.push({ key: `gone:${q.name}`, x: sp.x, y: sp.y, r: 12, prio: 0, cls: "sys life bad", html: `<b>${esc(q.label || q.name)}</b><span><i class="bad"></i><em>failed</em> · ${esc(q.error.length > 90 ? `${q.error.slice(0, 87)}…` : q.error)}</span>`, pos: ["right", "left", "below", "above"] });
        }
      }
      if (q.kind === "sn" ? q.done : age >= q.dur) this.dropRemnant(q);
    }
  },

  dropRemnant(q: any) {
    for (const x of [q.haze, q.flash]) if (x) { this.scene.remove(x); x.material.dispose(); }
    if (q.pts) { this.scene.remove(q.pts); if (this.snPool.length < 4) this.snPool.push(q.pts); else { q.pts.geometry.dispose(); q.pts.material.dispose(); } }
    this.remnants.splice(this.remnants.indexOf(q), 1);
  },
});
