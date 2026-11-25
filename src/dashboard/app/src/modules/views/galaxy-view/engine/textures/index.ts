import { THREE } from "../three";
import { TAU } from "../util";

export function tex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
const radial = (stops: number[][]) => (g: CanvasRenderingContext2D, s: number) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
};
export const TX = {
  glow: tex(128, radial([[0, 1], [0.08, 0.7], [0.22, 0.22], [0.5, 0.05], [1, 0]])),
  core: tex(64, radial([[0, 1], [0.35, 0.95], [0.55, 0.35], [1, 0]])),
  spike: tex(256, (g, s) => {
    g.translate(s / 2, s / 2);
    for (let k = 0; k < 6; k++) {
      g.save(); g.rotate((k * Math.PI) / 3 + Math.PI / 6);
      const lg = g.createLinearGradient(0, 0, s / 2, 0);
      lg.addColorStop(0, "rgba(255,255,255,.9)"); lg.addColorStop(0.35, "rgba(255,255,255,.18)"); lg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = lg; g.beginPath(); g.moveTo(0, -1.4); g.lineTo(s / 2, 0); g.lineTo(0, 1.4); g.fill(); g.restore();
    }
    for (const k of [0, 1]) {
      g.save(); g.rotate(k * Math.PI / 2);
      const lg = g.createLinearGradient(-s / 2, 0, s / 2, 0);
      lg.addColorStop(0, "rgba(255,255,255,0)"); lg.addColorStop(0.5, "rgba(255,255,255,.35)"); lg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = lg; g.fillRect(-s / 2, -0.5, s, 1); g.restore();
    }
  }),
  ring: tex(128, (g, s) => { g.strokeStyle = "rgba(255,255,255,1)"; g.lineWidth = 2; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 3, 0, TAU); g.stroke(); }),
  dash: tex(128, (g, s) => { g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 1.6; g.setLineDash([5, 7]); g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 3, 0, TAU); g.stroke(); }),
};
export const addSprite = (map: THREE.Texture, color: THREE.ColorRepresentation, scale: number, op = 1, layer = 0) => {
  const m = new THREE.SpriteMaterial({ map, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.setScalar(scale); s.layers.set(layer); return s;
};
