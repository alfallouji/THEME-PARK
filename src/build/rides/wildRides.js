/**
 * The weird ones.
 *
 * Every park needs a few attractions that make people stop and stare: a
 * thrashing octopus, a frisbee that swings to vertical, a flying saucer
 * abducting a cow, a runaway magic carpet and a capsule fired into the sky on
 * bungee cords.
 */
import * as THREE from 'three';
import * as M from '../../gfx/Materials.js';
import * as T from '../../gfx/Textures.js';
import * as C from './common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ================================================================== *
 * Octopus — undulating arms with spinning cars on the tips
 * ================================================================== */
export function octopus(ctx) {
  const root = new THREE.Group();
  const ARMS = 6;
  root.add(C.basePad(ctx.w, ctx.h));
  root.add(C.deck(3.4, 0.4, 0x7a3fa0, 0x4a2468));

  const steel = M.steel(0xb9c2cf, 0.35);
  root.add(C.column(0.8, 3.0, steel));

  // Bulbous body with cartoon eyes — this is a giant octopus, after all.
  const hub = new THREE.Group();
  hub.position.y = 3.0;
  root.add(hub);
  const headMat = M.enamel(0x9a4bd8);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.9, 20, 16), headMat);
  head.scale.y = 0.85;
  head.position.y = 0.9;
  head.castShadow = true;
  hub.add(head);
  for (const s of [-1, 1]) {
    hub.add(M.sphere(0.42, M.enamel(0xfff6e8), s * 0.72, 1.5, 1.45));
    hub.add(M.sphere(0.2, M.enamel(0x1b2030), s * 0.78, 1.5, 1.74));
  }
  // Suckers dotted over the head.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 1.5 + (i % 3) * 0.12;
    hub.add(M.sphere(0.16, M.enamel(0xc98adf), Math.cos(a) * r, 0.5 + (i % 4) * 0.35, Math.sin(a) * r));
  }

  const arms = [];
  for (let i = 0; i < ARMS; i++) {
    const a = (i / ARMS) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.rotation.y = a;
    hub.add(pivot);

    // Tentacle built from tapering segments so it can flex as one piece.
    const tentacle = new THREE.Group();
    pivot.add(tentacle);
    const segParts = [];
    const SEGS = 5;
    for (let sgi = 0; sgi < SEGS; sgi++) {
      const r = 0.42 - sgi * 0.05;
      const seg = M.cyl(r, 1.05, M.enamel(sgi % 2 ? 0x8a3bc8 : 0x9a4bd8), 1.5 + sgi * 0.95, 0, 0, 10);
      seg.rotation.z = Math.PI / 2;
      segParts.push(seg);
      segParts.push(M.sphere(r * 0.9, M.enamel(0xc98adf), 1.5 + sgi * 0.95, -r * 0.7, 0));
    }
    const merged = M.mergeColored(segParts);
    if (merged) tentacle.add(merged);

    // Car on the tip, free to spin.
    const carPivot = new THREE.Group();
    carPivot.position.set(6.4, -0.6, 0);
    tentacle.add(carPivot);
    const col = M.funColor(i + ctx.seed);
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.7, 0.75, 14), M.enamel(col));
    tub.castShadow = true;
    carPivot.add(tub);
    carPivot.add(M.cyl(0.9, 0.12, M.enamel(0xfff6e8), 0, 0.42, 0, 14));
    carPivot.add(M.cyl(0.24, 0.9, M.bar(0xc8d0dc), 0, 0.6, 0, 8));

    const riders = [];
    for (let r = 0; r < 3; r++) {
      const ra = (r / 3) * Math.PI * 2;
      const p = C.seatedRider(i * 3 + r + ctx.seed);
      p.position.set(Math.cos(ra) * 0.42, 0.1, Math.sin(ra) * 0.42);
      p.rotation.y = -ra;
      p.scale.setScalar(0.76);
      p.visible = false;
      carPivot.add(p);
      riders.push(p);
    }
    arms.push({ pivot, tentacle, carPivot, riders, phase: (i / ARMS) * Math.PI * 2 });
  }

  root.add(C.fenceRing(8.2, 36));
  const booth = C.operatorBooth(0x9a4bd8);
  booth.position.set(6.6, 0, 6.6);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 0.8, 0);
  arms[0].carPivot.add(camSeat);

  let spin = 0;
  return {
    root, camSeat,
    update(dt, t, st) {
      spin += dt * st.power * 0.8;
      hub.rotation.y = spin;
      for (const a of arms) {
        // Arms rise and fall out of phase — the signature octopus motion.
        const wave = Math.sin(spin * 1.6 + a.phase);
        a.tentacle.rotation.z = wave * 0.42 * st.power - 0.06;
        a.carPivot.position.y = -0.6 + wave * 0.35 * st.power;
        // Cars hang level and spin freely.
        a.carPivot.rotation.y = -spin * 2.1 - a.phase;
        for (const r of a.riders) r.visible = st.riders > 0;
      }
    },
  };
}

/* ================================================================== *
 * Giant Frisbee — spinning disc on a swinging pendulum
 * ================================================================== */
export function giantFrisbee(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h));

  const steel = M.steel(0xe0e6ef, 0.3);
  const PIVOT_Y = 13.5;
  for (const z of [-3.0, 3.0]) {
    const f = C.aFrame(PIVOT_Y, 5.0, steel, 0.3);
    f.position.z = z;
    root.add(f);
  }
  root.add(M.cyl(0.3, 6.4, M.bar(0xc8d0dc), 0, PIVOT_Y, 0, 12).rotateX(Math.PI / 2));
  root.add(M.box(1.4, 1.4, 6.8, M.paint(0x2fbfa0, { rough: 0.45 }), 0, PIVOT_Y, 0));

  // Pendulum arm.
  const swing = new THREE.Group();
  swing.position.y = PIVOT_Y;
  root.add(swing);
  for (const s of [-1, 1]) {
    swing.add(M.strut(V(0, 0, s * 1.4), V(0, -8.0, s * 1.4), 0.26, steel));
  }
  swing.add(M.box(1.0, 0.5, 3.2, steel, 0, -7.9, 0));

  // The disc itself: outward-facing seats around a rim.
  const disc = new THREE.Group();
  disc.position.y = -8.6;
  swing.add(disc);
  const discBody = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 2.9, 0.55, 24), M.enamel(0xffc23c));
  discBody.castShadow = true;
  disc.add(discBody);
  disc.add(new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.18, 8, 32), M.steel(0xe6455c, 0.35))
    .rotateX(Math.PI / 2));
  disc.add(M.cyl(1.0, 1.2, steel, 0, 0.6, 0, 14));

  const seats = [];
  const SEATS = 20;
  for (let i = 0; i < SEATS; i++) {
    const a = (i / SEATS) * Math.PI * 2;
    const s = new THREE.Group();
    s.position.set(Math.cos(a) * 2.95, -0.1, Math.sin(a) * 2.95);
    s.rotation.y = -a + Math.PI / 2;
    disc.add(s);
    const col = M.funColor(i + ctx.seed);
    s.add(M.box(0.66, 0.12, 0.6, M.enamel(col), 0, 0, 0));
    s.add(M.box(0.66, 0.95, 0.12, M.enamel(col), 0, 0.5, -0.3));
    // Over-shoulder restraint.
    s.add(M.box(0.52, 0.12, 0.5, M.rubber(0x33384a), 0, 0.62, 0.02));
    const rider = C.seatedRider(i + ctx.seed);
    rider.position.set(0, 0.05, 0);
    rider.visible = false;
    s.add(rider);
    seats.push(rider);
  }
  const bulbs = C.bulbRing(3.6, 22, 0.35, 0xfff0c0, 0.11);
  disc.add(bulbs);

  root.add(C.fenceRect(13, 11, 0x59617a, 1.0));
  const booth = C.operatorBooth(0x2fbfa0);
  booth.position.set(5.6, 0, 4.4);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 0.7, 0.6);
  disc.add(camSeat);

  let spin = 0, phase = 0;
  return {
    root, camSeat,
    bulbMats: [bulbs.userData.bulbMat],
    update(dt, t, st) {
      spin += dt * st.power * 2.4;
      disc.rotation.y = spin;
      // Swing amplitude builds over the cycle and eases back down.
      phase += dt * 0.85;
      const amp = st.power * st.power * 2.05;
      swing.rotation.x = Math.sin(phase) * amp;
      for (const r of seats) r.visible = st.riders > 0;
    },
  };
}

/* ================================================================== *
 * UFO Abduction — a saucer that hovers, spins and beams up a cow
 * ================================================================== */
export function ufoAbduction(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h));
  root.add(C.deck(4.2, 0.4, 0x6f7b93, 0x49536a));

  const mast = M.steel(0x8d96a8, 0.35);
  root.add(C.column(0.7, 5.4, mast));

  const saucer = new THREE.Group();
  saucer.position.y = 5.4;
  root.add(saucer);

  // Hull: two shallow cones back to back, with a glass dome on top.
  const hullMat = M.mat('ufo-hull', { color: 0xb9c6d6, roughness: 0.22, metalness: 0.9 });
  const top = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.3, 28), hullMat);
  top.position.y = 0.65;
  top.castShadow = true;
  saucer.add(top);
  const bottom = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.6, 28), hullMat);
  bottom.rotation.x = Math.PI;
  bottom.position.y = -0.8;
  saucer.add(bottom);
  saucer.add(new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.22, 8, 36), M.steel(0x54d4f0, 0.3))
    .rotateX(Math.PI / 2));
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.7, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    M.glass(0x9ef0ff),
  );
  dome.position.y = 1.2;
  saucer.add(dome);

  // Rim lights that chase around the hull.
  const rimMat = M.glowUnique(0x46ff9a, 2.6);
  const rimCount = 16;
  const rim = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 10, 8), rimMat, rimCount);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < rimCount; i++) {
    const a = (i / rimCount) * Math.PI * 2;
    m4.makeTranslation(Math.cos(a) * 3.9, -0.35, Math.sin(a) * 3.9);
    rim.setMatrixAt(i, m4);
  }
  rim.instanceMatrix.needsUpdate = true;
  saucer.add(rim);

  // Riders sit in pods slung under the rim.
  const pods = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const pod = new THREE.Group();
    pod.position.set(Math.cos(a) * 3.2, -1.5, Math.sin(a) * 3.2);
    pod.rotation.y = -a;
    saucer.add(pod);
    const col = M.funColor(i + ctx.seed);
    pod.add(M.cyl(0.05, 0.7, M.bar(0xc8d0dc), 0, 0.6, 0, 6));
    pod.add(new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.enamel(col)));
    pod.add(M.cyl(0.64, 0.1, M.enamel(0xfff6e8), 0, 0.02, 0, 14));
    const rider = C.seatedRider(i + ctx.seed);
    rider.position.set(0, -0.32, 0);
    rider.scale.setScalar(0.72);
    rider.visible = false;
    pod.add(rider);
    pods.push(rider);
  }

  // Tractor beam and the very surprised cow inside it.
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x7dffb0, transparent: true, opacity: 0.16,
    side: THREE.DoubleSide, depthWrite: false,
  });
  // The beam hangs off to one side and does NOT spin with the saucer, so the
  // support mast never hides the cow.
  const BEAM_X = 2.7;
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1.9, 5.2, 20, 1, true), beamMat);
  beam.rotation.x = Math.PI;
  const beamGroup = new THREE.Group();
  beamGroup.position.set(BEAM_X, 0, 0);
  beamGroup.add(beam);
  root.add(beamGroup);

  const cow = new THREE.Group();
  const cowWhite = M.paint(0xf5f5f0, { rough: 0.8 });
  const cowBlack = M.paint(0x2b2b30, { rough: 0.8 });
  const cowParts = [];
  cowParts.push(M.box(1.1, 0.6, 0.55, cowWhite, 0, 0, 0));
  cowParts.push(M.box(0.42, 0.38, 0.4, cowWhite, 0.66, 0.12, 0));
  cowParts.push(M.box(0.16, 0.16, 0.1, cowBlack, 0.88, 0.02, 0));
  for (const sx of [-1, 1]) {
    cowParts.push(M.box(0.12, 0.2, 0.12, cowWhite, 0.62, 0.38, sx * 0.14));
    for (const sz of [-1, 1]) {
      cowParts.push(M.box(0.14, 0.42, 0.14, cowWhite, sx * 0.36, -0.46, sz * 0.18));
    }
  }
  cowParts.push(M.sphere(0.2, cowBlack, -0.1, 0.18, 0.28));
  cowParts.push(M.sphere(0.16, cowBlack, 0.24, -0.1, -0.3));
  const cowMesh = M.mergeColored(cowParts);
  if (cowMesh) cow.add(cowMesh);
  cow.scale.setScalar(1.6);
  root.add(cow);

  root.add(C.fenceRing(6.4, 32));
  const booth = C.operatorBooth(0x46ff9a);
  booth.position.set(5.2, 0, 5.2);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, -0.3, 0.5);
  saucer.add(camSeat);

  let spin = 0, hover = 0, abduct = 0;
  return {
    root, camSeat,
    update(dt, t, st) {
      spin += dt * (0.35 + st.power * 1.5);
      saucer.rotation.y = spin;
      hover += dt;
      saucer.position.y = 5.4 + Math.sin(hover * 0.8) * 0.5 + st.power * 1.6;
      // Keep the beam stretched from the hull down to the ground.
      const beamTop = saucer.position.y - 1.4;
      beamGroup.position.y = beamTop / 2;
      beam.scale.y = beamTop / 5.2;

      // Chasing rim lights.
      M.pulse(rimMat, 0.6 + Math.abs(Math.sin(t * 3)) * 0.9);
      beamMat.opacity = (0.08 + Math.abs(Math.sin(t * 1.5)) * 0.14) * (0.35 + st.power);

      // The cow rises up the beam, spinning, then is quietly returned.
      abduct += dt * (0.09 + st.power * 0.1);
      if (abduct > 1) abduct -= 1;
      const k = abduct < 0.7 ? abduct / 0.7 : 0;
      cow.position.set(BEAM_X, 0.75 + k * (saucer.position.y - 3.0), 0);
      cow.rotation.y = k * 12;
      cow.rotation.z = Math.sin(k * 9) * 0.5 * k;
      cow.visible = abduct < 0.72;

      for (const r of pods) r.visible = st.riders > 0;
    },
  };
}

/* ================================================================== *
 * Magic Carpet — swinging carpet that also barrel-rolls
 * ================================================================== */
export function magicCarpet(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h));

  const steel = M.steel(0xd8b25a, 0.35);
  const PIVOT_Y = 8.4;
  for (const z of [-2.2, 2.2]) {
    const f = C.aFrame(PIVOT_Y, 4.2, steel, 0.28);
    f.position.z = z;
    root.add(f);
  }
  root.add(M.cyl(0.24, 4.8, M.bar(0xffca4a), 0, PIVOT_Y, 0, 12).rotateX(Math.PI / 2));
  // Arabian-nights finials.
  for (const s of [-1, 1]) {
    root.add(M.sphere(0.36, M.paint(0xffca4a, { rough: 0.25, metal: 0.85 }), s * 4.2, PIVOT_Y + 0.3, 0));
    root.add(M.cone(0.28, 0.7, M.paint(0xffca4a, { rough: 0.25, metal: 0.85 }), s * 4.2, PIVOT_Y + 0.85, 0, 8));
  }

  const swing = new THREE.Group();
  swing.position.y = PIVOT_Y;
  root.add(swing);
  for (const s of [-1, 1]) {
    swing.add(M.strut(V(0, 0, s * 1.6), V(0, -5.2, s * 1.6), 0.2, steel));
  }

  // The carpet: a rippling cloth slab with tassels and passengers.
  const roll = new THREE.Group();
  roll.position.y = -5.2;
  swing.add(roll);

  const carpetGeo = new THREE.PlaneGeometry(5.4, 3.0, 18, 6);
  const carpetMat = new THREE.MeshStandardMaterial({
    map: T.stripes('#7a2ba0', '#e6455c', 8), roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const carpet = new THREE.Mesh(carpetGeo, carpetMat);
  carpet.rotation.x = -Math.PI / 2;
  carpet.castShadow = true;
  roll.add(carpet);
  const baseZ = carpetGeo.attributes.position.array.slice();

  roll.add(M.box(5.5, 0.12, 3.1, M.paint(0xffca4a, { rough: 0.3, metal: 0.7 }), 0, -0.1, 0));
  // Tassels along both ends.
  for (let i = 0; i < 12; i++) {
    const x = -2.5 + (i % 6) * 1.0;
    const z = i < 6 ? -1.5 : 1.5;
    roll.add(M.cyl(0.04, 0.4, M.fabric(0xffd76a), x, -0.3, z, 4));
  }

  const riders = [];
  for (let r = 0; r < 4; r++) {
    for (const s of [-1, 1]) {
      const p = C.seatedRider(r * 2 + (s > 0 ? 1 : 0) + ctx.seed);
      p.position.set(-1.8 + r * 1.2, 0.05, s * 0.7);
      p.rotation.y = Math.PI / 2;
      p.visible = false;
      roll.add(p);
      riders.push(p);
      roll.add(M.box(1.0, 0.1, 0.1, M.bar(0xffca4a), -1.8 + r * 1.2, 0.5, s * 1.05));
    }
  }

  root.add(C.fenceRect(11, 8, 0x59617a, 1.0));
  const booth = C.operatorBooth(0x7a2ba0);
  booth.position.set(4.8, 0, 3.4);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 0.9, 0);
  roll.add(camSeat);

  let phase = 0, rollAngle = 0;
  return {
    root, camSeat,
    update(dt, t, st) {
      phase += dt * 1.0;
      swing.rotation.z = Math.sin(phase) * st.power * 1.2;
      // Once it is really swinging, the carpet starts rolling right over.
      const rollPower = Math.max(0, st.power - 0.55) / 0.45;
      rollAngle += dt * rollPower * 1.1;
      roll.rotation.z = rollAngle;

      // Cloth ripple.
      const pos = carpetGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = baseZ[i * 3], y = baseZ[i * 3 + 1];
        pos.setZ(i, Math.sin(t * 3 + x * 1.1) * 0.12 + Math.cos(t * 2.1 + y * 1.4) * 0.06);
      }
      pos.needsUpdate = true;

      for (const r of riders) r.visible = st.riders > 0;
    },
  };
}

/* ================================================================== *
 * Reverse Bungee — a capsule slingshotted into the sky
 * ================================================================== */
export function reverseBungee(ctx) {
  const root = new THREE.Group();
  const H = 24;
  root.add(C.basePad(ctx.w, ctx.h));
  root.add(C.deck(3.0, 0.4, 0xffb06a, 0xc05a18));

  const steel = M.steel(0xffc23c, 0.35);
  for (const s of [-1, 1]) {
    const tower = C.lattice(H, 1.6, steel, 12);
    tower.position.x = s * 4.6;
    root.add(tower);
    root.add(M.cone(1.0, 1.8, M.paint(0xe6455c, { rough: 0.5 }), s * 4.6, H + 0.9, 0, 8));
    root.add(M.sphere(0.24, M.glow(0xff4444, 2.6), s * 4.6, H + 2.1, 0));
  }

  // Capsule: a two-seat ball in a roll cage.
  const capsule = new THREE.Group();
  root.add(capsule);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.0, 18, 14), M.enamel(0x54d4f0));
  ball.castShadow = true;
  capsule.add(ball);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.07, 6, 20), M.bar(0xffca4a));
    ring.rotation.y = a;
    capsule.add(ring);
  }
  capsule.add(new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.07, 6, 20), M.bar(0xffca4a))
    .rotateX(Math.PI / 2));
  const riders = [];
  for (const s of [-1, 1]) {
    const p = C.seatedRider(s > 0 ? ctx.seed : ctx.seed + 5);
    p.position.set(s * 0.34, -0.45, 0);
    p.scale.setScalar(0.74);
    p.visible = false;
    capsule.add(p);
    riders.push(p);
  }

  // Elastic cords, redrawn each frame between tower tops and the capsule.
  const cordMat = M.bar(0xe6455c);
  const cords = [];
  for (const s of [-1, 1]) {
    const c = M.cyl(0.07, 1, cordMat, 0, 0, 0, 6);
    root.add(c);
    cords.push({ mesh: c, anchor: V(s * 4.6, H - 0.6, 0) });
  }

  root.add(C.fenceRing(5.0, 28));
  const booth = C.operatorBooth(0xff8a3d);
  booth.position.set(4.4, 0, 4.4);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 0.2, 0.9);
  capsule.add(camSeat);

  // Load -> tension -> launch -> bounce -> settle.
  let phase = 'load', y = 1.4, vel = 0, hold = 1.5, bounces = 0;
  const GROUND = 1.4;
  const tmpDir = new THREE.Vector3();

  return {
    root, camSeat,
    update(dt, t, st) {
      for (const r of riders) r.visible = st.riders > 0;

      if (st.power < 0.05) {
        y += (GROUND - y) * Math.min(1, dt * 2);
        phase = 'load'; vel = 0; hold = 1.5; bounces = 0;
      } else if (phase === 'load') {
        hold -= dt;
        // Winch pulls the capsule down against the cords.
        y += (GROUND - 0.5 - y) * Math.min(1, dt * 1.5);
        if (hold <= 0) { phase = 'fly'; vel = 23; bounces = 0; }
      } else if (phase === 'fly') {
        vel -= 16.5 * dt;
        y += vel * dt;
        if (y <= GROUND) {
          y = GROUND;
          bounces++;
          vel = Math.abs(vel) * 0.55;
          if (bounces >= 3 || vel < 4) { phase = 'settle'; hold = 2.4; vel = 0; }
        }
        if (y > H + 6) { y = H + 6; vel = Math.min(vel, 0); }
      } else {
        hold -= dt;
        y += (GROUND - y) * Math.min(1, dt * 3);
        if (hold <= 0) { phase = 'load'; hold = 2.0; }
      }

      capsule.position.y = y;
      capsule.rotation.x = Math.sin(y * 0.4) * 0.35;
      capsule.rotation.z = Math.cos(y * 0.3) * 0.2;

      // Stretch the cords between each tower top and the capsule.
      for (const c of cords) {
        tmpDir.subVectors(capsule.position, c.anchor);
        const len = tmpDir.length();
        c.mesh.position.copy(c.anchor).addScaledVector(tmpDir, 0.5);
        c.mesh.scale.set(1, len, 1);
        c.mesh.quaternion.setFromUnitVectors(C.UP, tmpDir.normalize());
      }
    },
  };
}
