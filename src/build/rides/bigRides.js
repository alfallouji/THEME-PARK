/**
 * Landmark rides and walkthrough attractions: the ferris wheel, observation
 * tower, haunted mansion, funhouse, circus big top and helter skelter.
 *
 * These are the park's skyline — they get extra detail and lighting because
 * players will point the camera at them.
 */
import * as THREE from 'three';
import * as M from '../../gfx/Materials.js';
import * as T from '../../gfx/Textures.js';
import * as C from './common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ================================================================== *
 * Ferris Wheel
 * ================================================================== */
export function ferrisWheel(ctx) {
  const root = new THREE.Group();
  const R = 10.5;
  const HUB_Y = 12.0;
  const GONDOLAS = 16;

  root.add(C.basePad(ctx.w, ctx.h));

  const steel = M.steel(0xe8edf4, 0.32);
  const accent = M.steel(0xe6455c, 0.35);

  // Two A-frames straddling the hub.
  for (const z of [-2.4, 2.4]) {
    const f = C.aFrame(HUB_Y, 5.4, steel, 0.32);
    f.position.z = z;
    root.add(f);
  }
  root.add(M.box(1.2, 1.2, 5.6, accent, 0, HUB_Y, 0));
  root.add(M.cyl(0.35, 6.0, M.bar(0xc8d0dc), 0, HUB_Y, 0, 12).rotateX(Math.PI / 2));

  const wheel = new THREE.Group();
  wheel.position.y = HUB_Y;
  root.add(wheel);

  // Two rims + spokes + cross bracing.
  for (const z of [-1.5, 1.5]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.18, 8, 72), accent);
    rim.position.z = z;
    rim.castShadow = true;
    wheel.add(rim);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.42, 0.1, 6, 48), steel);
    inner.position.z = z;
    wheel.add(inner);
  }
  wheel.add(M.cyl(1.1, 3.4, steel, 0, 0, 0, 16).rotateX(Math.PI / 2));

  // Spokes and lateral bracing are static within the wheel, so they merge
  // into one mesh instead of 48 separate draw calls.
  const SPOKES = 16;
  const spokeParts = [];
  for (let i = 0; i < SPOKES; i++) {
    const a = (i / SPOKES) * Math.PI * 2;
    const x = Math.cos(a), y = Math.sin(a);
    for (const z of [-1.5, 1.5]) {
      spokeParts.push(M.strut(V(x * 0.9, y * 0.9, z), V(x * R, y * R, z), 0.06, steel));
    }
    const a2 = ((i + 0.5) / SPOKES) * Math.PI * 2;
    spokeParts.push(M.strut(
      V(Math.cos(a) * R, Math.sin(a) * R, -1.5),
      V(Math.cos(a2) * R, Math.sin(a2) * R, 1.5),
      0.05, steel,
    ));
  }
  const spokeMesh = M.mergeMeshes(spokeParts, steel);
  if (spokeMesh) wheel.add(spokeMesh);

  // Light strings along both rims.
  const bulbMats = [];
  for (const z of [-1.7, 1.7]) {
    const mat = M.glow(0xffe9b0, 3.0);
    const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), mat, 48);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      m4.makeTranslation(Math.cos(a) * R, Math.sin(a) * R, z);
      inst.setMatrixAt(i, m4);
    }
    inst.instanceMatrix.needsUpdate = true;
    wheel.add(inst);
    bulbMats.push(mat);
  }

  // Gondolas hang from pivots so they stay level as the wheel turns.
  const cabs = [];
  for (let i = 0; i < GONDOLAS; i++) {
    const a = (i / GONDOLAS) * Math.PI * 2;
    const arm = new THREE.Group();
    arm.rotation.z = a;
    wheel.add(arm);
    const pivot = new THREE.Group();
    pivot.position.y = R;
    arm.add(pivot);

    const cab = new THREE.Group();
    pivot.add(cab);
    const col = M.funColor(i + ctx.seed);
    cab.add(M.cyl(0.08, 0.7, M.bar(0xc8d0dc), 0, -0.35, 0, 6));
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.72, 0.5, 4, 14), M.enamel(col));
    body.position.y = -1.3;
    body.castShadow = true;
    cab.add(body);
    cab.add(M.cyl(0.78, 0.1, M.enamel(0xfff6e8), 0, -1.86, 0, 14));
    const roof = M.cone(0.88, 0.45, M.enamel(0xfff6e8), 0, -0.6, 0, 14);
    cab.add(roof);
    // Windows.
    for (let w = 0; w < 4; w++) {
      const wa = (w / 4) * Math.PI * 2;
      cab.add(M.box(0.5, 0.42, 0.06, M.glass(0xbfe4ff),
        Math.cos(wa) * 0.7, -1.2, Math.sin(wa) * 0.7).rotateY(-wa));
    }
    const riders = [];
    for (let r = 0; r < 2; r++) {
      const p = C.seatedRider(i * 2 + r + ctx.seed);
      p.position.set(0, -1.62, r === 0 ? 0.24 : -0.24);
      p.rotation.y = r === 0 ? 0 : Math.PI;
      p.scale.setScalar(0.7);
      p.visible = false;
      cab.add(p);
      riders.push(p);
    }
    cabs.push({ pivot, riders, a });
  }

  // Boarding platform.
  root.add(M.box(5.0, 0.5, 3.4, M.timber('#b5834a'), 0, 0.25, R * 0 + 0));
  const plat = M.box(6.0, 0.4, 3.0, M.timber('#a8743f'), 0, 0.9, 0);
  root.add(plat);
  for (const s of [-1, 1]) root.add(M.box(0.12, 1.0, 3.0, M.bar(0xc8d0dc), s * 3.0, 1.6, 0));

  root.add(C.fenceRect(15, 11, 0x59617a, 1.0));
  const booth = C.operatorBooth(0xe6455c);
  booth.position.set(6.5, 0, 4.2);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, -1.3, 0);
  cabs[0].pivot.add(camSeat);

  let spin = 0;
  return {
    root, camSeat, bulbMats,
    update(dt, t, st) {
      spin += dt * st.power * 0.32;
      wheel.rotation.z = spin;
      for (const c of cabs) {
        // Counter-rotate to keep the cabin upright, with a slight sway.
        c.pivot.rotation.z = -spin - c.a + Math.sin(t * 1.3 + c.a) * 0.03;
        for (const r of c.riders) r.visible = st.riders > 0;
      }
    },
  };
}

/* ================================================================== *
 * Observation Tower
 * ================================================================== */
export function observationTower(ctx) {
  const root = new THREE.Group();
  const H = 30;
  root.add(C.basePad(ctx.w, ctx.h));
  root.add(C.deck(3.2, 0.4, 0xc8d0dc, 0x8d96a8));

  const steel = M.steel(0xf0f3f8, 0.3);
  root.add(M.cyl(1.0, H, steel, 0, H / 2, 0, 16));
  root.add(C.lattice(H, 2.6, M.steel(0xaab4c4, 0.4), 14));

  // Crown.
  root.add(M.cyl(2.2, 0.6, M.paint(0xe6455c, { rough: 0.45 }), 0, H + 0.3, 0, 16));
  const crownRoof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.2, 16), M.canopy('#e6455c', '#ffd76a', 16));
  crownRoof.position.y = H + 1.7;
  root.add(crownRoof);
  root.add(M.cyl(0.08, 3.0, M.bar(0xc8d0dc), 0, H + 4.2, 0, 6));
  const beaconMat = M.glowUnique(0xff3b3b, 3.4);
  const beacon = M.sphere(0.35, beaconMat, 0, H + 5.8, 0);
  root.add(beacon);
  const crownBulbs = C.bulbRing(2.5, 20, H + 0.7, 0xffe9b0, 0.12);
  root.add(crownBulbs);

  // Rotating glass cabin that rides up the mast.
  const cabin = new THREE.Group();
  cabin.position.y = 1.6;
  root.add(cabin);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 0.3, 24), M.paint(0xe6455c, { rough: 0.45 }));
  cabin.add(ring);
  cabin.add(M.cyl(3.05, 0.14, M.bar(0xffca4a), 0, 0.22, 0, 24));
  const glassWall = new THREE.Mesh(
    new THREE.CylinderGeometry(2.95, 2.95, 1.9, 24, 1, true),
    M.glass(0xbfe4ff),
  );
  glassWall.position.y = 1.1;
  cabin.add(glassWall);
  const cabRoof = new THREE.Mesh(new THREE.ConeGeometry(3.3, 0.9, 24), M.paint(0xffc23c, { rough: 0.5 }));
  cabRoof.position.y = 2.5;
  cabRoof.castShadow = true;
  cabin.add(cabRoof);
  const cabBulbs = C.bulbRing(3.2, 18, 2.1, 0xfff0c0, 0.09);
  cabin.add(cabBulbs);

  const riders = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = C.seatedRider(i + ctx.seed);
    p.position.set(Math.cos(a) * 2.35, 0.15, Math.sin(a) * 2.35);
    p.rotation.y = -a + Math.PI / 2;
    p.scale.setScalar(0.8);
    p.visible = false;
    cabin.add(p);
    riders.push(p);
  }

  root.add(C.fenceRing(4.6, 26));
  const booth = C.operatorBooth(0xc8d0dc);
  booth.position.set(3.8, 0, 3.8);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 1.4, 2.4);
  cabin.add(camSeat);

  let y = 1.6, dir = 1, hold = 0, spin = 0;
  const TOP = H - 4.5, BOT = 1.6;
  return {
    root, camSeat,
    bulbMats: [crownBulbs.userData.bulbMat, cabBulbs.userData.bulbMat],
    update(dt, t, st) {
      for (const r of riders) r.visible = st.riders > 0;
      // Aviation beacon: visible by day, striking at night.
      M.pulse(beaconMat, 0.6 + Math.max(0, Math.sin(t * 3)) * 2.2);
      spin += dt * st.power * 0.25;
      cabin.rotation.y = spin;
      if (st.power < 0.05) {
        y += (BOT - y) * dt * 1.5;
      } else if (hold > 0) {
        hold -= dt;
      } else {
        y += dir * dt * 2.4 * st.power;
        if (y >= TOP) { y = TOP; dir = -1; hold = 4.0; }
        if (y <= BOT) { y = BOT; dir = 1; hold = 2.5; }
      }
      cabin.position.y = y;
    },
  };
}

/* ================================================================== *
 * Haunted Mansion
 * ================================================================== */
export function hauntedHouse(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h, { color: 0x4a4a52 }));

  const wallMat = M.mat('haunt-wall', { color: 0x4a4458, roughness: 0.95, map: T.stucco('#7a7290') });
  const roofMat = M.paint(0x2a2436, { rough: 0.9 });
  const trimMat = M.timber('#3d3226');

  // Main block + wings.
  root.add(M.box(7.0, 5.0, 5.0, wallMat, 0, 2.6, 0));
  root.add(M.box(3.0, 3.6, 3.2, wallMat, -4.4, 1.9, 0.6));
  root.add(M.box(3.0, 4.2, 3.0, wallMat, 4.4, 2.2, -0.4));

  // Steep roofs.
  const mkRoof = (w, d, h, x, y, z, rot = 0) => {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(0.001, Math.SQRT2 * 0.5 * w, h, 4, 1), roofMat);
    g.rotation.y = Math.PI / 4 + rot;
    g.position.set(x, y, z);
    g.scale.z = d / w;
    g.castShadow = true;
    return g;
  };
  root.add(mkRoof(8.0, 6.0, 3.4, 0, 6.8, 0));
  root.add(mkRoof(3.8, 4.0, 2.0, -4.4, 4.7, 0.6));
  root.add(mkRoof(3.8, 3.8, 2.2, 4.4, 5.4, -0.4));

  // Crooked tower.
  const tower = new THREE.Group();
  tower.position.set(2.2, 0, 2.2);
  tower.rotation.z = 0.05;
  root.add(tower);
  tower.add(M.cyl(1.1, 9.0, wallMat, 0, 4.5, 0, 10));
  const spire = M.cone(1.5, 3.6, roofMat, 0, 10.8, 0, 10);
  tower.add(spire);
  tower.add(M.sphere(0.2, M.glow(0x7de0f0, 2.0), 0, 12.8, 0));

  // Glowing windows — the flicker is what sells it.
  const winMat = new THREE.MeshStandardMaterial({
    color: 0x120e18, emissive: 0xffb340, emissiveIntensity: 1.6,
    roughness: 0.5,
  });
  const winMat2 = new THREE.MeshStandardMaterial({
    color: 0x120e18, emissive: 0x7de0f0, emissiveIntensity: 1.2,
    roughness: 0.5,
  });
  const windows = [];
  const addWin = (w, h, x, y, z, ry, mat) => {
    const m = M.box(w, h, 0.12, mat, x, y, z);
    m.rotation.y = ry;
    root.add(m);
    windows.push(m);
  };
  for (const x of [-2.2, 0, 2.2]) {
    addWin(0.9, 1.3, x, 2.0, 2.56, 0, winMat);
    addWin(0.8, 1.1, x, 4.2, 2.56, 0, winMat2);
  }
  addWin(0.8, 1.2, -4.4, 1.9, 2.24, 0, winMat);
  addWin(0.8, 1.2, 4.4, 2.2, 1.14, 0, winMat2);
  addWin(0.7, 1.0, 3.5, 2.2, 2.2, 0, winMat);
  tower.add(M.box(0.6, 0.9, 0.12, winMat2, 0, 6.5, 1.05));

  // Door with a spooky arch.
  root.add(M.box(1.8, 2.6, 0.2, trimMat, 0, 1.3, 2.6));
  root.add(M.box(2.2, 0.25, 0.4, trimMat, 0, 2.7, 2.7));
  const doorGlowMat = M.glowUnique(0x9a4bff, 1.4);
  const doorGlow = M.box(1.4, 2.2, 0.06, doorGlowMat, 0, 1.15, 2.72);
  root.add(doorGlow);
  // Steps.
  for (let i = 0; i < 3; i++) {
    root.add(M.box(2.6 + i * 0.4, 0.2, 0.5, M.paint(0x5a5560, { rough: 0.95 }), 0, 0.1 + i * 0.2, 3.1 + i * 0.45));
  }

  // Graveyard + dead trees.
  const stoneMat = M.paint(0x8d8a94, { rough: 1.0 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = 5.6 + (i % 3) * 0.7;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.75 + 1.0;
    if (Math.abs(x) < 1.6 && z > 2) continue;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = i;
    g.rotation.z = (Math.sin(i * 3) * 0.12);
    if (i % 3 === 0) {
      g.add(M.box(0.5, 0.9, 0.16, stoneMat, 0, 0.45, 0));
      g.add(M.cyl(0.25, 0.16, stoneMat, 0, 0.9, 0, 10).rotateX(Math.PI / 2));
    } else if (i % 3 === 1) {
      g.add(M.box(0.16, 1.1, 0.16, stoneMat, 0, 0.55, 0));
      g.add(M.box(0.7, 0.16, 0.16, stoneMat, 0, 0.85, 0));
    } else {
      g.add(M.box(0.6, 0.75, 0.2, stoneMat, 0, 0.38, 0));
    }
    root.add(g);
  }
  const deadMat = M.paint(0x3a3028, { rough: 1.0 });
  for (const [x, z] of [[-6.2, -3.0], [6.0, 3.4]]) {
    const tr = new THREE.Group();
    tr.position.set(x, 0, z);
    tr.add(M.cyl(0.28, 4.0, deadMat, 0, 2.0, 0, 7));
    for (let b = 0; b < 6; b++) {
      const a = (b / 6) * Math.PI * 2;
      tr.add(M.strut(V(0, 3.0 + (b % 2) * 0.6, 0),
        V(Math.cos(a) * 1.7, 4.6 + (b % 3) * 0.5, Math.sin(a) * 1.7), 0.09, deadMat));
    }
    root.add(tr);
  }

  // Drifting ghosts.
  const ghosts = [];
  const ghostMat = new THREE.MeshStandardMaterial({
    color: 0xd8f0ff, emissive: 0x6fd8ff, emissiveIntensity: 1.1,
    transparent: true, opacity: 0.5, roughness: 0.6,
  });
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 12, 3, true), ghostMat);
    body.position.y = -0.2;
    g.add(body);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 10), ghostMat).translateY(0.62));
    for (const s of [-1, 1]) {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6),
        M.glow(0x102040, 0.4)).translateY(0.68).translateZ(0.44).translateX(s * 0.18));
    }
    root.add(g);
    ghosts.push({ g, a: (i / 4) * Math.PI * 2, r: 4.6 + i * 0.5, y: 2.2 + i * 0.9, sp: 0.4 + i * 0.12 });
  }

  // Bats circling the tower.
  const bats = [];
  const batMat = M.paint(0x1a1620, { rough: 0.95 });
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Group();
    b.add(M.box(0.12, 0.1, 0.22, batMat));
    const wings = [];
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26), M.fabric(0x1a1620));
      w.position.x = s * 0.26;
      b.add(w);
      wings.push(w);
    }
    root.add(b);
    bats.push({ b, wings, a: Math.random() * 6.28, r: 3.4 + Math.random() * 2.5, y: 9 + Math.random() * 3 });
  }

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.0), new THREE.MeshBasicMaterial({
    map: T.signboard('Haunted', '#1a0f24', '#9a4bff'), transparent: true,
  }));
  sign.position.set(0, 5.2, 2.62);
  root.add(sign);

  const booth = C.operatorBooth(0x5a4a72);
  booth.position.set(-5.0, 0, 3.6);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 1.6, 4.0);
  root.add(camSeat);

  let fogTimer = 0;
  return {
    root, camSeat,
    update(dt, t, st) {
      // Candle flicker.
      const fl = 1.1 + Math.sin(t * 9.3) * 0.3 + Math.sin(t * 23.7) * 0.18;
      // Candles read faintly through the windows by day and blaze after dusk.
      const lit = 0.22 + st.night * 1.3;
      winMat.emissiveIntensity = fl * (0.6 + st.power * 0.8) * lit;
      winMat2.emissiveIntensity = (1.0 + Math.sin(t * 5.1 + 2) * 0.5) * (0.5 + st.power * 0.7) * lit;
      M.pulse(doorGlowMat, 1.0 + Math.sin(t * 2.2) * 0.6);

      for (const gh of ghosts) {
        gh.a += dt * gh.sp * (0.4 + st.power);
        gh.g.position.set(Math.cos(gh.a) * gh.r, gh.y + Math.sin(t * 1.4 + gh.a) * 0.5, Math.sin(gh.a) * gh.r * 0.8);
        gh.g.rotation.y = -gh.a + Math.PI / 2;
        gh.g.scale.setScalar(0.9 + Math.sin(t * 2 + gh.a) * 0.08);
        ghostMat.opacity = 0.32 + Math.sin(t * 1.7) * 0.12 + st.power * 0.14;
      }
      for (const bt of bats) {
        bt.a += dt * 1.4;
        bt.b.position.set(2.2 + Math.cos(bt.a) * bt.r, bt.y + Math.sin(bt.a * 2) * 0.6, 2.2 + Math.sin(bt.a) * bt.r);
        bt.b.rotation.y = -bt.a;
        const flap = Math.sin(t * 16 + bt.a * 3) * 0.9;
        bt.wings[0].rotation.z = flap;
        bt.wings[1].rotation.z = -flap;
      }
      // Ground fog puffs.
      fogTimer -= dt;
      if (fogTimer <= 0 && st.power > 0.2) {
        fogTimer = 0.8;
        const a = Math.random() * Math.PI * 2;
        const wp = root.localToWorld(V(Math.cos(a) * 4.5, 0.3, Math.sin(a) * 4.0 + 1));
        ctx.fx?.mist(wp);
      }
    },
  };
}

/* ================================================================== *
 * Funhouse
 * ================================================================== */
export function funhouse(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h));

  const wall = M.plaster('#fff0d8');
  root.add(M.box(7.0, 4.2, 5.0, wall, 0, 2.2, 0));
  // Wavy candy roof.
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 7.2, 16, 1, false, 0, Math.PI), M.canopy('#54d4f0', '#ff7bb0', 12));
  roof.rotation.z = Math.PI / 2;
  roof.position.y = 4.3;
  roof.castShadow = true;
  root.add(roof);

  // Rotating barrel entrance.
  const barrel = new THREE.Group();
  barrel.position.set(0, 1.5, 3.1);
  barrel.rotation.x = Math.PI / 2;
  root.add(barrel);
  const barrelMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 2.4, 20, 1, true),
    M.canopy('#ffc23c', '#e6455c', 10),
  );
  barrel.add(barrelMesh);

  // Crooked windows and doors.
  for (let i = 0; i < 4; i++) {
    const x = -2.6 + i * 1.75;
    const w = M.box(0.9, 1.0, 0.1, M.glass(0xbfe4ff), x, 3.1, 2.55);
    w.rotation.z = Math.sin(i * 2) * 0.25;
    root.add(w);
  }

  // Spinning mirror pinwheels on the roof.
  const pinwheels = [];
  const mirrorMat = M.mat('fun-mirror', { color: 0xdfe8ff, roughness: 0.08, metalness: 1.0 });
  for (const x of [-2.4, 0, 2.4]) {
    const g = new THREE.Group();
    g.position.set(x, 6.4, 0);
    root.add(g);
    g.add(M.cyl(0.07, 1.6, M.bar(0xc8d0dc), 0, -0.8, 0, 6));
    const w = new THREE.Group();
    g.add(w);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.4), i % 2 ? mirrorMat : M.fabric(M.funColor(i)));
      blade.position.set(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0);
      blade.rotation.z = a;
      w.add(blade);
    }
    pinwheels.push(w);
  }

  // Slide down one side.
  const slideShape = new THREE.Shape();
  slideShape.moveTo(0, 0); slideShape.lineTo(1.4, 0); slideShape.lineTo(1.4, 0.18); slideShape.lineTo(0, 0.18);
  const slidePath = new THREE.CatmullRomCurve3([
    V(4.2, 4.0, -1.6), V(5.6, 2.9, -0.2), V(6.2, 1.2, 1.8), V(5.6, 0.35, 3.4),
  ]);
  const slideGeo = new THREE.TubeGeometry(slidePath, 40, 0.75, 8, false, );
  const slide = new THREE.Mesh(slideGeo, M.enamel(0xffc23c));
  slide.castShadow = true;
  root.add(slide);

  // Jester sign.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 1.2), new THREE.MeshBasicMaterial({
    map: T.signboard('Funhouse', '#241a3d', '#ffd76a'), transparent: true,
  }));
  sign.position.set(0, 4.9, 2.58);
  root.add(sign);
  const bulbs = C.bulbRing(3.6, 22, 5.0, 0xfff0c0, 0.11);
  bulbs.scale.z = 0.7;
  root.add(bulbs);

  const booth = C.operatorBooth(0x54d4f0);
  booth.position.set(-4.6, 0, 3.4);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 2.0, 5.0);
  root.add(camSeat);

  return {
    root, camSeat,
    bulbMats: [bulbs.userData.bulbMat],
    update(dt, t, st) {
      barrelMesh.rotation.y += dt * st.power * 1.8;
      for (let i = 0; i < pinwheels.length; i++) {
        pinwheels[i].rotation.z += dt * (0.9 + i * 0.4) * (0.3 + st.power);
      }
    },
  };
}

/* ================================================================== *
 * Circus Big Top — a show attraction with big capacity
 * ================================================================== */
export function circusTent(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h));

  const R = 6.2;
  // Main tent: cone roof + cylindrical wall.
  const roof = new THREE.Mesh(new THREE.ConeGeometry(R + 0.8, 5.5, 20, 1, true), M.canopy('#e6455c', '#fff6e8', 20));
  roof.position.y = 5.6;
  roof.castShadow = true;
  root.add(roof);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 3.0, 20, 1, true), M.canopy('#ffffff', '#f0e4d0', 20));
  wall.position.y = 1.5;
  wall.castShadow = true;
  root.add(wall);
  // Scalloped valance.
  const val = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.85, R + 0.75, 0.7, 20, 1, true), M.canopy('#ffd76a', '#3b8fe0', 20));
  val.position.y = 3.2;
  root.add(val);

  // Centre pole + flags.
  root.add(M.cyl(0.16, 4.0, M.bar(0xc8d0dc), 0, 8.4, 0, 8));
  const flags = [];
  for (let i = 0; i < 3; i++) {
    const f = C.pennant(0.8, M.funColor(i + 4), i);
    f.position.set(0, 9.4 + i * 0.6, 0);
    f.rotation.y = i * 2.1;
    root.add(f);
    flags.push(f.userData.flag);
  }
  // Perimeter poles with pennants.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const f = C.pennant(4.4, M.funColor(i), i);
    f.position.set(Math.cos(a) * (R + 1.4), 0, Math.sin(a) * (R + 1.4));
    f.rotation.y = -a;
    root.add(f);
    flags.push(f.userData.flag);
  }

  // Entrance marquee.
  const ent = new THREE.Group();
  ent.position.set(0, 0, R + 0.2);
  root.add(ent);
  ent.add(M.box(3.4, 3.0, 0.3, M.paint(0xe6455c, { rough: 0.5 }), 0, 1.5, 0));
  ent.add(M.box(2.2, 2.4, 0.4, M.glow(0x2a1a30, 0.5), 0, 1.2, 0.2));
  const marquee = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 12, 1, true, 0, Math.PI), M.canopy('#ffd76a', '#e6455c', 8));
  marquee.rotation.x = Math.PI / 2;
  marquee.rotation.z = Math.PI;
  marquee.position.set(0, 3.2, 0.9);
  ent.add(marquee);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({
    map: T.signboard('Big Top', '#3d1020', '#ffd76a'), transparent: true,
  }));
  sign.position.set(0, 4.2, 0.2);
  ent.add(sign);

  const bulbs = C.bulbRing(R + 0.9, 30, 3.5, 0xffe9b0, 0.13);
  root.add(bulbs);
  const bulbs2 = C.bulbRing(2.2, 14, 8.0, 0xfff0c0, 0.1);
  root.add(bulbs2);

  // Circus wagons parked outside.
  for (let i = 0; i < 2; i++) {
    const w = new THREE.Group();
    const a = 2.4 + i * 1.5;
    w.position.set(Math.cos(a) * (R + 2.6), 0, Math.sin(a) * (R + 2.6));
    w.rotation.y = -a;
    w.add(M.box(2.4, 1.4, 1.3, M.enamel(M.funColor(i + 6)), 0, 1.1, 0));
    w.add(M.box(2.5, 0.2, 1.4, M.paint(0xffca4a, { rough: 0.4, metal: 0.6 }), 0, 1.85, 0));
    for (const s of [-1, 1]) for (const z of [-0.5, 0.5]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 12), M.timber('#6b4423'));
      wh.rotation.z = Math.PI / 2;
      wh.position.set(s * 0.9, 0.4, z);
      w.add(wh);
    }
    // Bars.
    for (let b = 0; b < 6; b++) {
      w.add(M.cyl(0.04, 1.2, M.bar(0xffca4a), -1.0 + b * 0.4, 1.15, 0.66, 6));
    }
    root.add(w);
  }

  const booth = C.operatorBooth(0xe6455c);
  booth.position.set(R + 1.0, 0, -3.2);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 2.2, R + 3.0);
  root.add(camSeat);

  return {
    root, camSeat,
    bulbMats: [bulbs.userData.bulbMat, bulbs2.userData.bulbMat],
    update(dt, t, st) {
      for (const f of flags) C.waveFlag(f, t);
      // Marquee chase lights during a show.
      M.pulse(bulbs.userData.bulbMat, 1 + Math.sin(t * 6) * 0.45 * st.power);
    },
  };
}

/* ================================================================== *
 * Helter Skelter — cheap starter ride
 * ================================================================== */
export function helterSkelter(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h));

  const H = 9.0, R = 2.4;
  const tower = new THREE.Mesh(new THREE.ConeGeometry(R, H, 16, 1, true), M.canopy('#e6455c', '#fff6e8', 16));
  tower.position.y = H / 2;
  tower.castShadow = true;
  root.add(tower);
  root.add(M.cyl(R * 1.05, 0.4, M.paint(0xffc23c, { rough: 0.5 }), 0, 0.2, 0, 16));
  root.add(M.cone(0.55, 1.6, M.paint(0x3b8fe0, { rough: 0.5 }), 0, H + 0.6, 0, 10));
  const topLightMat = M.glowUnique(0xffe9b0, 3.2);
  const topLight = M.sphere(0.24, topLightMat, 0, H + 1.6, 0);
  root.add(topLight);

  // Helical slide wrapping the tower.
  const slidePts = [];
  const turns = 2.4;
  for (let i = 0; i <= 90; i++) {
    const k = i / 90;
    const a = k * Math.PI * 2 * turns;
    const y = H * 0.92 * (1 - k) + 0.6;
    const r = R * (1 - (1 - k) * 0.0) * (0.22 + (1 - (y / H)) * 0.82) + 0.45;
    slidePts.push(V(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  const slideCurve = new THREE.CatmullRomCurve3(slidePts);
  const slideGeo = new THREE.TubeGeometry(slideCurve, 160, 0.42, 8, false);
  const slide = new THREE.Mesh(slideGeo, M.enamel(0xffc23c));
  slide.castShadow = true;
  root.add(slide);
  // Outer lip so riders read as contained.
  const lipGeo = new THREE.TubeGeometry(slideCurve, 160, 0.06, 6, false);
  root.add(new THREE.Mesh(lipGeo, M.bar(0xc8d0dc)));

  // Landing mat.
  const mat = M.pad(1.8, M.rubber(0x3b4a63), 0.1);
  mat.position.set(Math.cos(0) * 2.9, 0.1, 0);
  root.add(mat);

  const bulbs = C.bulbRing(R * 1.15, 18, 0.5, 0xfff0c0, 0.1);
  root.add(bulbs);

  // Sliders — little figures whooshing down.
  const sliders = [];
  for (let i = 0; i < 3; i++) {
    const s = C.seatedRider(i + ctx.seed);
    s.scale.setScalar(0.8);
    s.visible = false;
    root.add(s);
    sliders.push({ s, t: i / 3 });
  }

  const booth = C.operatorBooth(0xe6455c);
  booth.position.set(3.2, 0, 3.2);
  root.add(booth);
  root.add(C.fenceRing(3.8, 22, 0x59617a, 0.9));

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 1.4, 3.4);
  root.add(camSeat);

  const tmp = new THREE.Vector3();
  return {
    root, camSeat,
    bulbMats: [bulbs.userData.bulbMat],
    update(dt, t, st) {
      for (const sl of sliders) {
        sl.s.visible = st.riders > 0;
        if (!sl.s.visible) continue;
        sl.t += dt * 0.22 * Math.max(0.35, st.power);
        if (sl.t > 1) sl.t -= 1;
        slideCurve.getPointAt(Math.min(sl.t, 1), tmp);
        sl.s.position.copy(tmp).add(V(0, 0.2, 0));
        sl.s.rotation.y = -sl.t * Math.PI * 2 * 2.4;
      }
      M.pulse(topLightMat, 0.8 + Math.sin(t * 4) * 0.35);
    },
  };
}
