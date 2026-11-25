import { THREE } from "../../three";

export const pointsMat = (layer: string) => new THREE.ShaderMaterial({
  uniforms: { uPR: { value: 1 }, uO: { value: 1 } },
  vertexShader: `attribute float aS; attribute vec3 aC; varying vec3 vC; uniform float uPR;
    void main(){ vC = aC; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
      gl_PointSize = aS * uPR * (layer_att); }`.replace("(layer_att)", layer === "far" ? "1.0" : "clamp(420. / -mv.z, .35, 2.4)"),
  fragmentShader: `varying vec3 vC; uniform float uO; void main(){ vec2 d = gl_PointCoord - .5; float a = smoothstep(.5, .0, length(d)); gl_FragColor = vec4(vC * a * a * uO, 1.); }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
});
