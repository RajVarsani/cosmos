import * as THREE from "three";

// the lines engine's own fields; the camera is the same model as the galaxy's, used here only for its math
export const state = () => ({
  ok: false, raf: 0, tmr: 0, last: 0, lastDraw: 0, vis: true, fx: false, moving: false, t: 0,
  hover: null, hoverSat: null, hoverFree: false, hoverCore: false, hoverPl: null, hlSvc: null,
  down: null, flight: null, lastInput: -1e9, homeLock: true, easeHome: false, camBusy: false, settleTimer: 0,
  sys: new Map(), hits: [], m: null, dpr: 1, W: 0, H: 0, births: [], labelSizes: null, home: null, seen: false,
  cam: new THREE.PerspectiveCamera(36, 1, 0.2, 20000), vpm: new Float32Array(16), tanH: 1,
  ctl: { tgt: new THREE.Vector3(), theta: 0.75, phi: 0.98, dist: 700, vt: 0, vp: 0, ox: 0, oy: 0 },
  ins: { r: 0, b: 0, avoid: [], top: 64 },
});
