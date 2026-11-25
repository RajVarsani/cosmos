import { THREE } from "../../three";

// model units: bus 0.45 half-width (what p.sat.r scales to), struts to ±0.75, wings reach x = ±2.2
export const SAT_BUS = 0.45, SAT_SPAN = 2.2;
export function satGeos() {
  const wing = new THREE.BoxGeometry(1.45, 0.04, 0.62);
  return {
    bus: new THREE.BoxGeometry(0.9, 0.7, 0.7), strut: new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6).rotateZ(Math.PI / 2),
    wing, dish: new THREE.CylinderGeometry(0.3, 0.06, 0.12, 14, 1, true), mast: new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5),
    beacon: new THREE.SphereGeometry(0.09, 8, 6),
  };
}
