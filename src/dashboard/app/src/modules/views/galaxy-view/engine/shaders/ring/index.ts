import { THREE } from "../../three";
import { PL_LIB } from "../planet/lib";

// a ring system: C, B, a wide division, A with a narrow gap, F ringlet; the planet's shadow falls across them
export const ringMat = () => new THREE.ShaderMaterial({
  uniforms: { uS: { value: new THREE.Vector3() }, uPC: { value: new THREE.Vector3() }, uPR: { value: 1 }, uRN: { value: new THREE.Vector3(0, 1, 0) }, uO: { value: 1 }, uD: { value: 0 }, uQ: { value: 0 }, uLC: { value: new THREE.Color(1, 0.97, 0.92) } },
  vertexShader: `varying vec2 vR; varying vec3 vW; void main(){ vR = position.xy; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 uS, uPC, uRN, uLC; uniform float uPR, uO, uD, uQ; varying vec2 vR; varying vec3 vW;
  float h11(float x){ return fract(sin(x * 91.3458) * 47453.5453); }
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  ${PL_LIB.match(/float ringD[\s\S]*?\n  return[^\n]*\n/)![0]}
  void main(){
    float r = length(vR), d = ringD(r);
    if (d < .004) discard;
    vec3 col = mix(vec3(.55, .49, .42), vec3(.97, .89, .72), smoothstep(1.5, 1.72, r));
    col = mix(col, vec3(.86, .79, .66), smoothstep(1.96, 2.05, r));
    col *= (.92 + .16 * mix(.5, h11(floor(r * 300.) + 7.), 1. - smoothstep(.003, .01, fwidth(r)))) * 1.15;
    vec3 L = normalize(uS - vW), V = normalize(cameraPosition - vW);
    vec3 oc = uPC - vW; float b = dot(oc, L), sh = 1.;
    if (b > 0.) sh = smoothstep(uPR * uPR * .9, uPR * uPR * 1.02, dot(oc, oc) - b * b);
    float lt = dot(uRN, L), vt = dot(uRN, V);
    float lit = lt * vt > 0. ? .42 + .58 * abs(lt) : .16 + .55 * (1. - d) * (.4 + .6 * abs(lt));
    float fwd = pow(max(dot(-V, L), 0.), 5.) * (1. - d) * .8;
    float spark = uQ * step(.985, h21(floor(vR * 260.))) * pow(max(dot(reflect(-L, uRN * sign(vt)), V), 0.), 3.) * .9;
    vec3 c = col * uLC * (lit * sh + .025) + uLC * (fwd + spark) * sh;
    c = mix(c, vec3(dot(c, vec3(.3))) * .55, uD);
    gl_FragColor = vec4(c, clamp(d * 1.1, 0., 1.) * uO);
  }`,
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
});
