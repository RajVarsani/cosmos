import { THREE } from "./three";
import { GX } from "@/modules/scene/model/layout";

export { TAU, clamp, lerp, ease3, angDiff, sstep } from "@/modules/scene/math";
export const { RS, DISK_IN, DISK_OUT } = GX;
export const col3 = (c: string) => new THREE.Color(c.startsWith("hsl") ? c.replace(/ \/.*\)/, ")") : c);

// shared scratch
export const _c1 = new THREE.Color(), _c2 = new THREE.Color();
export const _eul = new THREE.Euler(0, 0, 0, "ZYX"), _m4 = new THREE.Matrix4(), _v3 = new THREE.Vector3(), _q4 = new THREE.Quaternion();
export const _fv = new THREE.Vector3(), _fd = new THREE.Vector3();
