import { THREE } from "../../three";
import { RS } from "../../util";
import { V_PLANE } from "../noise";

export const sweepMat = new THREE.ShaderMaterial({
  uniforms: { uA: { value: 0 }, uR: { value: 400 }, uC: { value: new THREE.Color("#bfe8ff") }, uI: { value: 1 }, uIn: { value: RS * 4 } },
  vertexShader: V_PLANE,
  fragmentShader: `uniform float uA, uR, uI, uIn; uniform vec3 uC; varying vec2 vP;
  void main(){
    float r = length(vP), a = atan(-vP.y, vP.x);
    float d = mod(uA - a, 6.28318);
    float trail = exp(-d * 2.6), edge = exp(-pow(d * 38., 2.)) + exp(-pow((6.28318 - d) * 38., 2.));
    float rf = smoothstep(uIn, uIn * 2.2, r) * (1. - smoothstep(uR * .7, uR, r));
    float I = (trail * .075 + edge * .3) * rf * uI;
    gl_FragColor = vec4(uC * I, 1.);
  }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});
