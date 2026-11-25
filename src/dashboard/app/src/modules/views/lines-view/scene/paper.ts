import { rng } from "@/lib/hash";

let url = "";

// a tile of paper grain and a few fibres in the pencil tone, made once and tiled as a css background
export function paperGrain(el: Element) {
  if (url) return url;
  const n = 192, cv = document.createElement("canvas");
  cv.width = cv.height = n;
  const c = cv.getContext("2d")!, r = rng(7);
  c.fillStyle = getComputedStyle(el).getPropertyValue("--ln-pencil").trim() || "gray";
  for (let i = 0; i < 5200; i++) { c.globalAlpha = 0.04 + r() * 0.1; c.fillRect(Math.floor(r() * n), Math.floor(r() * n), 1, 1); }
  c.strokeStyle = c.fillStyle; c.lineWidth = 0.5;
  for (let i = 0; i < 26; i++) {
    const x = r() * n, y = r() * n, a = r() * Math.PI, L = 6 + r() * 16;
    c.globalAlpha = 0.05 + r() * 0.06;
    c.beginPath(); c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(a) * L * 0.5 + (r() - 0.5) * 4, y + Math.sin(a) * L * 0.5 + (r() - 0.5) * 4, x + Math.cos(a) * L, y + Math.sin(a) * L);
    c.stroke();
  }
  url = `url(${cv.toDataURL()})`;
  return url;
}
