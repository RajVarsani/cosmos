import { THREE } from "../three";
import { lookOf } from "@/domain/palette";
import { col3 } from "../util";
import { TX, addSprite } from "../textures";
import { planetMat } from "../shaders/planet";
import { atmoMat } from "../shaders/atmosphere";
import { ringMat } from "../shaders/ring";
import { hullMat } from "../shaders/hull";
import { methods } from "@/modules/scene/types";

export const planets = methods({
  planetOf(name: string, svc: string) { const o = this.sys.get(name); return o && o.planets.find((q: any) => q.p.svc === svc); },
  planetPos(name: string, svc: string, out: THREE.Vector3) { const q = this.planetOf(name, svc); return q ? q.mesh.getWorldPosition(out) : null; },
  makePlanet(o: any, p: any, s: any) {
    const look = lookOf(p.svc);
    const mesh = new THREE.Mesh(this.planetGeo, planetMat(p.svc, p.c));
    mesh.scale.setScalar(p.size);
    mesh.material.uniforms.uLC.value.lerp(col3(s.col), 0.18);
    let atmo: any = null, ring: any = null;
    if (look.atm) { atmo = new THREE.Mesh(this.planetGeo, atmoMat(look.atm, look.atmK, look.atmR)); atmo.scale.setScalar(look.atmR); atmo.renderOrder = 1; mesh.add(atmo); }
    if (look.ring) {
      // equatorial plane of the tilted body; the ring shares the planet's scale
      const tg = new THREE.Group(); tg.rotation.z = look.tilt;
      ring = new THREE.Mesh(this.ringGeo, ringMat()); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2;
      ring.material.uniforms.uLC.value.copy(mesh.material.uniforms.uLC.value);
      tg.add(ring); mesh.add(tg);
    }
    const halo = addSprite(TX.glow, col3(p.c), p.size * 7, 0);
    const line = new THREE.Line(this.unitCircle, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.scale.setScalar(p.orbit);
    o.pg.add(mesh); o.pg.add(halo); o.pg.add(line);
    let sat: any = null;
    if (p.sat) {
      // a small man-made satellite: grey bus, two solar wings tinted with the backend colour, a dish, a slow beacon.
      // local to the planet mesh (which carries the planet's size), so the frame divides that back out
      const G = this.satGeo, bc = col3(p.sat.col);
      const body = hullMat(new THREE.Color("#9aa1ab")), panel = hullMat(new THREE.Color("#1c2633").lerp(bc, 0.3)), trim = hullMat(new THREE.Color("#cfd4db"));
      const sg = new THREE.Group();
      sg.add(new THREE.Mesh(G.bus, body));
      for (const sx of [-1, 1]) {
        const strut = new THREE.Mesh(G.strut, trim); strut.position.x = sx * 0.6; sg.add(strut);
        const w = new THREE.Mesh(G.wing, panel); w.position.x = sx * 1.475; sg.add(w);
      }
      const dish = new THREE.Mesh(G.dish, trim); dish.position.set(0, 0.46, 0.1); dish.rotation.x = -0.5; sg.add(dish);
      const mast = new THREE.Mesh(G.mast, trim); mast.position.set(0, -0.5, -0.2); sg.add(mast);
      const beacon = new THREE.Mesh(G.beacon, new THREE.MeshBasicMaterial({ color: bc, transparent: true }));
      beacon.position.set(0, -0.66, -0.2); sg.add(beacon);
      const sHalo = addSprite(TX.glow, bc, 1, 0.15);
      mesh.add(sg); mesh.add(sHalo);
      sat = { g: sg, mats: [body, panel, trim], beacon, halo: sHalo };
    }
    return { p, mesh, halo, line, sat, look, atmo, ring, lod: 0, vis: 0, orbitCur: p.orbit, sizeCur: p.size, life: null };
  },
  dropPlanet(o: any, q: any) {
    for (const x of [q.mesh, q.halo, q.line]) o.pg.remove(x);
    for (const x of [q.mesh, q.halo, q.line]) x.traverse((y: any) => { if (y.geometry && !this.sharedGeo.has(y.geometry)) y.geometry.dispose(); if (y.material) y.material.dispose(); });
    o.pmap.delete(q.p.svc);
    o.planets = [...o.pmap.values()];
  },
});
