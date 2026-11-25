import * as THREE from "three";

// set before any engine module builds a colour, so hex strings stay raw
THREE.ColorManagement.enabled = false;
export { THREE };
