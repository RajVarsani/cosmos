import { THREE } from "../three";

// the engine's own fields; methods are merged on top in ../index.ts
export const state = () => ({
  ok: false, raf: 0, last: 0, vis: true, t: 0, hover: null, hoverSat: null, hoverFree: false, down: null, flight: null, lastInput: -1e9, homeLock: true,
  camBusy: false, settleTimer: 0,
  sys: new Map(), anim: new Map(), hits: [], m: null, pr: 1, slow: 0, frames: 0,
  ctl: { tgt: new THREE.Vector3(), theta: 0.75, phi: 0.98, dist: 700, vt: 0, vp: 0, ox: 0, oy: 0 },
  ins: { r: 0, b: 0, avoid: [], top: 64 },
});
