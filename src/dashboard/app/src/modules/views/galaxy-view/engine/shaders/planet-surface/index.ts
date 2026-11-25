// each surface sets alb (albedo), emi (self-light), spec, wrap (terminator softness), sh (slope shading); p is the body-frame point, Lo the body-frame light
export const PL_SURF = {
  // generic rocky world, hue seeded by the service name
  0: `float n = fbm(p * 2.1 + uSeed, O), m = fbm(p * 6. + uSeed.zxy, O);
    alb = mix(uTint * .32, uTint * .8, smoothstep(.3, .7, n));
    alb = mix(alb, uTint * .95 + .06, smoothstep(.62, .8, m) * .45);
    if (FULL) { vec2 cr = crat(p, Lo, 5., .45); alb *= 1. + cr.x; sh = cr.y * .3; }`,
  // k1 ringed gas giant: soft butterscotch bands, bright equatorial zone, blue-grey pole; the ring's shadow falls across it
  1: `float lon = atan(p.z, p.x);
    float y = p.y + (fbm(p * vec3(2.5, 12., 2.5) + vec3(uT * .01, 0., 0.), O) - .5) * .012;
    float ay = abs(y);
    alb = vec3(.88, .72, .44);
    alb = mix(alb, vec3(.96, .88, .66), smoothstep(.2, .02, ay) * .85);
    alb = mix(alb, vec3(.74, .56, .33), (smoothstep(.2, .26, ay) - smoothstep(.34, .42, ay)) * .7);
    alb = mix(alb, vec3(.8, .64, .4), (.5 + .5 * sin(ay * 46. + 1.2)) * smoothstep(.36, .5, ay) * .45);
    alb *= .97 + .025 * sin(y * 120.) + .05 * (fbm(p * vec3(3., 40., 3.), O) - .5);
    float pol = smoothstep(.8, .93, ay);
    alb = mix(alb, vec3(.52, .6, .62), pol * .65);
    float hex = abs(cos(3. * lon)) * .03;
    alb = mix(alb, vec3(.5, .56, .58), smoothstep(.9 + hex, .93 + hex, y) * .18);
    alb *= mix(1., .7, pow(1. - ndv, 2.2));
    if (Lo.y * p.y < 0.) { vec3 hp = p + Lo * (-p.y / Lo.y); alb *= 1. - .82 * ringD(length(hp.xz)); }
    wrap = .12;`,
  // k2 banded gas giant: cream zones, rust belts with turbulent edges, a great red storm in the south equatorial belt
  2: `float lon = atan(p.z, p.x);
    vec3 q = p * vec3(2.2, 7., 2.2);
    float w1 = fbm(q + vec3(uT * .015, 0., 0.), O);
    float w2 = fbm(q * 1.8 + vec3(w1 * 2.6, w1, 0.), O);
    float y0 = -.37, lon0 = .9;  // the storm drawn larger than life so it reads at planet-icon size
    float dl = lon - lon0; dl = dl - 6.28318 * floor((dl + 3.14159) / 6.28318);
    vec2 e = vec2(dl * .93 / .3, (p.y - y0) / .125);
    float er = length(e);
    float y = p.y + (w2 - .5) * (.06 + .07 * smoothstep(.1, .5, abs(p.y)));
    y += e.y / max(er, .001) * .045 * smoothstep(2.2, 1., er) * step(.5, er);
    float ay = abs(y);
    float belt = 0.;
    belt += smoothstep(.1, .14, y) * (1. - smoothstep(.29, .34, y));
    belt += smoothstep(-.12, -.15, y) * (1. - smoothstep(-.3, -.36, y)) * .95;
    belt += (smoothstep(.43, .47, ay) - smoothstep(.53, .57, ay)) * .6;
    belt += (.5 + .5 * sin(ay * 42. + 2.)) * smoothstep(.58, .7, ay) * .5;
    vec3 zone = vec3(.95, .9, .79), rust = mix(vec3(.52, .31, .2), vec3(.78, .52, .33), fbm(q * 1.3 + 4., O));
    alb = mix(zone, rust, clamp(belt, 0., 1.));
    alb = mix(alb, vec3(.86, .73, .56), smoothstep(.11, .0, ay) * .45);
    float tb = fbm(q * 3.4 + w2 * 3., O);
    alb *= .86 + .28 * tb;
    alb = mix(alb, vec3(.42, .24, .17), smoothstep(.62, .8, tb) * belt * .45);
    alb = mix(alb, vec3(.97, .95, .9), smoothstep(.66, .8, w2) * (1. - belt) * .35);
    float fes = smoothstep(.58, .78, fbm(p * vec3(7., 26., 7.) + w1 * 2., O)) * smoothstep(.06, .1, y) * (1. - smoothstep(.13, .17, y));
    alb = mix(alb, vec3(.36, .32, .33), fes * .7);
    alb = mix(alb, vec3(.56, .55, .56), smoothstep(.7, .95, ay) * .55);
    float a = atan(e.y, e.x) + (1. - clamp(er, 0., 1.)) * 5. + uT * .05;
    float sw = fbm(vec3(cos(a) * er, sin(a) * er, 0.) * 2.4 + 7., O);
    vec3 grs = mix(vec3(.68, .26, .15), vec3(.88, .48, .3), sw);
    alb = mix(alb, grs, smoothstep(1., .6, er));
    alb = mix(alb, vec3(.96, .92, .84), exp(-pow((er - 1.15) * 5., 2.)) * .55);
    alb *= mix(1., .68, pow(1. - ndv, 2.2));
    wrap = .12;`,
  // k3 desert world: rust and butterscotch dust, dark albedo maria, white polar caps with ragged edges, faint craters
  3: `float n = fbm(p * 1.6 + 3.1, O), n2 = fbm(p * 7.5 + 1.3, O);
    alb = mix(vec3(.66, .3, .15), vec3(.82, .5, .3), smoothstep(.3, .72, n2));
    alb = mix(alb, vec3(.34, .16, .09), smoothstep(.54, .66, n) * .85);
    alb = mix(alb, vec3(.9, .64, .44), smoothstep(.72, .85, fbm(p * 3. + 8., O)) * .4);
    if (FULL) { vec2 cr = crat(p, Lo, 11., .06); alb *= 1. + cr.x * .35; sh = cr.y * .08; }
    float cap = smoothstep(.915, .935, abs(p.y) + (n2 - .5) * .08 + (p.y > 0. ? .015 : 0.));
    alb = mix(alb, vec3(.96, .95, .93), cap);
    alb = mix(alb, vec3(.9, .62, .5), pow(1. - ndv, 3.) * .35);`,
  // k4 airless rock: grey, saturated with craters at every scale, bright rays, hard terminator
  4: `alb = vec3(.5, .48, .45) * (.78 + .4 * fbm(p * 4. + 2., O));
    alb *= .9 + .2 * fbm(p * 18., O);
    if (FULL) {
      vec2 a = crat(p, Lo, 4., .5), b = crat(p, Lo, 9., .6), c = crat(p, Lo, 20., .7);
      alb *= 1. + a.x + b.x * .8 + c.x * .6; sh = a.y * .4 + b.y * .28 + c.y * .16;
      float ray = pow(rdg(p * 5. + 4.), 14.) * smoothstep(.5, .8, fbm(p * 2. + 9., 3));
      alb += ray * .12;
    } else alb *= .85 + .3 * vn3(p * 9.);`,
  // k5 living world: navy oceans with sun glint, green and tan continents, ice, clouds, city lights at night
  5: `float h = fbm(p * 1.7 + 11.3, O) + (fbm(p * 5.5, O) - .5) * .18;
    float land = smoothstep(.505, .52, h), lat = abs(p.y);
    vec3 sea = mix(vec3(.01, .07, .2), vec3(.03, .24, .42), smoothstep(.38, .505, h));
    float dry = smoothstep(.55, .7, fbm(p * 3. + 4., O)) * smoothstep(.55, .2, abs(lat - .35) * 2.);
    vec3 grd = mix(vec3(.16, .3, .1), vec3(.62, .52, .33), dry);
    grd = mix(grd, vec3(.4, .36, .28), smoothstep(.6, .72, h));
    alb = mix(sea, grd, land);
    float ice = smoothstep(.8, .86, lat + (fbm(p * 6., O) - .5) * .12);
    alb = mix(alb, vec3(.92, .95, .98), ice);
    float cs = uT * .012; vec3 cp = vec3(p.x * cos(cs) - p.z * sin(cs), p.y, p.x * sin(cs) + p.z * cos(cs));
    float wv = fbm(cp * 2.2 + 5., O);
    float cl = fbm(cp * vec3(3.6, 5.2, 3.6) + wv * 2.2, O);
    float cloud = smoothstep(.54, .7, cl) * (.75 + .25 * fbm(cp * 14., O));
    alb = mix(alb, vec3(.97), cloud * .95);
    spec = (1. - land) * (1. - cloud) * (1. - ice) * .75;
    float city = land * (1. - ice) * (1. - cloud * .85) * smoothstep(.7, .86, vn3(p * 130.)) * smoothstep(.5, .66, vn3(p * 11. + 2.)) * smoothstep(.54, .5, h);
    emi = vec3(1., .74, .4) * city * 1.4 * (1. - smoothstep(-.2, .05, ndl));
    wrap = .05;`,
  // k6 cracked ice moon: pale ice crossed by a network of bright lineae
  6: `alb = mix(vec3(.66, .72, .78), vec3(.86, .82, .74), fbm(p * 2.6 + 1., O));
    float w = fbm(p * 3., O), lines = 0., band = 0.;
    // lineae: long wandering great-circle cracks, the way an ice moon's ridges run for thousands of km
    for (int i = 0; i < 7; i++) {
      vec3 ax = normalize(h33(vec3(float(i) * 7.1, 3.3, 1.9)) - .5);
      float g = abs(dot(p, ax) + (vn3(p * 3. + float(i)) - .5) * .09);
      lines += exp(-g * g * 26000.) * (.6 + .4 * h13(vec3(float(i))));
      band += exp(-g * g * 900.);
    }
    lines += pow(rdg(p * 9. + w * 1.5), 34.) * .35 + pow(rdg(p * 19. + 2.), 44.) * .2;
    lines = clamp(lines, 0., 1.);
    alb = mix(alb, vec3(.6, .42, .32), clamp(band, 0., 1.) * .35);
    alb = mix(alb, vec3(.95, .99, 1.), lines);
    emi = vec3(.45, .8, 1.) * lines * .18;
    spec = .25;`,
  // k7 ocean world, always in motion: deep teal seas, fast differential cloud swirls
  7: `float n = fbm(p * 2.4 + 6., O);
    alb = mix(vec3(.01, .12, .24), vec3(.03, .38, .5), smoothstep(.3, .72, n));
    float tw = uT * .09 + p.y * 2.2;
    vec3 cp = vec3(p.x * cos(tw) - p.z * sin(tw), p.y, p.x * sin(tw) + p.z * cos(tw));
    float wv = fbm(cp * 2.6 + 2., O);
    float cl = fbm(cp * vec3(3., 6., 3.) + vec3(wv * 3., 0., wv * 2.), O);
    float cloud = smoothstep(.5, .74, cl);
    alb = mix(alb, vec3(.93, .97, 1.), cloud * .9);
    spec = (1. - cloud) * .9;
    wrap = .05;`,
  // k8 alien world: sickly green crust with faint bioluminescent veins
  8: `float w = fbm(p * 2.2 + 4., O);
    alb = mix(vec3(.12, .2, .04), vec3(.44, .6, .12), smoothstep(.3, .75, w));
    alb = mix(alb, vec3(.66, .74, .22), smoothstep(.62, .82, fbm(p * 6.5, O)) * .5);
    float v = pow(rdg(p * 3.6 + w * 2.), 16.) + pow(rdg(p * 9. + w * 3. + 1.), 26.) * .6;
    float pul = .65 + .35 * sin(uT * 1.1 + w * 9.);
    alb = mix(alb, vec3(.72, 1., .4), clamp(v, 0., 1.) * .35);
    emi = vec3(.5, 1., .26) * clamp(v, 0., 1.) * pul * .55;
    wrap = .08;`,
  // k9 volcanic forge: black basalt split by glowing lava fissures and a few calderas
  9: `float n = fbm(p * 4. + 3., O);
    alb = mix(vec3(.05, .045, .04), vec3(.17, .13, .11), n);
    float w = fbm(p * 2. + 1., O);
    float f = pow(rdg(p * 3.2 + w * 1.6), 13.), f2 = pow(rdg(p * 8. + w * 2.4 + 7.), 20.);
    float lava = clamp(f + f2 * .6, 0., 1.);
    if (FULL) { vec3 vv = vor(p * 3. + 2.); lava = max(lava, smoothstep(.13, .0, vv.x) * step(.72, vv.z)); }
    alb = mix(alb, vec3(.3, .06, .02), smoothstep(.1, .5, lava));
    float pul = .8 + .2 * sin(uT * .7 + n * 8.);
    emi = mix(vec3(.9, .16, .01), vec3(1., .78, .32), smoothstep(.55, 1., lava)) * lava * pul * 1.25;`,
  // k10 crystalline ice: faceted blue ice, bright facet seams, aurora curtains over both poles
  10: `float lon = atan(p.z, p.x);
    vec3 vc = FULL ? vor(p * 7.) : vec3(.5, .8, vn3(p * 7.));
    alb = mix(vec3(.48, .72, .9), vec3(.74, .9, .98), fbm(p * 2.5 + 1., O)) * (.9 + .16 * vc.z);
    alb = mix(alb, vec3(.95, .99, 1.), smoothstep(.035, .0, vc.y - vc.x) * .4);
    alb *= .92 + .12 * fbm(p * 14., O);
    N = normalize(N + (h33(vec3(vc.z * 97.)) - .5) * .18);
    alb = mix(alb, vec3(.86, .93, .98), smoothstep(.78, .9, abs(p.y)) * .6);
    spec = .6;
    float ay = abs(p.y);
    float band = smoothstep(.62, .74, ay) * (1. - smoothstep(.86, .96, ay));
    float cur = pow(.5 + .5 * sin(lon * 11. + fbm(p * 4. + uT * .15, 3) * 7. + uT * .4), 3.);
    emi = mix(vec3(.2, 1., .6), vec3(.55, .4, 1.), smoothstep(.72, .9, ay)) * band * cur * .75;
    wrap = .05;`,
  // k11 paper world: cream desert of terraced dunes, layers stacked like sheets of paper
  11: `float lon = atan(p.z, p.x);
    float w = fbm(p * 2.4 + 2., O);
    float s = p.y * 10. + w * 3.4 + sin(lon * 2. + p.y * 3.) * .4;
    float lay = floor(s), fr = fract(s);
    alb = mix(vec3(.95, .9, .78), vec3(.83, .73, .55), h11(lay + 3.) * .8);
    alb *= 1. - .3 * smoothstep(.8, 1., fr);
    alb += .05 * smoothstep(.12, 0., fr);
    alb *= .95 + .05 * sin(dot(p, vec3(46., 12., 30.)) + w * 22.);
    wrap = .08;`,
  // k12 blue ice giant: smooth ice giant, faint bands, a dark storm with bright companion clouds
  12: `float lon = atan(p.z, p.x);
    float y = p.y + (fbm(p * vec3(2., 7., 2.) + vec3(uT * .02, 0., 0.), O) - .5) * .06;
    alb = mix(vec3(.07, .22, .56), vec3(.16, .42, .84), .5 + .5 * sin(y * 8.));
    alb = mix(alb, vec3(.34, .62, .97), smoothstep(.5, .95, sin(y * 21. + 1.)) * .3);
    alb = mix(alb, vec3(.05, .17, .45), smoothstep(.55, .95, sin(y * 13. + 4.)) * .25);
    float dl = lon - 2.2; dl = dl - 6.28318 * floor((dl + 3.14159) / 6.28318);
    float ds = length(vec2(dl * .92 / .24, (p.y + .3) / .1));
    alb = mix(alb, vec3(.03, .1, .3), smoothstep(1., .5, ds) * .85);
    alb = mix(alb, vec3(.9, .95, 1.), exp(-pow((ds - 1.25) * 4., 2.)) * step(0., p.y + .3) * .5);
    float cir = smoothstep(.6, .78, fbm(p * vec3(3., 16., 3.) + 3., O)) * (smoothstep(.5, .2, abs(p.y + .22)) + smoothstep(.3, .1, abs(p.y - .45)) * .7);
    alb = mix(alb, vec3(.92, .96, 1.), cir * .7);
    alb = mix(alb, vec3(.5, .72, 1.), pow(1. - ndv, 2.) * .4);
    wrap = .15;`,
  // k13 precise graphite world: etched with a fine lat/long graticule and measuring ticks on the equator
  13: `float lat = asin(clamp(p.y, -1., 1.)), lon = atan(p.z, p.x);
    alb = vec3(.3, .33, .38) * (.88 + .18 * fbm(p * 3. + 5., O));
    float gx = lon / .2618, gy = lat / .2618;
    float lx = abs(fract(gx - .5) - .5) / max(fwidth(gx), 1e-4), ly = abs(fract(gy - .5) - .5) / max(fwidth(gy), 1e-4);
    float grid = 1. - min(min(lx, ly), 1.);
    float tx = lon / .0873, tk = 1. - min(abs(fract(tx - .5) - .5) / max(fwidth(tx), 1e-4), 1.);
    grid = max(grid, tk * step(abs(lat), .05));
    grid = max(grid, (1. - min(abs(lat) / max(fwidth(lat) * 1.5, 1e-4), 1.)));
    alb = mix(alb, vec3(.78, .9, 1.), grid * .32);
    emi = vec3(.45, .66, 1.) * grid * .1;
    spec = .35;`,
};
