import { THREE } from "../../three";
import { clamp } from "../../util";

// blackbody colour (Helland's fit to the Planck locus), brightest channel = 1
export function bb(T: number, out = new THREE.Color()) {
  const t = T / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return out.setRGB(clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255);
}
// line emission: H-alpha 656nm, [S II] 672nm, [O III] 501nm as they read on narrowband plates
export const EM = { ha: new THREE.Color(1, 0.2, 0.16), s2: new THREE.Color(0.78, 0.08, 0.14), o3: new THREE.Color(0.22, 0.86, 0.76) };
// scattered starlight off dust is reddened
export const DUST = new THREE.Color(1, 0.62, 0.4);
