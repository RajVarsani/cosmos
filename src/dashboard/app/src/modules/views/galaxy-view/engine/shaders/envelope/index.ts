import { THREE } from "../../three";
import { NOISE, V_PLANE } from "../noise";

// protostellar envelope after JWST's L1527: dense dust (absorbs the sky behind it) with light escaping up two outflow
// cavities and a dark lane where the disk shadows the midplane. Premultiplied: rgb emits, alpha absorbs. The cavities
// open and the envelope thins as the fraction grows (Class 0 -> I -> II)
export const envMat = () => new THREE.ShaderMaterial({
  uniforms: { uAx: { value: new THREE.Vector2(0, 1) }, uSin: { value: 1 }, uOpen: { value: 0.2 }, uD: { value: 1 }, uL: { value: 1 }, uO: { value: 0 }, uSeed: { value: 0 }, uC: { value: new THREE.Color() } },
  vertexShader: V_PLANE,
  fragmentShader: `uniform vec2 uAx; uniform float uSin, uOpen, uD, uL, uO, uSeed; uniform vec3 uC; varying vec2 vP; ${NOISE}
  void main(){
    vec2 p = vP; float r = length(p);
    float al = dot(p, uAx), ac = dot(p, vec2(-uAx.y, uAx.x)), a = abs(al) / max(uSin, .15);
    float w = uOpen * sqrt(a) * .55 + .015, n = fbm(p * 3.2 + uSeed), n2 = fbm(p * 8. - uSeed);
    float cone = smoothstep(w * 1.15, w * .6, abs(ac)) * smoothstep(0., .06, abs(al));
    float wall = exp(-pow((abs(ac) - w) / (.03 + .09 * a), 2.)) * smoothstep(0., .1, abs(al));
    float dens = exp(-pow(r / .6, 2.)) * (.5 + .75 * n) * (1. - cone * .9);
    float lane = exp(-pow(al / (.035 + .05 * r), 2.)) * exp(-pow(r / .45, 2.)) * uSin;
    float absorb = clamp((dens * 1.3 + lane * .9) * uD, 0., .93);
    float pole = (1. - uSin) * exp(-pow(r / (uOpen * .9 + .05), 2.));
    vec3 cav = mix(uC, vec3(.6, .72, 1.), .3);
    vec3 e = uC * wall * (.5 + .9 * n2) + cav * (cone * .3 * (.4 + n2) + pole * .8);
    e *= uL * exp(-r * 3.2) * (1. - lane * .85);
    gl_FragColor = vec4(e * uO, absorb * uO);
  }`,
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
});
