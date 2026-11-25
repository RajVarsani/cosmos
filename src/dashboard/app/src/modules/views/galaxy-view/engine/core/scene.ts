import { THREE } from "../three";
import { hlSvc } from "@/state/actions";
import { rng } from "@/lib/hash";
import { GX, armAngle } from "@/modules/scene/model/layout";
import { TAU, RS, clamp, lerp } from "../util";
import { TX, addSprite } from "../textures";
import { bhMat } from "../shaders/black-hole";
import { sweepMat } from "../shaders/sweep";
import { jetMat } from "../shaders/jet";
import { lensMat } from "../shaders/lens";
import { pointsMat } from "../shaders/points";
import { satGeos } from "../shaders/sat";
import { methods } from "@/modules/scene/types";
import { Cz } from "@/modules/scene/handle";

export const scene = methods({
  init(host: HTMLElement) {
    this.host = host;
    this.labels = host.querySelector("#cz-labels");
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.setClearColor(0x050507, 1);
    r.autoClear = false;
    r.domElement.className = "gl";
    this.el = r.domElement;
    host.prepend(r.domElement);
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(36, 1, 0.2, 20000);
    this.rt = new THREE.WebGLRenderTarget(2, 2, { samples: 4 });
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    lensMat.uniforms.tBg.value = this.rt.texture; bhMat.uniforms.tBg.value = this.rt.texture;
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lensMat));
    this.planetGeo = new THREE.SphereGeometry(1, 64, 40);
    this.ringGeo = new THREE.RingGeometry(1.2, 2.36, 160, 1);
    this.satGeo = satGeos();
    this.unitCircle = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 129 }, (_, k) => new THREE.Vector3(Math.cos((k / 128) * TAU), 0, Math.sin((k / 128) * TAU))));
    this.stripGeo = new THREE.PlaneGeometry(2, 2);
    this.ppGeo = new THREE.CircleGeometry(1, 192);
    this.sharedGeo = new Set([this.planetGeo, this.ringGeo, this.unitCircle, this.stripGeo, this.ppGeo, ...Object.values(this.satGeo)]);
    this.buildSky();
    this.buildCore();
    const ro = this.ro = new ResizeObserver(() => this.resize()); ro.observe(host);
    (this.io = new IntersectionObserver((es) => { this.vis = es[0].isIntersecting; this.wake(); })).observe(host);
    const el = r.domElement, signal = (this.ac = new AbortController()).signal;
    el.addEventListener("pointerdown", (e) => this.pdown(e), { signal });
    el.addEventListener("pointermove", (e) => this.pmove(e), { signal });
    el.addEventListener("pointerup", (e) => this.pup(e), { signal });
    el.addEventListener("pointercancel", () => { this.down = null; }, { signal });
    el.addEventListener("pointerleave", () => { if (!this.down) { this.setHover(null); this.setHoverSat(null); this.setHoverFree(false); if (this.hoverPl) { this.hoverPl = null; hlSvc(null); } } this.host.querySelector("#cz-tip").classList.remove("on"); }, { signal });
    el.addEventListener("wheel", (e) => this.wheel(e), { passive: false, signal });
    this.ok = true;
    this.resize();
  },
  buildSky() {
    const r = rng(42);
    // far stars, unlensed backdrop but drawn in the lensed layer so the hole bends them
    const N = 4200, pos = new Float32Array(N * 3), c = new Float32Array(N * 3), s = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const u = r() * 2 - 1, th = r() * TAU, rr = 6000 + r() * 3000, q = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * q * rr, u * rr * 0.7, Math.sin(th) * q * rr], k * 3);
      const h = r(), b = 0.25 + r() ** 2.2 * 0.9;
      const tint = h < 0.12 ? [1, 0.78, 0.6] : h < 0.3 ? [0.7, 0.8, 1] : h < 0.33 ? [1, 0.55, 0.85] : [0.92, 0.93, 1];
      c.set(tint.map((v) => v * b), k * 3);
      s[k] = 1 + r() ** 5 * 3.2;
    }
    this.stars = this.points(pos, c, s, "far", 1);
    // spiral arms: same log spiral the systems sit on
    const M = 11000, p2 = new Float32Array(M * 3), c2 = new Float32Array(M * 3), s2 = new Float32Array(M);
    const gauss = () => (r() + r() + r() + r() - 2) / 2;
    for (let k = 0; k < M; k++) {
      const haze = k % 5 === 0;
      let rad: number, th: number;
      if (haze) { rad = 20 + (-Math.log(1 - r() * 0.985)) * 70; th = r() * TAU; }
      else { rad = GX.ARM0 * Math.exp(r() ** 0.85 * 2.6); th = armAngle(rad, k % GX.ARMS) + gauss() * (0.1 + 7 / rad); }
      const sc = haze ? 0 : gauss() * (5 + rad * 0.06);
      const x = Math.cos(th) * rad + Math.cos(th + 1.57) * sc, z = Math.sin(th) * rad + Math.sin(th + 1.57) * sc;
      p2.set([x, gauss() * (2 + rad * 0.018), z], k * 3);
      const f = clamp((rad - 40) / 260, 0, 1), knot = !haze && r() < 0.035;
      let cc = knot ? [1, 0.42, 0.72] : [lerp(1, 0.5, f), lerp(0.78, 0.62, f), lerp(0.55, 1, f)];
      const b = haze ? 0.1 + r() * 0.08 : (0.26 + r() * 0.5) * (knot ? 1.5 : 1) * (1 - f * 0.3);
      c2.set(cc.map((v) => v * b), k * 3);
      s2[k] = haze ? 2.4 + r() * 2 : knot ? 3.5 + r() * 3 : 1.6 + r() ** 3 * 3.4;
    }
    this.dust = this.points(p2, c2, s2, "near", 1);
    // the bulge glow is not lensed (a glow centred on the lens would bend into a ring); the shadow's depth hides it
    this.bulge = addSprite(TX.glow, new THREE.Color("#ffb877"), 260, 0.55); this.scene.add(this.bulge);
    this.bulge2 = addSprite(TX.glow, new THREE.Color("#ff8a5c"), 620, 0.16); this.scene.add(this.bulge2);
  },
  points(pos: Float32Array, c: Float32Array, s: Float32Array, kind: string, layer: number) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aC", new THREE.BufferAttribute(c, 3));
    g.setAttribute("aS", new THREE.BufferAttribute(s, 1));
    const p = new THREE.Points(g, pointsMat(kind));
    p.layers.set(layer); p.frustumCulled = false;
    this.scene.add(p);
    return p;
  },
  buildCore() {
    // the hole, its disk and the bent sky are one camera-facing quad; the sphere only hides what is behind the shadow
    this.bh = new THREE.Mesh(this.stripGeo, bhMat);
    this.bh.renderOrder = -10; this.bh.frustumCulled = false; this.bh.scale.setScalar(bhMat.uniforms.uRb.value * 1.35);
    this.scene.add(this.bh);
    const shadow = new THREE.Mesh(new THREE.SphereGeometry(RS, 48, 32), new THREE.MeshBasicMaterial({ colorWrite: false }));
    shadow.renderOrder = -9;
    this.scene.add(shadow);
    this.sweep = new THREE.Mesh(new THREE.CircleGeometry(1, 180), sweepMat);
    this.sweep.rotation.x = -Math.PI / 2; this.sweep.position.y = -0.5;
    this.scene.add(this.sweep);
    this.coreGlow = addSprite(TX.glow, new THREE.Color("#ffcf9a"), 90, 0.35); this.scene.add(this.coreGlow);
    // an empty slot is only a dormant wisp that wakes on hover; no text
    this.newMark = new THREE.Group();
    this.newDot = addSprite(TX.glow, new THREE.Color("#cfd8ff"), 16, 0.04); this.newMark.add(this.newDot);
    this.scene.add(this.newMark);
    // relativistic jet, M87-like: one-sided by Doppler boosting, synchrotron blue-white, knots moving out
    this.bhJet = new THREE.Mesh(this.stripGeo, jetMat("#e4ecff", "#7d9dff", true));
    this.bhJet.scale.set(10, 170, 1); this.bhJet.renderOrder = 4; this.bhJet.visible = false;
    Object.assign(this.bhJet.material.uniforms, { uLen: { value: 170 }, uWid: { value: 10 }, uW0: { value: 0.5 }, uOpen: { value: 0.018 } });
    this.scene.add(this.bhJet);
    this.births = []; this.remnants = []; this.hc = 0;
    // a job accepted but not yet an instance: a dark globule at the seat the server will use
    this.newDark = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow, color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
    this.newDark.renderOrder = -1; this.newMark.add(this.newDark);
    this.newRim = addSprite(TX.glow, new THREE.Color("#7a4130"), 60, 0); this.newMark.add(this.newRim);
  },
  resize() {
    if (!this.ok) return;
    const r = this.host.getBoundingClientRect(), W = Math.max(1, r.width), H = Math.max(1, r.height), moved = W !== this.W || H !== this.H;
    this.W = W; this.H = H;
    this.pr = Math.min(window.devicePixelRatio || 1, 1.5) * (this.slow > 1 ? 0.75 : 1);
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setSize(this.W, this.H, false);
    this.rt.setSize(Math.round(this.W * this.pr), Math.round(this.H * this.pr));
    for (const p of [this.stars, this.dust]) p.material.uniforms.uPR.value = this.pr;
    this.cam.aspect = this.W / this.H;
    this.cam.updateProjectionMatrix();
    this.labelSizes = new WeakMap();
    // the observer's first call repeats the size init saw; reframing then would drop a pose carried over from the other view
    if (this.m && moved) this.refocus(true);
    this.still();
  },
  // unmount only: stop the loop, drop observers and canvas listeners, free the GL context
  dispose() {
    for (const [n, a] of this.anim) Cz.rot.set(n, a.rot || 0);
    this.ok = false;
    cancelAnimationFrame(this.raf); cancelAnimationFrame(this.stillRaf); this.raf = 0;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.ro?.disconnect(); this.io?.disconnect(); this.ac?.abort();
    this.rt?.dispose(); this.renderer?.dispose(); this.renderer?.domElement.remove();
  },
});
