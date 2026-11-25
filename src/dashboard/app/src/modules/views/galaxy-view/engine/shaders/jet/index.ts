import { THREE } from "../../three";
import { col3 } from "../../util";
import { NOISE } from "../noise";

// a collimated jet on a strip that turns about its own axis to face the camera; knots are bow shocks moving out at constant speed
export const jetMat = (c1: string, c2: string, oneSided: boolean) => new THREE.ShaderMaterial({
  uniforms: { uK: { value: new Array(8).fill(-1) }, uKI: { value: new Array(8).fill(0) }, uBeam: { value: 0 }, uLen: { value: 60 }, uWid: { value: 8 }, uW0: { value: 0.35 }, uOpen: { value: 0.06 }, uC1: { value: col3(c1) }, uC2: { value: col3(c2) }, uO: { value: 1 } },
  vertexShader: `varying vec2 vU; void main(){ vU = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: `uniform float uK[8], uKI[8], uBeam, uLen, uWid, uW0, uOpen, uO; uniform vec3 uC1, uC2; varying vec2 vU; ${NOISE}
  void main(){
    float x = vU.x * uWid, y = vU.y * uLen, ay = abs(y);
    float w = uW0 + ay * uOpen, side = ${oneSided ? "y > 0. ? 1. : .12" : "1."};
    float beam = uBeam * exp(-pow(x / w, 2.)) * exp(-ay / (uLen * .45)) * smoothstep(0., 3., ay);
    float kn = 0.;
    for (int i = 0; i < 8; i++) { if (uK[i] < 0.) continue; float bw = w * 1.7, s = ay + .6 * x * x / bw - uK[i];
      kn += uKI[i] * exp(-pow(s / (w * .9), 2.)) * exp(-pow(x / bw, 2.)); }
    float n = .7 + .6 * fbm(vec2(x * .6, y * .18));
    vec3 c = mix(uC1, uC2, clamp(ay / uLen, 0., 1.)) * (beam + kn * n) * side * uO * (1. - smoothstep(uLen * .8, uLen, ay));
    gl_FragColor = vec4(c, 1.);
  }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});
