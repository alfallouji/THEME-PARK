/**
 * Flat rides — everything that spins, swings or drops in place.
 *
 * Every builder returns `{ root, update(dt, t, st), camSeat }` where `st`
 * carries { power, running, night } from the owning Attraction. `power` is a
 * 0..1 ramp so rides spin up and coast down instead of snapping on.
 */
import * as THREE from 'three';
import * as M from '../../gfx/Materials.js';
import * as T from '../../gfx/Textures.js';
import * as C from './common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ================================================================== *
 * Carousel
 * ================================================================== */
function carouselHorse(seed) {
  const coats = [0xfff6e8, 0xd9a273, 0x4a3628, 0xe6b8c8, 0xc8d0dc];
  const body = M.paint(coats[seed % coats.length], { rough: 0.35 });
  const tack = M.paint(M.funColor(seed + 3), { rough: 0.4 });
  const gold = M.paint(0xffca4a, { rough: 0.3, metal: 0.6 });

  const parts = [];
  parts.push(M.box(1.0, 0.52, 0.38, body, 0, 0, 0));
  const chest = M.sphere(0.3, body, 0.42, 0.04, 0);
  chest.scale.set(0.62, 0.52, 0.42);
  parts.push(chest);
  // Neck + head.
  const neck = M.box(0.26, 0.5, 0.26, body, 0.5, 0.32, 0);
  neck.rotation.z = -0.5;
  parts.push(neck);
  const head = M.box(0.42, 0.22, 0.22, body, 0.78, 0.55, 0);
  head.rotation.z = -0.25;
  parts.push(head);
  parts.push(M.box(0.1, 0.16, 0.08, body, 0.66, 0.72, 0.08));
  parts.push(M.box(0.1, 0.16, 0.08, body, 0.66, 0.72, -0.08));
  // Legs, front pair kicked forward.
  const legs = [[0.34, 0.5], [0.26, -0.5], [-0.34, 0.3], [-0.4, -0.3]];
  legs.forEach(([x, rot]) => {
    for (const s of [-1, 1]) {
      const leg = M.box(0.13, 0.56, 0.13, body, x, -0.42, s * 0.13);
      leg.rotation.z = rot * 0.5;
      parts.push(leg);
    }
  });
  // Mane + tail.
  for (let i = 0; i < 5; i++) {
    parts.push(M.box(0.07, 0.26, 0.2, tack, 0.5 - i * 0.09, 0.5 - i * 0.03, 0));
  }
  const tail = M.cone(0.13, 0.5, tack, -0.56, 0.1, 0);
  tail.rotation.z = 1.9;
  parts.push(tail);
  // Saddle + gold trim.
  parts.push(M.box(0.42, 0.14, 0.44, tack, 0.02, 0.3, 0));
  parts.push(M.box(0.46, 0.05, 0.48, gold, 0.02, 0.38, 0));

  // 20 boxes per horse × 12 horses is not worth 240 draw calls.
  const g = new THREE.Group();
  const merged = M.mergeColored(parts);
  if (merged) g.add(merged);
  return g;
}

export function carousel(ctx) {
  const root = new THREE.Group();
  const R = 3.5;
  const horseCount = 12;
  const accent = M.funColor(ctx.seed);

  root.add(C.basePad(ctx.w, ctx.h));
  root.add(C.deck(R + 0.6, 0.45, 0xcf3f52, 0x8f2b3c));

  const spinner = new THREE.Group();
  spinner.position.y = 0.45;
  root.add(spinner);

  // Mirrored centre column.
  const gold = M.mat('caro-gold', { color: 0xffca4a, roughness: 0.22, metalness: 0.92 });
  spinner.add(M.cyl(0.75, 4.2, M.mat('caro-mirror', {
    color: 0xfff0d0, roughness: 0.15, metalness: 0.7,
  }), 0, 2.1, 0, 20));
  spinner.add(M.cyl(0.95, 0.24, gold, 0, 0.12, 0, 20));
  spinner.add(M.cyl(0.95, 0.24, gold, 0, 4.1, 0, 20));

  // Striped canopy.
  const canopyGeo = new THREE.ConeGeometry(R + 0.9, 1.7, 24, 1, true);
  const canopy = new THREE.Mesh(canopyGeo, M.canopy('#e6455c', '#fff6e8', 24));
  canopy.position.y = 5.0;
  canopy.castShadow = true;
  spinner.add(canopy);
  spinner.add(M.cone(0.42, 0.9, gold, 0, 6.2, 0, 12));
  spinner.add(M.sphere(0.2, M.glow(0xffe9b0, 3.4), 0, 6.8, 0));

  // Scalloped valance under the canopy rim.
  const valGeo = new THREE.CylinderGeometry(R + 0.9, R + 0.85, 0.5, 24, 1, true);
  const valance = new THREE.Mesh(valGeo, M.canopy('#ffd76a', '#e6455c', 24));
  valance.position.y = 3.95;
  spinner.add(valance);

  const bulbs = C.bulbRing(R + 0.92, 26, 4.2, 0xffe9b0, 0.11);
  spinner.add(bulbs);

  // Horses on brass poles.
  const horses = [];
  for (let i = 0; i < horseCount; i++) {
    const a = (i / horseCount) * Math.PI * 2;
    const ring = i % 2 === 0 ? R - 0.35 : R - 1.5;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * ring, 0, Math.sin(a) * ring);
    pivot.rotation.y = -a + Math.PI / 2;
    spinner.add(pivot);

    pivot.add(M.cyl(0.05, 4.0, gold, 0, 2.0, 0, 8));
    const horse = carouselHorse(i + ctx.seed);
    horse.position.y = 1.45;
    pivot.add(horse);

    const rider = C.seatedRider(i * 3 + ctx.seed);
    rider.position.set(0, 0.28, 0);
    rider.rotation.y = -Math.PI / 2;
    horse.add(rider);
    rider.visible = false;

    horses.push({ horse, rider, phase: (i / horseCount) * Math.PI * 2, base: 1.45 });
  }

  root.add(C.fenceRing(R + 1.9, 30));
  const booth = C.operatorBooth(accent);
  booth.position.set(R + 1.4, 0, R + 1.4);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 2.4, 0);
  horses[0].horse.add(camSeat);

  let spin = 0;
  return {
    root, camSeat,
    bulbMats: [bulbs.userData.bulbMat],
    update(dt, t, st) {
      spin += dt * st.power * 0.85;
      spinner.rotation.y = spin;
      for (const h of horses) {
        h.horse.position.y = h.base + Math.sin(spin * 3 + h.phase) * 0.42 * st.power;
        h.rider.visible = st.riders > 0;
      }
    },
  };
}

/* ================================================================== *
 * Wave Swinger
 * ================================================================== */
export function waveSwinger(ctx) {
  const root = new THREE.Group();
  const towerH = 8.2;
  const discR = 2.4;
  const chainLen = 3.4;
  const seatCount = 20;

  root.add(C.basePad(ctx.w, ctx.h));
  root.add(C.deck(4.6, 0.4, 0x3b8fe0, 0x27406b));

  const steel = M.steel(0xd8dee8, 0.35);
  root.add(C.column(0.55, towerH, steel));

  const head = new THREE.Group();
  head.position.y = towerH;
  root.add(head);

  // Rotating hub with a scalloped roof.
  const hub = new THREE.Group();
  head.add(hub);
  hub.add(M.cyl(discR, 0.36, M.paint(0xffc23c, { rough: 0.5 }), 0, -0.18, 0, 24));
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(discR + 1.5, 1.5, 24, 1, true),
    M.canopy('#a06cf0', '#ffd76a', 24),
  );
  roof.position.y = 0.9;
  roof.castShadow = true;
  hub.add(roof);
  hub.add(M.cone(0.3, 0.8, M.mat('sw-gold', { color: 0xffca4a, roughness: 0.25, metalness: 0.9 }), 0, 1.9, 0, 10));
  const bulbs = C.bulbRing(discR + 1.5, 24, 0.22, 0xfff0c0, 0.1);
  hub.add(bulbs);

  // Swings: a pivot per seat so chains fan out under centrifugal force.
  const swings = [];
  const chainMat = M.bar(0xaab4c4);
  for (let i = 0; i < seatCount; i++) {
    const a = (i / seatCount) * Math.PI * 2;
    const anchor = new THREE.Group();
    anchor.position.set(Math.cos(a) * discR, -0.2, Math.sin(a) * discR);
    anchor.rotation.y = -a;
    hub.add(anchor);

    const swing = new THREE.Group();
    anchor.add(swing);
    for (const s of [-1, 1]) {
      const ch = C.chain(chainLen, chainMat, 0.028);
      ch.position.x = s * 0.26;
      swing.add(ch);
    }
    const seat = new THREE.Group();
    seat.position.y = -chainLen;
    swing.add(seat);
    seat.add(M.box(0.62, 0.1, 0.5, M.enamel(M.funColor(i)), 0, 0, 0));
    seat.add(M.box(0.62, 0.5, 0.08, M.enamel(M.funColor(i)), 0, 0.25, -0.22));
    seat.add(M.box(0.66, 0.06, 0.06, M.bar(0xc8d0dc), 0, 0.3, 0.24));

    const rider = C.seatedRider(i + ctx.seed);
    rider.position.set(0, 0.02, 0.02);
    rider.visible = false;
    seat.add(rider);

    swings.push({ swing, rider });
  }

  root.add(C.fenceRing(6.4, 34));
  const booth = C.operatorBooth(0xa06cf0);
  booth.position.set(5.2, 0, 5.2);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 0.7, 0.5);
  swings[0].swing.add(camSeat);

  let spin = 0;
  return {
    root, camSeat,
    bulbMats: [bulbs.userData.bulbMat],
    update(dt, t, st) {
      spin += dt * st.power * 1.5;
      hub.rotation.y = spin;
      // Fly-out angle plus a little wobble so the ring isn't perfectly rigid.
      const fly = st.power * st.power * 0.95;
      hub.position.y = st.power * 1.8;
      for (let i = 0; i < swings.length; i++) {
        const s = swings[i];
        s.swing.rotation.z = -fly - Math.sin(spin * 2 + i * 0.7) * 0.06 * st.power;
        s.swing.rotation.x = Math.sin(spin * 1.3 + i) * 0.05 * st.power;
        s.rider.visible = st.riders > 0;
      }
    },
  };
}

/* ================================================================== *
 * Pirate Ship
 * ================================================================== */
export function pirateShip(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h));

  const steel = M.steel(0xc23b4e, 0.4);
  const pivotY = 8.0;
  for (const z of [-1.7, 1.7]) {
    const f = C.aFrame(pivotY, 3.4, steel, 0.26);
    f.position.z = z;
    root.add(f);
  }
  root.add(M.cyl(0.2, 3.8, M.bar(0xc8d0dc), 0, pivotY, 0, 10).rotateX(Math.PI / 2));

  const pivot = new THREE.Group();
  pivot.position.y = pivotY;
  root.add(pivot);

  // Arm down to the hull.
  const armMat = M.steel(0xe0e6ef, 0.3);
  for (const s of [-1, 1]) {
    pivot.add(M.strut(V(0, 0, s * 1.2), V(0, -5.4, s * 1.2), 0.2, armMat));
  }

  // Hull built from an extruded boat profile.
  const shape = new THREE.Shape();
  shape.moveTo(-3.6, 0.9);
  shape.quadraticCurveTo(-3.9, -0.3, -2.4, -0.85);
  shape.lineTo(2.4, -0.85);
  shape.quadraticCurveTo(3.9, -0.3, 3.6, 0.9);
  shape.lineTo(3.1, 0.9);
  shape.lineTo(3.1, 0.25);
  shape.lineTo(-3.1, 0.25);
  shape.lineTo(-3.1, 0.9);
  shape.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 });
  hullGeo.translate(0, 0, -1.1);
  const hull = new THREE.Mesh(hullGeo, M.timber('#8a5a30'));
  hull.castShadow = true;

  const ship = new THREE.Group();
  ship.position.y = -5.4;
  pivot.add(ship);
  ship.add(hull);

  // Trim, figurehead, mast.
  ship.add(M.box(7.3, 0.16, 2.3, M.paint(0xffca4a, { rough: 0.4, metal: 0.6 }), 0, 0.95, 0));
  const figure = M.cone(0.3, 1.0, M.paint(0xffca4a, { rough: 0.3, metal: 0.7 }), -3.9, 0.5, 0);
  figure.rotation.z = Math.PI / 2 + 0.3;
  ship.add(figure);
  ship.add(M.cyl(0.11, 3.6, M.timber('#6b4423'), 0, 2.4, 0, 8));
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), M.fabric(0xf5f0e2));
  sail.position.set(0, 3.3, 0);
  ship.add(sail);
  const flag = C.pennant(0.7, 0x1a1a1a, 1);
  flag.position.set(0, 4.0, 0);
  ship.add(flag);

  // Benches + riders.
  const riders = [];
  for (let r = 0; r < 6; r++) {
    const x = -2.6 + r * 1.05;
    ship.add(M.box(0.85, 0.12, 1.9, M.timber('#a8743f'), x, 0.36, 0));
    ship.add(M.box(0.85, 0.7, 0.1, M.timber('#a8743f'), x, 0.7, -0.95));
    for (const s of [-0.5, 0.5]) {
      const p = C.seatedRider(r * 2 + (s > 0 ? 1 : 0) + ctx.seed);
      p.position.set(x, 0.42, s);
      p.rotation.y = Math.PI / 2;
      p.visible = false;
      ship.add(p);
      riders.push(p);
    }
  }
  ship.add(M.box(7.0, 0.06, 0.06, M.bar(0xc8d0dc), 0, 1.15, 0.95));
  ship.add(M.box(7.0, 0.06, 0.06, M.bar(0xc8d0dc), 0, 1.15, -0.95));

  root.add(C.fenceRect(11, 7.5));
  const booth = C.operatorBooth(0xc23b4e);
  booth.position.set(4.6, 0, 3.2);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 1.2, 0);
  ship.add(camSeat);

  let phase = 0;
  return {
    root, camSeat,
    update(dt, t, st) {
      phase += dt * 1.05;
      // Amplitude eases in and out across the cycle for a real pendulum feel.
      const amp = st.power * 1.18;
      pivot.rotation.z = Math.sin(phase) * amp;
      C.waveFlag(flag.userData.flag, t);
      for (const p of riders) p.visible = st.riders > 0;
    },
  };
}

/* ================================================================== *
 * Teacups
 * ================================================================== */
export function teacups(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h));
  root.add(C.deck(4.0, 0.4, 0xff7bb0, 0xb84a78));

  const main = new THREE.Group();
  main.position.y = 0.4;
  root.add(main);

  const platters = [];
  const cups = [];
  for (let p = 0; p < 3; p++) {
    const a = (p / 3) * Math.PI * 2;
    const plat = new THREE.Group();
    plat.position.set(Math.cos(a) * 2.0, 0, Math.sin(a) * 2.0);
    main.add(plat);
    plat.add(M.cyl(1.45, 0.22, M.paint(0xffd76a, { rough: 0.5 }), 0, 0.11, 0, 20));
    platters.push(plat);

    for (let c = 0; c < 3; c++) {
      const ca = (c / 3) * Math.PI * 2;
      const cup = new THREE.Group();
      cup.position.set(Math.cos(ca) * 0.85, 0.22, Math.sin(ca) * 0.85);
      plat.add(cup);

      const col = M.funColor(p * 3 + c + ctx.seed);
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.62, 0.42, 0.85, 18, 1, false),
        M.enamel(col),
      );
      body.position.y = 0.42;
      body.castShadow = true;
      cup.add(body);
      cup.add(M.cyl(0.66, 0.1, M.enamel(0xfff6e8), 0, 0.86, 0, 18));
      cup.add(M.cyl(0.5, 0.12, M.enamel(col), 0, 0.06, 0, 14));
      // Handle.
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 14, Math.PI), M.enamel(col));
      handle.position.set(0.66, 0.45, 0);
      handle.rotation.y = Math.PI / 2;
      handle.rotation.z = -Math.PI / 2;
      cup.add(handle);
      // Wheel in the middle that guests "spin".
      cup.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 14), M.bar(0xc8d0dc))
        .translateY(0.78));

      const r1 = C.seatedRider(p * 3 + c + ctx.seed);
      r1.position.set(-0.22, 0.28, 0);
      r1.scale.setScalar(0.8);
      r1.visible = false;
      cup.add(r1);
      const r2 = C.seatedRider(p * 3 + c + 7 + ctx.seed);
      r2.position.set(0.22, 0.28, 0);
      r2.scale.setScalar(0.8);
      r2.visible = false;
      cup.add(r2);

      cups.push({ cup, riders: [r1, r2], spin: 0, rate: 1.4 + Math.random() * 1.6 });
    }
  }

  // Cheerful canopy of pennants over the ride.
  const poleMat = M.bar(0xe0e6ef);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pole = C.pennant(4.6, M.funColor(i + 2), i);
    pole.position.set(Math.cos(a) * 4.4, 0, Math.sin(a) * 4.4);
    root.add(pole);
  }

  root.add(C.fenceRing(5.0, 28));
  const booth = C.operatorBooth(0xff7bb0);
  booth.position.set(4.2, 0, 4.2);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 0.9, 0);
  cups[0].cup.add(camSeat);

  let spin = 0;
  return {
    root, camSeat,
    update(dt, t, st) {
      spin += dt * st.power * 0.9;
      main.rotation.y = spin;
      for (let i = 0; i < platters.length; i++) platters[i].rotation.y = -spin * 1.7;
      for (const c of cups) {
        c.spin += dt * st.power * c.rate;
        c.cup.rotation.y = c.spin;
        for (const r of c.riders) r.visible = st.riders > 0;
      }
    },
  };
}

/* ================================================================== *
 * Bumper Cars
 * ================================================================== */
export function bumperCars(ctx) {
  const root = new THREE.Group();
  const W = 8.4, D = 7.0;
  root.add(C.basePad(ctx.w, ctx.h));

  // Polished arena floor.
  const floor = M.box(W, 0.18, D, M.mat('bumper-floor', {
    color: 0x2b3040, roughness: 0.22, metalness: 0.65,
  }), 0, 0.3, 0);
  root.add(floor);

  // Padded perimeter wall.
  const wallMat = M.enamel(0xe6455c);
  const stripeMat = M.enamel(0xfff6e8);
  for (const [w, d, x, z] of [[W, 0.4, 0, -D / 2], [W, 0.4, 0, D / 2], [0.4, D, -W / 2, 0], [0.4, D, W / 2, 0]]) {
    root.add(M.box(w, 0.7, d, wallMat, x, 0.72, z));
    root.add(M.box(w * 0.99, 0.16, d * 0.99, stripeMat, x, 1.02, z));
  }

  // Overhead conductive grid on corner posts.
  const postMat = M.bar(0x8d96a8);
  const roofY = 3.6;
  for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) {
    for (const z of [-D / 2 + 0.3, D / 2 - 0.3]) {
      root.add(M.cyl(0.14, roofY, postMat, x, roofY / 2, z, 8));
    }
  }
  const grid = new THREE.Group();
  grid.position.y = roofY;
  root.add(grid);
  for (let i = -3; i <= 3; i++) {
    grid.add(M.box(W, 0.07, 0.07, postMat, 0, 0, i * (D / 7)));
    grid.add(M.box(0.07, 0.07, D, postMat, i * (W / 7), 0, 0));
  }
  grid.add(M.box(W, 0.1, D, M.mat('bumper-mesh', {
    color: 0x3a4150, roughness: 0.6, metalness: 0.5, transparent: true, opacity: 0.35,
  }), 0, 0.1, 0));

  const bulbs1 = C.bulbLine(V(-W / 2, roofY + 0.25, -D / 2), V(W / 2, roofY + 0.25, -D / 2), 12);
  const bulbs2 = C.bulbLine(V(-W / 2, roofY + 0.25, D / 2), V(W / 2, roofY + 0.25, D / 2), 12);
  root.add(bulbs1, bulbs2);

  // Cars.
  const cars = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const col = M.funColor(i + ctx.seed);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.42, 16), M.enamel(col));
    body.position.y = 0.42;
    body.castShadow = true;
    g.add(body);
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.13, 8, 18), M.rubber(0x1d2029))
      .translateY(0.3).rotateX(Math.PI / 2));
    g.add(M.box(0.5, 0.42, 0.42, M.enamel(col), -0.18, 0.78, 0));
    g.add(M.cyl(0.05, 2.6, M.bar(0xb8c0cc), -0.2, 2.0, 0, 6));
    // Contact shoe against the ceiling grid.
    const shoe = M.box(0.2, 0.08, 0.2, M.bar(0xffca4a), -0.2, 3.28, 0);
    g.add(shoe);
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 6, 12), M.bar(0x2b3040))
      .translateY(0.82).translateX(0.16).rotateX(-0.6));

    const rider = C.seatedRider(i + ctx.seed);
    rider.position.set(0.02, 0.5, 0);
    rider.scale.setScalar(0.85);
    rider.visible = false;
    g.add(rider);

    root.add(g);
    cars.push({
      g, rider,
      x: (Math.random() - 0.5) * (W - 2.4),
      z: (Math.random() - 0.5) * (D - 2.4),
      a: Math.random() * Math.PI * 2,
      v: 0,
      turn: (Math.random() - 0.5) * 2,
      shoe,
    });
  }

  root.add(C.fenceRect(W + 2.2, D + 2.2));
  const booth = C.operatorBooth(0xe6455c);
  booth.position.set(W / 2 + 1.5, 0, D / 2 + 0.6);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0.3, 1.0, 0);
  cars[0].g.add(camSeat);

  return {
    root, camSeat,
    bulbMats: [bulbs1.userData.bulbMat],
    update(dt, t, st) {
      const hw = W / 2 - 1.1, hd = D / 2 - 1.1;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        c.rider.visible = st.riders > 0;
        c.v += (st.power * 3.4 - c.v) * dt * 2.2;
        // Wandering steering with occasional direction changes.
        if (Math.random() < dt * 0.7) c.turn = (Math.random() - 0.5) * 3.2;
        c.a += c.turn * dt * st.power;
        c.x += Math.cos(c.a) * c.v * dt;
        c.z += Math.sin(c.a) * c.v * dt;
        // Bounce off the padded walls.
        if (c.x > hw) { c.x = hw; c.a = Math.PI - c.a; }
        if (c.x < -hw) { c.x = -hw; c.a = Math.PI - c.a; }
        if (c.z > hd) { c.z = hd; c.a = -c.a; }
        if (c.z < -hd) { c.z = -hd; c.a = -c.a; }
        // Car-to-car bumps.
        for (let j = i + 1; j < cars.length; j++) {
          const o = cars[j];
          const dx = o.x - c.x, dz = o.z - c.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 2.1 && d2 > 1e-4) {
            const d = Math.sqrt(d2);
            const push = (1.45 - d) * 0.5;
            c.x -= (dx / d) * push; c.z -= (dz / d) * push;
            o.x += (dx / d) * push; o.z += (dz / d) * push;
            c.a += 0.6; o.a -= 0.6;
          }
        }
        c.g.position.set(c.x, 0.39, c.z);
        c.g.rotation.y = -c.a;
        // Body leans into the turn.
        c.g.rotation.z = THREE.MathUtils.clamp(-c.turn * 0.06 * st.power, -0.12, 0.12);
      }
    },
  };
}

/* ================================================================== *
 * Drop Tower
 * ================================================================== */
export function dropTower(ctx) {
  const root = new THREE.Group();
  const H = 22;
  root.add(C.basePad(ctx.w, ctx.h));
  root.add(C.deck(3.0, 0.4, 0x4a6ba8, 0x2c4066));

  const steel = M.steel(0xe6455c, 0.38);
  root.add(C.lattice(H, 2.0, steel, 12));
  root.add(M.cone(1.3, 2.4, M.paint(0xffc23c, { rough: 0.45 }), 0, H + 1.2, 0, 8));
  root.add(M.sphere(0.32, M.glow(0xff4444, 3.0), 0, H + 2.6, 0));

  const bulbStrips = [];
  for (const s of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const b = C.bulbLine(V(s[0] * 1.05, 1, s[1] * 1.05), V(s[0] * 1.05, H - 1, s[1] * 1.05), 16, 0x64d2ff, 0.09);
    root.add(b);
    bulbStrips.push(b.userData.bulbMat);
  }

  // Gondola: a ring of outward-facing seats around the mast.
  const car = new THREE.Group();
  car.position.y = 1.4;
  root.add(car);
  car.add(new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.22, 10, 24), M.steel(0xffc23c, 0.35))
    .rotateX(Math.PI / 2));
  car.add(M.cyl(1.45, 0.3, M.paint(0x27406b, { rough: 0.5 }), 0, 0, 0, 20));

  const seats = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const s = new THREE.Group();
    s.position.set(Math.cos(a) * 1.85, 0, Math.sin(a) * 1.85);
    s.rotation.y = -a + Math.PI / 2;
    car.add(s);
    s.add(M.box(0.6, 0.1, 0.55, M.enamel(M.funColor(i)), 0, 0.1, 0));
    s.add(M.box(0.6, 0.75, 0.1, M.enamel(M.funColor(i)), 0, 0.48, -0.25));
    // Over-shoulder restraint.
    const harness = M.box(0.5, 0.1, 0.45, M.rubber(0x33384a), 0, 0.62, 0.05);
    s.add(harness);
    const rider = C.seatedRider(i + ctx.seed);
    rider.position.set(0, 0.14, 0);
    rider.visible = false;
    s.add(rider);
    seats.push(rider);
  }

  root.add(C.fenceRing(4.4, 26));
  const booth = C.operatorBooth(0x27406b);
  booth.position.set(3.6, 0, 3.6);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 1.2, 1.9);
  car.add(camSeat);

  // Simple state machine: climb -> hang -> drop -> settle.
  let phase = 'climb', y = 1.4, vel = 0, hold = 0;
  const TOP = H - 3.2, BOTTOM = 1.4;

  return {
    root, camSeat,
    bulbMats: bulbStrips,
    update(dt, t, st) {
      for (const r of seats) r.visible = st.riders > 0;
      if (st.power < 0.05) {
        y += (BOTTOM - y) * dt * 2;
        car.position.y = y;
        return;
      }
      const k = dt * st.power;
      if (phase === 'climb') {
        y += 4.6 * k;
        car.rotation.y += k * 0.35;
        if (y >= TOP) { y = TOP; phase = 'hang'; hold = 1.6; }
      } else if (phase === 'hang') {
        hold -= dt;
        car.rotation.y += k * 0.12;
        if (hold <= 0) { phase = 'drop'; vel = 0; }
      } else if (phase === 'drop') {
        vel += 26 * k;
        y -= vel * k;
        if (y <= BOTTOM + 2.4) { phase = 'brake'; }
      } else if (phase === 'brake') {
        vel = Math.max(0, vel - 34 * k);
        y -= vel * k;
        if (y <= BOTTOM) { y = BOTTOM; vel = 0; phase = 'rest'; hold = 2.2; }
      } else {
        hold -= dt;
        if (hold <= 0) phase = 'climb';
      }
      car.position.y = y;
    },
  };
}

/* ================================================================== *
 * Enterprise — spinning wheel of pods that tilts to vertical
 * ================================================================== */
export function enterprise(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h));
  root.add(C.deck(4.4, 0.4, 0x2fbfa0, 0x1d7f6b));

  const steel = M.steel(0xd8dee8, 0.32);
  // Tilting arm assembly.
  const tiltPivot = new THREE.Group();
  tiltPivot.position.set(0, 2.2, -3.2);
  root.add(tiltPivot);
  root.add(C.column(0.5, 2.2, steel, 0, -3.2));
  root.add(M.box(1.0, 0.5, 1.6, M.paint(0x2fbfa0, { rough: 0.5 }), 0, 2.2, -3.2));

  const arm = new THREE.Group();
  tiltPivot.add(arm);
  arm.add(M.cyl(0.32, 4.6, steel, 0, 0, 2.3, 12).rotateX(Math.PI / 2));

  const wheel = new THREE.Group();
  wheel.position.z = 4.6;
  arm.add(wheel);
  wheel.add(M.cyl(0.6, 0.7, steel, 0, 0, 0, 16).rotateX(Math.PI / 2));
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.14, 8, 40), M.steel(0xffc23c, 0.35)));

  const pods = [];
  const podCount = 16;
  for (let i = 0; i < podCount; i++) {
    const a = (i / podCount) * Math.PI * 2;
    const spoke = new THREE.Group();
    spoke.rotation.z = a;
    wheel.add(spoke);
    spoke.add(M.strut(V(0, 0, 0), V(0, 3.6, 0), 0.08, steel));

    // Pods hang freely from their spoke — they swing out as the wheel spins.
    const hinge = new THREE.Group();
    hinge.position.y = 3.6;
    spoke.add(hinge);
    const pod = new THREE.Group();
    hinge.add(pod);
    const col = M.funColor(i + ctx.seed);
    const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 4, 12), M.enamel(col));
    shell.rotation.x = Math.PI / 2;
    shell.position.y = -0.55;
    shell.castShadow = true;
    pod.add(shell);
    pod.add(M.box(0.7, 0.06, 0.9, M.bar(0xc8d0dc), 0, -0.9, 0));
    const glassDome = new THREE.Mesh(new THREE.SphereGeometry(0.44, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.glass(0xbfe4ff));
    glassDome.position.set(0, -0.5, 0.3);
    glassDome.rotation.x = Math.PI / 2;
    pod.add(glassDome);
    const rider = C.seatedRider(i + ctx.seed);
    rider.position.set(0, -0.85, 0.1);
    rider.scale.setScalar(0.72);
    rider.visible = false;
    pod.add(rider);
    pods.push({ hinge, rider, a });
  }

  root.add(C.fenceRing(6.0, 32));
  const booth = C.operatorBooth(0x2fbfa0);
  booth.position.set(4.6, 0, 4.6);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, -0.6, 0.6);
  pods[0].hinge.add(camSeat);

  let spin = 0, tilt = 0;
  return {
    root, camSeat,
    update(dt, t, st) {
      spin += dt * st.power * 2.1;
      wheel.rotation.z = spin;
      // Tilt lags the spin-up so the wheel is at speed before it lifts.
      const target = Math.max(0, st.power - 0.4) / 0.6;
      tilt += (target * (Math.PI / 2 - 0.12) - tilt) * dt * 0.8;
      arm.rotation.x = -tilt;
      for (const p of pods) {
        // Counter-rotate so pods stay hanging until centrifugal force wins.
        p.hinge.rotation.z = -spin - p.a + Math.sin(spin) * 0.04;
        p.rider.visible = st.riders > 0;
      }
    },
  };
}

/* ================================================================== *
 * Balloon Race
 * ================================================================== */
export function balloonRace(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h));
  root.add(C.deck(3.6, 0.4, 0x54d4f0, 0x2b8fb0));

  const steel = M.steel(0xf0f3f8, 0.35);
  root.add(C.column(0.6, 4.6, steel));

  const hub = new THREE.Group();
  hub.position.y = 4.6;
  root.add(hub);
  hub.add(M.cyl(0.8, 0.5, M.paint(0xffc23c, { rough: 0.45 }), 0, 0, 0, 16));
  const topRoof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.1, 14), M.canopy('#54d4f0', '#fff6e8', 14));
  topRoof.position.y = 0.75;
  hub.add(topRoof);

  const arms = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const armPivot = new THREE.Group();
    armPivot.rotation.y = a;
    hub.add(armPivot);
    armPivot.add(M.strut(V(0, 0, 0), V(3.2, 0.5, 0), 0.12, steel));

    const hang = new THREE.Group();
    hang.position.set(3.2, 0.5, 0);
    armPivot.add(hang);

    const col = M.funColor(i + ctx.seed);
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(1.05, 18, 14), M.enamel(col));
    balloon.scale.y = 1.25;
    balloon.position.y = -0.9;
    balloon.castShadow = true;
    hang.add(balloon);
    // Contrasting gore stripes.
    for (let s = 0; s < 4; s++) {
      const stripe = new THREE.Mesh(
        new THREE.SphereGeometry(1.07, 10, 14, (s / 4) * Math.PI * 2, 0.34),
        M.enamel(0xfff6e8),
      );
      stripe.scale.y = 1.25;
      stripe.position.y = -0.9;
      hang.add(stripe);
    }
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.52, 0.62, 12), M.timber('#b5834a'));
    basket.position.y = -2.65;
    basket.castShadow = true;
    hang.add(basket);
    for (let r = 0; r < 4; r++) {
      const ra = (r / 4) * Math.PI * 2;
      hang.add(M.strut(
        V(Math.cos(ra) * 0.5, -2.35, Math.sin(ra) * 0.5),
        V(Math.cos(ra) * 0.8, -1.7, Math.sin(ra) * 0.8),
        0.025, M.bar(0xb8c0cc),
      ));
    }
    const rider = C.seatedRider(i + ctx.seed);
    rider.position.set(0, -2.7, 0);
    rider.scale.setScalar(0.8);
    rider.visible = false;
    hang.add(rider);

    arms.push({ hang, rider, phase: (i / N) * Math.PI * 2, armPivot });
  }

  root.add(C.fenceRing(5.2, 28));
  const booth = C.operatorBooth(0x54d4f0);
  booth.position.set(4.0, 0, 4.0);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, -2.2, 0);
  arms[0].hang.add(camSeat);

  let spin = 0;
  return {
    root, camSeat,
    update(dt, t, st) {
      spin += dt * st.power * 1.1;
      hub.rotation.y = spin;
      for (const a of arms) {
        a.hang.position.y = 0.5 + Math.sin(spin * 1.6 + a.phase) * 1.1 * st.power;
        a.hang.rotation.y = -spin * 0.6;
        a.rider.visible = st.riders > 0;
      }
    },
  };
}
