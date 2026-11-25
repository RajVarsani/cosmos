import { THREE } from "../../three";
import { hash } from "@/lib/hash";
import { lookOf } from "@/domain/palette";
import { col3 } from "../../util";
import { PL_SURF } from "../planet-surface";
import { PL_LIB, PL_V } from "./lib";

export const planetMat = (svc: string, c: string) => {
  const lk = lookOf(svc);
  return new THREE.ShaderMaterial({
    defines: { K: lk.k },
    uniforms: {
      uS: { value: new THREE.Vector3() }, uO: { value: 1 }, uD: { value: 0 }, uQ: { value: 0 }, uT: { value: 0 }, uF: { value: 0 }, uR: { value: new THREE.Matrix3() },
      uLC: { value: new THREE.Color(1, 0.97, 0.92) }, uAtm: { value: col3(lk.atm || "#000000") }, uAtmK: { value: lk.atmK || 0 },
      uSeed: { value: new THREE.Vector3((hash(svc) % 997) / 31, (hash(svc + "y") % 997) / 31, (hash(svc + "z") % 997) / 31) }, uTint: { value: col3(c) },
    },
    vertexShader: PL_V,
    fragmentShader: `${PL_LIB}
    void main(){
      N = normalize(vN); L = normalize(uS - vW); V = normalize(cameraPosition - vW);
      ndl = dot(N, L); ndv = max(dot(N, V), 0.);
      vec3 p = normalize(vP), Lo = normalize(uR * L);
      bool FULL = uQ > .5; int O = FULL ? 5 : 2;
      vec3 alb = vec3(.5), emi = vec3(0.); float spec = 0., wrap = 0., sh = 0.;
      ${Object.entries(PL_SURF).map(([k, src], n) => `${n ? "#elif" : "#if"} K == ${k}\n{ ${src} }`).join("\n")}
      #endif
      if (uF > .01) { float cr = pow(rdg(p * 4.5 + 3.), 16.) + pow(rdg(p * 10. + 1.), 24.) * .6; alb *= 1. - .55 * uF; emi += vec3(1., .2, .08) * clamp(cr, 0., 1.) * uF * 1.2; }
      gl_FragColor = vec4(shade(alb, emi, spec, wrap, sh), uO);
    }`,
    transparent: true,
  });
};
