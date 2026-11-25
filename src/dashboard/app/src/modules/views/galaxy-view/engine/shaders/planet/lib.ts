export const PL_V = `uniform mat3 uR; varying vec3 vP, vN, vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vP = uR * position;
  gl_Position = projectionMatrix * viewMatrix * w; }`;
export const PL_LIB = `
uniform vec3 uS, uLC, uAtm, uSeed, uTint; uniform float uO, uD, uQ, uT, uAtmK, uF; uniform mat3 uR;
varying vec3 vP, vN, vW;
float h13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float h11(float x){ return fract(sin(x * 91.3458) * 47453.5453); }
float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1, 0, 0)), f.x), mix(h13(i + vec3(0, 1, 0)), h13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h13(i + vec3(0, 0, 1)), h13(i + vec3(1, 0, 1)), f.x), mix(h13(i + vec3(0, 1, 1)), h13(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float fbm(vec3 p, int o){ float s = 0., a = .5, n = 0.; for (int i = 0; i < 7; i++) { if (i >= o) break; s += a * vn3(p); n += a; p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= .5; } return s / n; }
float rdg(vec3 p){ return 1. - abs(vn3(p) * 2. - 1.); }
vec3 h33(vec3 p){ return vec3(h13(p), h13(p + 17.13), h13(p + 41.71)); }
// cellular: x = F1, y = F2, z = id of the nearest cell
vec3 vor(vec3 p){ vec3 i = floor(p), f = fract(p); float d1 = 9., d2 = 9., id = 0.;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(x, y, z), r = g + h33(i + g) - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = h13(i + g + 3.1); } else if (d < d2) d2 = d; }
  return vec3(sqrt(d1), sqrt(d2), id); }
// impact craters: x = albedo shift, y = slope term toward the light (walls facing the star brighten)
vec2 crat(vec3 p, vec3 Lo, float sc, float dens){ vec3 q = p * sc, i = floor(q), f = fract(q); float al = 0., sh = 0.;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(x, y, z), c = i + g; float h = h13(c); if (h > dens) continue;
    vec3 d = g + h33(c + 5.3) - f; float r = .22 + .3 * h13(c + 9.7), ld = length(d), l = ld / r;
    if (l > 1.7) continue;
    vec3 dir = -d / max(ld, 1e-4);
    float rim = exp(-pow((l - 1.) * 4.5, 2.));
    al += -.22 * (1. - smoothstep(.2, 1., l)) + .2 * rim + .06 * (1. - smoothstep(1., 1.7, l));
    sh += (l < 1. ? -1.3 * l : 1.1 * exp(-(l - 1.) * 5.)) * dot(dir, Lo); }
  return vec2(al, sh); }
// ringlet detail fades out once it gets finer than a pixel, so the rings never shimmer
float ringD(float r){
  float fw = fwidth(r), f1 = 1. - smoothstep(.004, .012, fw), f2 = 1. - smoothstep(.0015, .005, fw);
  float d = smoothstep(1.23, 1.27, r) * (1. - smoothstep(1.5, 1.53, r)) * (.2 + .08 * sin(r * 140.) * f1);
  float B = smoothstep(1.52, 1.57, r) * (1. - smoothstep(1.935, 1.95, r));
  d += B * (mix(.62, .97, smoothstep(1.56, 1.75, r)) + (.1 * sin(r * 70.) + .07 * sin(r * 190.) + .05 * sin(r * 410.) * f2) * f1);
  d += smoothstep(1.955, 1.975, r) * (1. - smoothstep(1.99, 2.01, r)) * .07;
  d += smoothstep(2.025, 2.045, r) * (1. - smoothstep(2.25, 2.27, r)) * .62 * (1. - .9 * exp(-pow((r - 2.215) * 140., 2.)) * f1) * (.92 + .08 * sin(r * 160.) * f1);
  d += exp(-pow((r - 2.33) * 90., 2.)) * .25 * f1;
  float g = .88 + .24 * mix(.5, h11(floor(r * 420.)), f2);
  return clamp(d * g, 0., 1.); }
vec3 N, L, V; float ndl, ndv;
vec3 shade(vec3 alb, vec3 emi, float spec, float wrap, float sh){
  float d = ndl + sh;
  float dif = clamp((d + wrap) / (1. + wrap), 0., 1.);
  dif = mix(dif, dif * dif * (3. - 2. * dif), .4);
  // night side keeps a faint cool fill so each world's identity still reads when it is between you and its star
  vec3 c = alb * (uLC * dif * 1.15 + vec3(.045, .048, .062) * (.4 + .6 * ndv));
  vec3 H = normalize(L + V);
  c += uLC * spec * pow(max(dot(N, H), 0.), 60.) * smoothstep(0., .15, ndl);
  float night = 1. - smoothstep(-.1, .2, ndl);
  c += emi * (.3 + .7 * night);
  c += uAtm * pow(1. - ndv, 3.2) * uAtmK * smoothstep(-.3, .5, ndl);
  return mix(c, vec3(dot(c, vec3(.3))) * .55, uD); }
`;
