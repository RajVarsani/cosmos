import { THREE } from "../../three";
import { DISK_IN, DISK_OUT, RS } from "../../util";
import { NOISE } from "../noise";

// Schwarzschild black hole, ray-marched per pixel: every look (top-down, edge-on, below) comes from the same geodesics.
// Units inside the shader are the Schwarzschild radius rs; RS (the drawn shadow) is its critical impact parameter 2.6 rs.
// Photons: x'' = -1.5 h^2 x / r^5 (the exact null-geodesic bend written as a force), velocity Verlet with steps shrinking
// near the photon sphere. The disk is an optically thin slab: each crossing adds blackbody emission at g*T with g^4
// beaming (Doppler of the Keplerian flow times gravitational redshift) and absorbs what lies behind it.
export const bhMat = new THREE.ShaderMaterial({
  uniforms: {
    uT: { value: 0 }, uRs: { value: RS / 2.598 }, uRb: { value: DISK_OUT * 1.3 }, uIn: { value: DISK_IN }, uOut: { value: DISK_OUT },
    uHov: { value: 0 }, uFeed: { value: 0 }, uSteps: { value: 120 }, uK: { value: 0.1 }, uRip: { value: 0 }, uRipT: { value: 0 },
    tBg: { value: null }, uVP: { value: new THREE.Matrix4() },
  },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float uT, uRs, uRb, uIn, uOut, uHov, uFeed, uSteps, uK, uRip, uRipT; uniform sampler2D tBg; uniform mat4 uVP;
  varying vec3 vW; ${NOISE}
  float erf1(float x){ float e = exp(-x * x * (1.2732 + .147 * x * x) / (1. + .147 * x * x)); return sign(x) * sqrt(1. - e); }
  vec3 bbc(float T){ float t = T / 100.;
    float r = t <= 66. ? 1. : 1.2929 * pow(t - 60., -.1332);
    float g = t <= 66. ? .3901 * log(t) - .6318 : 1.1299 * pow(t - 60., -.0755);
    float b = t >= 66. ? 1. : t <= 19. ? 0. : .5432 * log(t - 10.) - 1.1963;
    return clamp(vec3(r, g, b), 0., 1.); }
  void main(){
    vec3 ro = cameraPosition / uRs, rd = normalize(vW - cameraPosition);
    float Rb = uRb / uRs, rin = uIn / uRs, rout = uOut / uRs;
    float bq = dot(ro, rd), disc = bq * bq - (dot(ro, ro) - Rb * Rb);
    if (disc <= 0.) discard;
    vec3 p = ro + rd * max(0., -bq - sqrt(disc)), v = rd;
    float h2 = dot(cross(p, v), cross(p, v));
    vec3 col = vec3(0.); float tr = 1.; bool cap = false;
    for (int i = 0; i < 260; i++) {
      if (float(i) >= uSteps) break;
      float r = length(p);
      if (r < 1.02) { cap = true; break; }
      if (r > Rb && dot(p, v) > 0.) break;
      // the bend fades out toward the edge of the quad so its rim meets the undistorted sky
      float dt = uK * r * clamp((r - 1.) * .7, .12, 1.);
      float w0 = 1. - smoothstep(Rb * .3, Rb * .75, r);
      vec3 a = -1.5 * h2 * p / pow(r, 5.) * w0;
      vec3 pn = p + v * dt + .5 * a * dt * dt;
      float rn = length(pn), w1 = 1. - smoothstep(Rb * .3, Rb * .75, rn);
      vec3 vn = v + .5 * (a - 1.5 * h2 * pn / pow(rn, 5.) * w1) * dt;
      // a gaussian slab of scale height H: the column along this step comes from erf, so no sampling bands
      vec3 pm = .5 * (p + pn);
      float rq = length(pm.xz), H = .035 * rq + .06;
      if ((p.y * pn.y < 0. || min(abs(p.y), abs(pn.y)) < 3. * H) && rq > rin * .9 && rq < rout * 1.3) {
        float L = length(pn - p), vy = (pn.y - p.y) / max(L, 1e-4);
        float col_ = abs(vy) < .02 ? L * exp(-pm.y * pm.y / (H * H)) : H * .8862 / abs(vy) * abs(erf1(pn.y / H) - erf1(p.y / H));
        if (col_ > 1e-4) {
          vec3 dir = normalize(v), q = pm;
          float x = rq / rin, phi = atan(q.z, q.x);
          // matter turns -phi (the arms trail); the pattern rides with it, inner faster (Kepler)
          float ang = phi + uT * 1.1 * pow(x, -1.5), a2 = ang + 3. * log(x);
          vec2 qq = vec2(cos(ang), sin(ang));
          float n1 = fbm(qq * rq * .9 + x * 1.7), n2 = fbm(vec2(cos(a2), sin(a2)) * 2.6 + vec2(0., log(x) * 10.));
          float dens = (.3 + 1.2 * n1 * n1) * (.45 + 1.1 * n2 * n2);
          float edge = smoothstep(.985, 1.015, x) * (1. - smoothstep(rout * .5, rout * 1.25, rq));
          // Shakura-Sunyaev temperature, then Doppler (Keplerian flow, spin -phi) and gravitational redshift
          float Te = 6200. * pow(x, -.75) * pow(max(1. - .7 / sqrt(x), .02), .25);
          vec3 u = normalize(vec3(q.z, 0., -q.x));
          float beta = min(.75, sqrt(1. / (2. * max(rq - 1., .5))));
          float D = sqrt(1. - beta * beta) / (1. - beta * dot(u, -dir));
          float g = D * sqrt(max(1. - 1. / rq, 0.));
          float tau = .9 * dens * edge * col_ / (2. * H * .8862);
          float al = 1. - exp(-tau);
          float I = pow(g, 3.5) * pow(Te / 6200., 1.6) * (1. + uHov * .75 + uFeed * .9 * smoothstep(3., 1., x));
          col += tr * al * bbc(clamp(g * Te, 1200., 30000.)) * I * 1.15;
          tr *= 1. - al * .92;
          if (tr < .02) break;
        }
      }
      p = pn; v = vn;
    }
    vec3 bg = vec3(0.);
    if (!cap) {
      vec3 wp = p * uRs + normalize(v) * 6000.;
      vec4 c = uVP * vec4(wp, 1.);
      if (c.w > 0.) {
        vec2 uv = c.xy / c.w * .5 + .5, d0 = uv - (uVP * vec4(0., 0., 0., 1.)).xy / (uVP * vec4(0., 0., 0., 1.)).w * .5 - .5;
        // hovering the horizon sends slow ripples out through the lensed sky
        uv += normalize(d0 + 1e-5) * uRip * .0025 * sin(length(d0) * 90. - uRipT * 4.) * exp(-length(d0) * 9.);
        bg = texture2D(tBg, clamp(uv, 0., 1.)).rgb;
      }
    }
    col = 1. - exp(-col * 1.6);
    gl_FragColor = vec4(bg * tr + col, 1.);
  }`,
  depthTest: false, depthWrite: false,
});
