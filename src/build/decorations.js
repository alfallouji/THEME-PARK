/**
 * Scenery: trees, gardens, water features, furniture and landmarks.
 *
 * Decorations don't earn money directly — they raise the local scenery rating,
 * which lifts guest happiness and what guests will pay at nearby rides and
 * shops. A few of them (bins, lamps) also have real mechanical roles.
 *
 * Performance note: scenery is placed in bulk, so anything that doesn't need
 * to move independently is merged into a single mesh at build time. A flower
 * bed is ~130 little boxes; as 130 separate meshes a decorated park would
 * spend its whole frame budget on draw calls.
 */
import * as THREE from 'three';
import * as M from './../gfx/Materials.js';
import * as T from './../gfx/Textures.js';
import * as C from './rides/common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Gentle wind sway applied to a whole merged prop. */
function sway(obj, t, phase, amount = 0.02) {
  obj.rotation.z = Math.sin(t * 0.9 + phase) * amount;
  obj.rotation.x = Math.cos(t * 0.7 + phase * 1.3) * amount * 0.6;
}

/* ================================================================== *
 * Trees
 * ================================================================== */
export function oakTree(ctx) {
  const root = new THREE.Group();
  const s = 0.85 + (ctx.seed % 5) * 0.12;
  const parts = [];
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2 * s, 0.34 * s, 2.4 * s, 7),
    M.paint(0x6b4a30, { rough: 0.95 }),
  );
  trunk.position.y = 1.2 * s;
  parts.push(trunk);

  const greens = [0x3f8f43, 0x4f9e50, 0x357a3c];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + ctx.seed;
    const r = i === 0 ? 0 : 0.7 * s;
    const b = new THREE.Mesh(
      new THREE.IcosahedronGeometry((i === 0 ? 1.5 : 1.0) * s, 1),
      M.foliage(greens[(i + ctx.seed) % greens.length]),
    );
    b.position.set(Math.cos(a) * r, (2.6 + (i === 0 ? 0.5 : 0)) * s, Math.sin(a) * r);
    parts.push(b);
  }
  const crown = new THREE.Group();
  const merged = M.mergeColored(parts);
  if (merged) crown.add(merged);
  root.add(crown);

  const phase = ctx.seed * 1.7;
  return {
    root,
    update(dt, t) { sway(crown, t, phase, 0.016); },
  };
}

export function pineTree(ctx) {
  const root = new THREE.Group();
  const s = 0.9 + (ctx.seed % 4) * 0.14;
  const parts = [M.cyl(0.18 * s, 1.4 * s, M.paint(0x5a3f28, { rough: 0.95 }), 0, 0.7 * s, 0, 7)];
  const col = [0x2f6b3a, 0x27603a, 0x387a44][ctx.seed % 3];
  for (let i = 0; i < 4; i++) {
    const r = (1.35 - i * 0.28) * s;
    const c = M.cone(r, 1.5 * s, M.foliage(col), 0, (1.4 + i * 0.85) * s, 0, 9);
    c.rotation.y = i * 0.4;
    parts.push(c);
  }
  const body = new THREE.Group();
  const merged = M.mergeColored(parts);
  if (merged) body.add(merged);
  root.add(body);
  const phase = ctx.seed;
  return {
    root,
    update(dt, t) { sway(body, t, phase, 0.01); },
  };
}

export function palmTree(ctx) {
  const root = new THREE.Group();
  const s = 0.95 + (ctx.seed % 3) * 0.12;
  // Curved trunk built from stacked segments, then merged.
  const trunkParts = [];
  let x = 0, y = 0;
  const lean = ((ctx.seed % 5) - 2) * 0.09;
  for (let i = 0; i < 8; i++) {
    const h = 0.55 * s;
    const seg = M.cyl(0.19 * s - i * 0.012, h * 1.05, M.paint(0xa08050, { rough: 0.92 }), x, y + h / 2, 0, 8);
    seg.rotation.z = lean * i * 0.5;
    trunkParts.push(seg);
    x += Math.sin(lean * i * 0.5) * h;
    y += h;
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    trunkParts.push(M.sphere(0.13, M.paint(0xc9a227, { rough: 0.7 }),
      x + Math.cos(a) * 0.3, y - 0.25, Math.sin(a) * 0.3));
  }
  const trunkMesh = M.mergeColored(trunkParts);
  if (trunkMesh) root.add(trunkMesh);

  // Fronds stay separate so they can flutter.
  const crown = new THREE.Group();
  crown.position.set(x, y, 0);
  root.add(crown);
  const fronds = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(2.4 * s, 0.7 * s, 6, 1), M.fabric(0x3f9e4a));
    f.position.set(Math.cos(a) * 1.1 * s, 0.1, Math.sin(a) * 1.1 * s);
    f.rotation.y = -a;
    f.rotation.z = -0.45;
    crown.add(f);
    fronds.push({ f, ph: i });
  }
  return {
    root,
    update(dt, t) {
      for (const fr of fronds) fr.f.rotation.z = -0.45 + Math.sin(t * 1.4 + fr.ph) * 0.08;
    },
  };
}

export function cherryTree(ctx) {
  const root = new THREE.Group();
  const s = 0.9;
  const parts = [M.cyl(0.18 * s, 2.0 * s, M.paint(0x5a4432, { rough: 0.95 }), 0, 1.0 * s, 0, 7)];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    parts.push(M.strut(V(0, 1.7 * s, 0), V(Math.cos(a) * 0.9, 2.7 * s, Math.sin(a) * 0.9),
      0.09, M.paint(0x5a4432, { rough: 0.95 })));
  }
  const pinks = [0xffc0d8, 0xffd4e4, 0xffb0cc];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = i < 5 ? 0.95 : 0;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85 * s, 1), M.foliage(pinks[i % 3]));
    b.position.set(Math.cos(a) * r, (2.9 + (i % 2) * 0.35) * s, Math.sin(a) * r);
    parts.push(b);
  }
  const canopy = new THREE.Group();
  const merged = M.mergeColored(parts);
  if (merged) canopy.add(merged);
  root.add(canopy);

  // Falling petals: one instanced mesh rather than a mesh per petal.
  const COUNT = 16;
  const petals = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.11, 0.11), M.fabric(0xffc9de), COUNT,
  );
  petals.frustumCulled = false;
  root.add(petals);
  const state = [];
  for (let i = 0; i < COUNT; i++) {
    state.push({
      x: (Math.random() - 0.5) * 2.4, y: Math.random() * 3, z: (Math.random() - 0.5) * 2.4,
      v: 0.2 + Math.random() * 0.25, sp: Math.random() * 6,
    });
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const vv = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const phase = ctx.seed * 0.9;

  return {
    root,
    update(dt, t) {
      sway(canopy, t, phase, 0.012);
      for (let i = 0; i < COUNT; i++) {
        const p = state[i];
        p.y -= p.v * dt;
        p.x += Math.sin(t + p.sp) * dt * 0.3;
        if (p.y < 0.1) { p.y = 3.2; }
        e.set(t * 2 + p.sp, t * 1.4, t);
        q.setFromEuler(e);
        vv.set(p.x, p.y, p.z);
        m4.compose(vv, q, one);
        petals.setMatrixAt(i, m4);
      }
      petals.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ================================================================== *
 * Gardens
 * ================================================================== */
export function flowerBed(ctx) {
  const root = new THREE.Group();
  const border = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.16, 6, 20), M.mat('bed-brick', {
    map: T.paving('brick'), roughness: 0.9,
  }));
  border.rotation.x = Math.PI / 2;
  border.position.y = 0.16;
  border.scale.set(1, 1, 1.2);
  root.add(border);
  root.add(M.pad(0.86, M.paint(0x5a4433, { rough: 1.0 }), 0.14));

  const parts = [];
  const cols = [0xe6455c, 0xffc23c, 0xff7bb0, 0xa06cf0, 0xffffff];
  for (let i = 0; i < 18; i++) {
    const a = i * 2.399;
    const r = Math.sqrt(i / 18) * 0.72;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    parts.push(M.cyl(0.02, 0.28, M.paint(0x3f7a3a, { rough: 0.9 }), bx, 0.29, bz, 4));
    const col = cols[i % cols.length];
    for (let p = 0; p < 5; p++) {
      const pa = (p / 5) * Math.PI * 2;
      parts.push(M.sphere(0.055, M.paint(col, { rough: 0.7 }),
        bx + Math.cos(pa) * 0.06, 0.45, bz + Math.sin(pa) * 0.06));
    }
    parts.push(M.sphere(0.04, M.paint(0xffe066, { rough: 0.6 }), bx, 0.47, bz));
  }
  const blooms = new THREE.Group();
  const merged = M.mergeColored(parts);
  if (merged) blooms.add(merged);
  root.add(blooms);

  const phase = ctx.seed;
  return {
    root,
    update(dt, t) { sway(blooms, t, phase, 0.035); },
  };
}

export function gardenPlanter(ctx) {
  const root = new THREE.Group();
  root.add(M.box(1.8, 0.55, 0.8, M.timber('#9a7248'), 0, 0.3, 0));
  root.add(M.box(1.68, 0.1, 0.68, M.paint(0x5a4433, { rough: 1.0 }), 0, 0.58, 0));
  const parts = [];
  for (let i = 0; i < 10; i++) {
    const x = -0.75 + (i % 5) * 0.37;
    const z = i < 5 ? -0.16 : 0.16;
    parts.push(M.cyl(0.02, 0.22, M.paint(0x3f7a3a, { rough: 0.9 }), x, 0.71, z, 4));
    parts.push(M.sphere(0.1, M.paint(M.funColor(i * 2), { rough: 0.7 }), x, 0.86, z));
  }
  const blooms = new THREE.Group();
  const merged = M.mergeColored(parts);
  if (merged) blooms.add(merged);
  root.add(blooms);
  const phase = ctx.seed * 0.5;
  return {
    root,
    update(dt, t) { sway(blooms, t, phase, 0.04); },
  };
}

export function hedge(ctx) {
  const root = new THREE.Group();
  const merged = M.mergeColored([
    M.box(1.85, 1.1, 1.85, M.foliage(0x357a3c), 0, 0.55, 0),
    M.box(1.9, 0.14, 1.9, M.foliage(0x4f9e50), 0, 1.12, 0),
  ]);
  if (merged) root.add(merged);
  return { root, update() {} };
}

export function topiary(ctx) {
  const root = new THREE.Group();
  const parts = [
    M.cyl(0.42, 0.4, M.mat('topi-pot', { map: T.paving('brick'), roughness: 0.9 }), 0, 0.2, 0, 12),
  ];
  // The pot keeps its brick texture, so it stays out of the colour merge.
  root.add(parts.pop());

  const green = [];
  green.push(M.cyl(0.14, 0.5, M.paint(0x5a4432, { rough: 0.9 }), 0, 0.6, 0, 6));
  const kind = ['sphere', 'cone', 'spiral'][ctx.seed % 3];
  if (kind === 'sphere') {
    green.push(M.sphere(0.55, M.foliage(0x3f8f43), 0, 1.25, 0));
    green.push(M.sphere(0.38, M.foliage(0x4f9e50), 0, 1.9, 0));
  } else if (kind === 'cone') {
    green.push(M.cone(0.55, 1.6, M.foliage(0x357a3c), 0, 1.6, 0, 10));
  } else {
    for (let i = 0; i < 5; i++) {
      const d = new THREE.Mesh(new THREE.TorusGeometry(0.5 - i * 0.07, 0.15, 6, 14), M.foliage(0x3f8f43));
      d.rotation.x = Math.PI / 2;
      d.position.y = 0.95 + i * 0.32;
      d.rotation.z = i * 0.6;
      green.push(d);
    }
  }
  const merged = M.mergeColored(green);
  if (merged) root.add(merged);
  return { root, update() {} };
}

/* ================================================================== *
 * Water features
 * ================================================================== */
export function fountain(ctx) {
  const root = new THREE.Group();
  const stone = M.mat('fount-stone', { color: 0xd8d4c8, roughness: 0.85, map: T.stucco('#efe9dc') });

  const stoneParts = [
    new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.65, 24), stone).translateY(0.32),
    new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.3, 14), stone).translateY(1.3),
    new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.9, 0.25, 18), stone).translateY(2.0),
    new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.9, 12), stone).translateY(2.5),
    new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.42, 0.2, 14), stone).translateY(3.0),
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const spout = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), stone);
    spout.position.set(Math.cos(a) * 1.7, 2.1, Math.sin(a) * 1.7);
    stoneParts.push(spout);
  }
  const stoneMesh = M.mergeMeshes(stoneParts, stone);
  if (stoneMesh) root.add(stoneMesh);

  root.add(new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.1, 24), M.mat('fount-water', {
    color: 0x3fb6d8, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85,
    emissive: 0x0d3a4a, emissiveIntensity: 0.4,
  })).translateY(0.62));

  // Water jets: one cone plus an instanced spray of droplets.
  const jetMat = new THREE.MeshStandardMaterial({
    color: 0x9fe4f5, transparent: true, opacity: 0.55, roughness: 0.1,
    emissive: 0x3fb6d8, emissiveIntensity: 0.6,
  });
  const mainJet = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.6, 8), jetMat);
  mainJet.position.y = 3.9;
  root.add(mainJet);

  const N = 24;
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 5), jetMat, N);
  drops.frustumCulled = false;
  root.add(drops);
  const state = [];
  for (let i = 0; i < N; i++) {
    state.push({
      a: (i / N) * Math.PI * 2, t: Math.random(),
      speed: 0.7 + Math.random() * 0.4, reach: 1.5 + Math.random() * 0.6,
    });
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();

  return {
    root,
    update(dt, t) {
      mainJet.scale.y = 1 + Math.sin(t * 4) * 0.12;
      for (let i = 0; i < N; i++) {
        const d = state[i];
        d.t += dt * d.speed;
        if (d.t > 1) d.t -= 1;
        const k = d.t;
        const r = k * d.reach;
        v.set(
          Math.cos(d.a) * r,
          4.6 + (0.55 - Math.pow(k * 2 - 0.55, 2) * 1.5) - k * 1.4,
          Math.sin(d.a) * r,
        );
        sc.setScalar(1 - k * 0.4);
        m4.compose(v, q, sc);
        drops.setMatrixAt(i, m4);
      }
      drops.instanceMatrix.needsUpdate = true;
    },
  };
}

export function pond(ctx) {
  const root = new THREE.Group();
  const stoneMat = M.mat('pond-stone', { color: 0x9a9488, roughness: 0.95 });
  const lip = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.22, 8, 26), stoneMat);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.16;
  lip.scale.set(1.2, 1, 1);
  root.add(lip);

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2f9ec0, roughness: 0.1, metalness: 0.15,
    transparent: true, opacity: 0.86, emissive: 0x0b3040, emissiveIntensity: 0.35,
  });
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.1, 30), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.12;
  water.scale.set(1.2, 1, 1);
  root.add(water);

  // Lily pads and reeds merge; the koi keep swimming on their own.
  const green = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + ctx.seed;
    const r = 0.6 + (i % 3) * 0.45;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10, 0.3, Math.PI * 1.85), M.foliage(0x3f8f43));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(Math.cos(a) * r * 1.2, 0.15, Math.sin(a) * r);
    green.push(pad);
    if (i % 2 === 0) {
      green.push(M.sphere(0.1, M.paint(0xffc0d8, { rough: 0.7 }), pad.position.x, 0.22, pad.position.z));
    }
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + ctx.seed * 0.3;
    const r = 2.0 + (i % 3) * 0.13;
    const reed = M.cyl(0.03, 0.9 + (i % 4) * 0.15, M.foliage(0x4f8f3a),
      Math.cos(a) * r * 1.2, 0.5, Math.sin(a) * r, 4);
    reed.rotation.z = ((i % 5) - 2) * 0.06;
    green.push(reed);
  }
  const greenMesh = M.mergeColored(green);
  if (greenMesh) root.add(greenMesh);

  const fish = [];
  for (let i = 0; i < 3; i++) {
    const f = M.sphere(0.13, M.paint([0xff8a3d, 0xffffff, 0xe6455c][i], { rough: 0.4 }), 0, 0.05, 0);
    f.scale.set(1.8, 0.7, 0.8);
    root.add(f);
    fish.push({ f, a: i * 2.1, r: 0.9 + i * 0.35 });
  }
  return {
    root,
    update(dt, t) {
      waterMat.emissiveIntensity = 0.28 + Math.sin(t * 1.4) * 0.1;
      for (const fs of fish) {
        fs.a += dt * 0.5;
        fs.f.position.set(Math.cos(fs.a) * fs.r * 1.2, 0.06, Math.sin(fs.a) * fs.r);
        fs.f.rotation.y = -fs.a + Math.PI / 2;
      }
    },
  };
}

/* ================================================================== *
 * Furniture
 * ================================================================== */
export function bench(ctx) {
  const root = new THREE.Group();
  const wood = M.paint(0xa8743f, { rough: 0.78 });
  const iron = M.paint(0x2b3040, { rough: 0.6, metal: 0.4 });
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(M.box(0.12, 0.45, 0.6, iron, s * 0.75, 0.22, 0));
    parts.push(M.box(0.1, 0.6, 0.1, iron, s * 0.75, 0.72, -0.26));
  }
  for (let i = 0; i < 3; i++) parts.push(M.box(1.8, 0.07, 0.16, wood, 0, 0.47, -0.2 + i * 0.2));
  for (let i = 0; i < 3; i++) parts.push(M.box(1.8, 0.14, 0.07, wood, 0, 0.62 + i * 0.19, -0.28));
  const merged = M.mergeColored(parts);
  if (merged) root.add(merged);
  return { root, update() {} };
}

export function lampPost(ctx) {
  const root = new THREE.Group();
  const iron = M.paint(0x2b3040, { rough: 0.5, metal: 0.4 });
  const parts = [
    M.cyl(0.18, 0.3, iron, 0, 0.15, 0, 10),
    M.cyl(0.09, 3.6, iron, 0, 1.8, 0, 10),
    M.cyl(0.14, 0.14, iron, 0, 3.6, 0, 10),
    M.cone(0.36, 0.3, iron, 0, 4.22, 0, 10),
  ];
  // Hanging flower baskets.
  for (const s of [-1, 1]) {
    parts.push(M.strut(V(0, 3.35, 0), V(s * 0.42, 3.25, 0), 0.04, iron));
    parts.push(M.cyl(0.18, 0.2, M.paint(0x8a5a30, { rough: 0.85 }), s * 0.42, 3.15, 0, 10));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      parts.push(M.sphere(0.09, M.paint(M.funColor(i + ctx.seed), { rough: 0.7 }),
        s * 0.42 + Math.cos(a) * 0.14, 3.27, Math.sin(a) * 0.14));
    }
  }
  const merged = M.mergeColored(parts);
  if (merged) root.add(merged);

  // The glowing head stays separate; the bulb registry dims it by day.
  const lampMat = M.glow(0xffe0a0, 2.6);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), lampMat);
  head.position.y = 3.9;
  root.add(head);

  // A real light so lamps actually illuminate the path after dark.
  const light = new THREE.PointLight(0xffd8a0, 0, 13, 2);
  light.position.y = 3.9;
  root.add(light);

  return {
    root,
    isLamp: true,
    update(dt, t, st) {
      light.intensity = st.night > 0.35 ? 9 * st.night : 0;
    },
  };
}

export function trashBin(ctx) {
  const root = new THREE.Group();
  const parts = [
    new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.9, 12), M.paint(0x2f6b3a, { rough: 0.6 })).translateY(0.45),
    M.cyl(0.38, 0.1, M.paint(0x1f4a28, { rough: 0.6 }), 0, 0.95, 0, 12),
    M.cyl(0.26, 0.08, M.paint(0x15301c, { rough: 0.8 }), 0, 1.0, 0, 12),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const slat = M.box(0.08, 0.7, 0.05, M.paint(0x24552c, { rough: 0.7 }),
      Math.cos(a) * 0.33, 0.45, Math.sin(a) * 0.33);
    slat.rotation.y = -a;
    parts.push(slat);
  }
  const merged = M.mergeColored(parts);
  if (merged) root.add(merged);
  return { root, isBin: true, binRadius: 7, update() {} };
}

export function gazebo(ctx) {
  const root = new THREE.Group();
  const white = M.paint(0xf5f7fb, { rough: 0.6 });
  const wood = M.paint(0xc39a68, { rough: 0.78 });

  root.add(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.7, 0.35, 8), M.mat('gaz-floor', {
    map: T.paving('wood'), roughness: 0.8,
  })).translateY(0.2));

  const parts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(M.cyl(0.11, 2.7, white, Math.cos(a) * 2.3, 1.7, Math.sin(a) * 2.3, 8));
    const a2 = ((i + 1) / 8) * Math.PI * 2;
    if (i !== 0) {
      parts.push(M.strut(
        V(Math.cos(a) * 2.3, 1.0, Math.sin(a) * 2.3),
        V(Math.cos(a2) * 2.3, 1.0, Math.sin(a2) * 2.3), 0.07, white,
      ));
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
    const b = M.box(1.4, 0.1, 0.4, wood, Math.cos(a) * 1.7, 0.75, Math.sin(a) * 1.7);
    b.rotation.y = -a;
    parts.push(b);
  }
  const merged = M.mergeColored(parts);
  if (merged) root.add(merged);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.6, 8), M.canopy('#e6455c', '#fff6e8', 8));
  roof.position.y = 3.85;
  roof.castShadow = true;
  root.add(roof);
  root.add(M.sphere(0.22, M.paint(0xffca4a, { rough: 0.25, metal: 0.9 }), 0, 4.8, 0));
  const bulbs = C.bulbRing(3.0, 16, 3.15, 0xffe9b0, 0.09);
  root.add(bulbs);
  return { root, bulbMats: [bulbs.userData.bulbMat], update() {} };
}

export function statue(ctx) {
  const root = new THREE.Group();
  const stone = M.mat('statue-stone', { color: 0xd4cfc2, roughness: 0.8, map: T.stucco('#e8e2d4') });
  const bronze = M.paint(0xb08040, { rough: 0.35, metal: 0.85 });

  const stoneParts = [
    new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 1.8), stone).translateY(0.15),
    new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 1.3), stone).translateY(1.05),
    new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 1.6), stone).translateY(1.9),
  ];
  const sm = M.mergeMeshes(stoneParts, stone);
  if (sm) root.add(sm);

  // A cheerful mascot figure.
  const fig = [];
  fig.push(M.box(0.55, 0.75, 0.38, bronze, 0, 2.4, 0));
  fig.push(M.sphere(0.28, bronze, 0, 3.0, 0));
  fig.push(M.cone(0.3, 0.45, bronze, 0, 3.35, 0, 10));
  fig.push(M.sphere(0.1, bronze, 0, 3.6, 0));
  for (const s of [-1, 1]) {
    const arm = M.box(0.15, 0.6, 0.15, bronze, s * 0.38, 2.55, 0);
    arm.rotation.z = s * (s > 0 ? 1.1 : 0.4);
    fig.push(arm);
    fig.push(M.box(0.18, 0.5, 0.2, bronze, s * 0.16, 1.8, 0));
  }
  fig.push(M.box(0.9, 0.35, 0.05, bronze, 0, 1.1, 0.68));
  const fm = M.mergeMeshes(fig, bronze);
  if (fm) root.add(fm);
  return { root, update() {} };
}

export function clockTower(ctx) {
  const root = new THREE.Group();
  const stone = M.plaster('#efe4d0');
  const trim = M.paint(0xc0304a, { rough: 0.55 });
  root.add(M.box(2.6, 0.5, 2.6, stone, 0, 0.25, 0));
  root.add(M.box(2.0, 8.0, 2.0, stone, 0, 4.3, 0));
  root.add(M.box(2.4, 0.3, 2.4, trim, 0, 8.4, 0));
  root.add(M.box(2.2, 1.6, 2.2, stone, 0, 9.3, 0));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.0, 4), trim);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 11.1;
  roof.castShadow = true;
  root.add(roof);
  root.add(M.cyl(0.05, 1.2, M.paint(0xffca4a, { rough: 0.3, metal: 0.8 }), 0, 12.6, 0, 6));
  root.add(M.sphere(0.18, M.glow(0xffd76a, 2.4), 0, 13.3, 0));

  // Four clock faces. The dial merges; only the hands move.
  const hands = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const face = new THREE.Group();
    face.position.set(Math.cos(a) * 1.02, 9.3, Math.sin(a) * 1.02);
    face.rotation.y = -a + Math.PI / 2;
    root.add(face);

    const dial = [];
    dial.push(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 20),
      M.paint(0xfff6e8, { rough: 0.5 })).rotateX(Math.PI / 2));
    dial.push(new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 6, 20),
      M.paint(0xffca4a, { rough: 0.3, metal: 0.85 })));
    for (let h = 0; h < 12; h++) {
      const ha = (h / 12) * Math.PI * 2;
      dial.push(M.box(0.05, 0.12, 0.03, M.paint(0x2b3040, { rough: 0.6 }),
        Math.sin(ha) * 0.56, Math.cos(ha) * 0.56, 0.06));
    }
    const dm = M.mergeColored(dial);
    if (dm) face.add(dm);

    const handMat = M.paint(0x2b3040, { rough: 0.6 });
    const hourPivot = new THREE.Group();
    hourPivot.position.z = 0.02;
    hourPivot.add(M.box(0.06, 0.34, 0.03, handMat, 0, 0.17, 0.08));
    const minPivot = new THREE.Group();
    minPivot.position.z = 0.02;
    minPivot.add(M.box(0.045, 0.5, 0.03, handMat, 0, 0.25, 0.1));
    face.add(hourPivot, minPivot);
    hands.push({ hourPivot, minPivot });
  }
  const bulbs = C.bulbRing(1.3, 12, 8.6, 0xffe9b0, 0.09);
  root.add(bulbs);

  return {
    root, bulbMats: [bulbs.userData.bulbMat],
    update(dt, t, st) {
      const hour = (st.dayFraction ?? 0) * 24;
      for (const h of hands) {
        h.hourPivot.rotation.z = -(hour % 12) / 12 * Math.PI * 2;
        h.minPivot.rotation.z = -(hour % 1) * Math.PI * 2;
      }
    },
  };
}

export function rockGarden(ctx) {
  const root = new THREE.Group();
  root.add(M.pad(1.5, M.mat('zen-sand', { map: T.sand(), roughness: 1.0 }), 0.08));
  const parts = [];
  const rockCol = M.paint(0x74787f, { rough: 1.0 });
  for (let i = 0; i < 6; i++) {
    const a = i * 2.399 + ctx.seed;
    const r = 0.3 + (i % 3) * 0.42;
    const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + (i % 4) * 0.13, 0), rockCol);
    rk.position.set(Math.cos(a) * r, 0.16 + (i % 3) * 0.06, Math.sin(a) * r);
    rk.rotation.set(i, i * 1.7, i * 0.6);
    parts.push(rk);
  }
  for (let i = 1; i <= 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(i * 0.38, 0.02, 4, 28), M.paint(0xd8cfb8, { rough: 1.0 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    parts.push(ring);
  }
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    const bx = Math.cos(a) * 1.15, bz = Math.sin(a) * 1.15;
    for (let b = 0; b < 5; b++) {
      const bl = M.cyl(0.02, 0.5 + (b % 3) * 0.12, M.foliage(0x5a9e3a),
        bx + ((b % 3) - 1) * 0.05, 0.35, bz + ((b % 2) - 0.5) * 0.08, 4);
      bl.rotation.z = ((b % 3) - 1) * 0.15;
      parts.push(bl);
    }
  }
  const merged = M.mergeColored(parts);
  if (merged) root.add(merged);
  return { root, update() {} };
}

export function bannerArch(ctx) {
  const root = new THREE.Group();
  const post = M.paint(0x2b3040, { rough: 0.5, metal: 0.4 });
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(M.cyl(0.14, 4.4, post, s * 2.4, 2.2, 0, 10));
    parts.push(M.cyl(0.26, 0.24, post, s * 2.4, 0.12, 0, 10));
  }
  parts.push(M.box(5.2, 0.2, 0.2, post, 0, 4.4, 0));
  const merged = M.mergeMeshes(parts, post);
  if (merged) root.add(merged);

  const geo = new THREE.PlaneGeometry(4.6, 1.5, 14, 4);
  const banner = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: T.signboard('Welcome', '#1d2740', '#ffd76a'),
    roughness: 0.8, side: THREE.DoubleSide, transparent: true,
  }));
  banner.position.set(0, 3.5, 0);
  root.add(banner);
  const bulbs = C.bulbLine(V(-2.4, 4.55, 0), V(2.4, 4.55, 0), 14, 0xffe9b0, 0.1);
  root.add(bulbs);

  const base = geo.attributes.position.array.slice();
  return {
    root, bulbMats: [bulbs.userData.bulbMat],
    update(dt, t) {
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        pos.setZ(i, Math.sin(t * 2.4 + x * 1.6) * 0.14 * (1 - Math.abs(x) / 2.5)
          + Math.sin(t * 1.3 + y) * 0.04);
      }
      pos.needsUpdate = true;
    },
  };
}

export function fireworkLauncher(ctx) {
  const root = new THREE.Group();
  const parts = [M.box(1.4, 0.4, 1.4, M.paint(0x2b3040, { rough: 0.7 }), 0, 0.2, 0)];
  const tubePositions = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const r = i === 4 ? 0 : 0.38;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const tube = M.cyl(0.14, 0.9, M.paint(M.funColor(i), { rough: 0.5 }), x, 0.75, z, 10);
    tube.rotation.z = x * -0.18;
    tube.rotation.x = z * 0.18;
    parts.push(tube);
    tubePositions.push(V(x, 1.2, z));
  }
  parts.push(M.box(0.6, 0.5, 0.1, M.paint(0xe6455c, { rough: 0.5 }), 0, 0.55, 0.72));
  const merged = M.mergeColored(parts);
  if (merged) root.add(merged);

  const ledMat = M.glowUnique(0x2bff6a, 2.4);
  root.add(M.sphere(0.08, ledMat, 0, 0.72, 0.78));

  let timer = 3 + Math.random() * 4;
  return {
    root,
    isLauncher: true,
    update(dt, t, st) {
      M.pulse(ledMat, 0.7 + Math.sin(t * 4) * 0.5);
      // Only fires after dark.
      if (st.night < 0.5) return;
      timer -= dt;
      if (timer <= 0) {
        timer = 3.5 + Math.random() * 5;
        const p = tubePositions[(Math.random() * tubePositions.length) | 0];
        ctx.fx?.firework(root.localToWorld(p.clone()));
      }
    },
  };
}
