import { THREE } from "../../three";

// the sky layer copied to screen; its bend near the hole is done by bhMat from the same texture
export const lensMat = new THREE.ShaderMaterial({
  uniforms: { tBg: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
  fragmentShader: `uniform sampler2D tBg; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tBg, vUv).rgb, 1.); }`,
  depthTest: false, depthWrite: false,
});
