import { THREE } from "../../three";
import { NOISE, V_PLANE } from "../noise";

// protoplanetary disk after HL Tau: tapered power-law surface brightness, a dust-sublimation cavity, and a gap at every
// planet's orbit that deepens as that service comes up
export const ppMat = () => new THREE.ShaderMaterial({
  uniforms: { uSc: { value: 40 }, uRd: { value: 30 }, uIn: { value: 3 }, uL: { value: 1 }, uO: { value: 0 }, uC: { value: new THREE.Color() }, uG: { value: new Array(12).fill(-100) }, uGD: { value: new Array(12).fill(0) }, uGW: { value: new Array(12).fill(1) } },
  vertexShader: V_PLANE,
  fragmentShader: `uniform float uSc, uRd, uIn, uL, uO, uG[12], uGD[12], uGW[12]; uniform vec3 uC; varying vec2 vP; ${NOISE}
  void main(){
    float r = length(vP) * uSc, a = atan(vP.y, vP.x);
    float prof = pow(max(r, uIn) / uIn, -1.1) * exp(-pow(r / uRd, 4.)) * smoothstep(uIn * .6, uIn * 1.4, r);
    float gap = 1.;
    for (int i = 0; i < 12; i++) gap *= 1. - uGD[i] * exp(-pow((r - uG[i]) / uGW[i], 2.));
    float n = .8 + .35 * fbm(vec2(a * 2.5 + r * .08, r * .45));
    gl_FragColor = vec4(uC * prof * gap * n * uL * uO, 1.);
  }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});
