import { THREE } from "../../three";
import { col3 } from "../../util";

// atmosphere: a back-faced shell, brightest just outside the sunlit limb, with a thin forward-scatter ring when backlit
export const atmoMat = (c: string, k: number, r: number | undefined) => new THREE.ShaderMaterial({
  uniforms: { uS: { value: new THREE.Vector3() }, uC: { value: col3(c) }, uO: { value: 0 }, uK: { value: k }, uA: { value: r } },
  vertexShader: `varying vec3 vN, vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 uS, uC; uniform float uO, uK, uA; varying vec3 vN, vW;
  void main(){ vec3 N = normalize(vN), V = normalize(cameraPosition - vW), L = normalize(uS - vW);
    float lim = sqrt(1. - 1. / (uA * uA)), a = clamp(-dot(N, V) / lim, 0., 1.);
    float I = pow(a, 3.) * (smoothstep(-.45, .6, dot(N, L)) + pow(max(dot(-V, L), 0.), 6.) * 1.4);
    gl_FragColor = vec4(uC * I * uK * uO, 1.); }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
});
