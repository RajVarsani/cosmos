import { THREE } from "../../three";

// backend satellite parts: flat-shaded metal lit by the star (same uniform contract as planetMat), with a specular glint
export const hullMat = (c: THREE.Color) => new THREE.ShaderMaterial({
  uniforms: { uC: { value: c }, uS: { value: new THREE.Vector3() }, uO: { value: 1 }, uD: { value: 0 } },
  vertexShader: `varying vec3 vN, vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 uC, uS; uniform float uO, uD; varying vec3 vN, vW;
  void main(){ vec3 L = normalize(uS - vW), V = normalize(cameraPosition - vW), H = normalize(L + V);
    float d = max(dot(vN, L), 0.), sp = pow(max(dot(vN, H), 0.), 24.), rim = pow(1. - abs(dot(vN, V)), 3.);
    vec3 c = uC * (.3 + .85 * d) + vec3(.7) * sp + uC * rim * .2;
    c = mix(c, vec3(dot(c, vec3(.3))) * .55, uD);
    gl_FragColor = vec4(c, uO); }`,
  transparent: true, side: THREE.DoubleSide,
});
