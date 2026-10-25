/**
 * Shops, stalls and facilities.
 *
 * All of them share a stall chassis (counter, striped awning, signboard) and
 * then add the props that make each one recognisable from across the park —
 * a giant burger, a swaying balloon bunch, a spinning ice-cream cone.
 */
import * as THREE from 'three';
import * as M from './../gfx/Materials.js';
import * as T from './../gfx/Textures.js';
import * as C from './rides/common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Generic stall chassis.
 * @returns {{root:THREE.Group, top:number, bulbMat:THREE.Material, signMesh:THREE.Mesh}}
 */
function stall(ctx, {
  w = 3.4, d = 2.6, h = 2.6,
  body = '#f5efe2', roofA = '#e6455c', roofB = '#fff6e8',
  label = 'Shop', signBg = '#1d2740', signFg = '#ffd76a',
  counter = true,
} = {}) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h, { color: 0xc4c8cf }));

  // Body.
  root.add(M.box(w, h, d, M.plaster(body), 0, h / 2 + 0.1, 0));
  // Back and side trim.
  root.add(M.box(w + 0.15, 0.2, d + 0.15, M.paint(0x8d96a8, { rough: 0.7 }), 0, 0.2, 0));

  // Awning over the service side (+z).
  const awn = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, w + 0.4, 16, 1, false, 0, Math.PI / 2),
    M.canopy(roofA, roofB, 10),
  );
  awn.rotation.z = Math.PI / 2;
  awn.rotation.y = Math.PI;
  awn.position.set(0, h + 0.1, d / 2 + 0.05);
  awn.castShadow = true;
  root.add(awn);

  // Roof cap.
  root.add(M.box(w + 0.4, 0.22, d + 0.3, M.paint(0x59617a, { rough: 0.7 }), 0, h + 0.2, 0));

  // Counter with a serving window.
  if (counter) {
    root.add(M.box(w * 0.92, 0.16, 0.5, M.timber('#b5834a'), 0, h * 0.55, d / 2 + 0.2));
    root.add(M.box(w * 0.78, h * 0.42, 0.1, M.glow(0x2a2f3d, 0.25), 0, h * 0.72, d / 2 + 0.01));
    for (const s of [-1, 1]) {
      root.add(M.cyl(0.06, h * 0.55, M.bar(0xc8d0dc), s * w * 0.44, h * 0.28, d / 2 + 0.35, 6));
    }
  }

  // Signboard above the awning.
  const signMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.88, w * 0.88 * 0.25),
    new THREE.MeshBasicMaterial({
      map: T.signboard(label, signBg, signFg), transparent: true,
    }),
  );
  signMesh.position.set(0, h + 0.75, d / 2 + 0.1);
  root.add(signMesh);
  root.add(M.box(w * 0.9, w * 0.9 * 0.26, 0.08, M.paint(0x1d2740, { rough: 0.6 }), 0, h + 0.75, d / 2 + 0.04));

  // Bulb string along the awning edge.
  const bulbs = C.bulbLine(
    V(-w / 2, h + 0.05, d / 2 + 1.42), V(w / 2, h + 0.05, d / 2 + 1.42), 10, 0xffe9b0, 0.09,
  );
  root.add(bulbs);

  // Menu chalkboard + a couple of stools.
  root.add(M.box(0.9, 1.2, 0.08, M.paint(0x2b3040, { rough: 0.9 }), -w / 2 - 0.1, 1.0, d / 2 + 0.6).rotateY(0.4));

  return { root, bulbMat: bulbs.userData.bulbMat, signMesh, w, d, h };
}

/** Parasol + table set placed beside food shops. */
function patioSet(x, z, colorIdx) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(M.cyl(0.05, 2.3, M.bar(0xc8d0dc), 0, 1.15, 0, 8));
  const umb = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.55, 10), M.canopy(
    '#' + new THREE.Color(M.funColor(colorIdx)).getHexString(), '#fff6e8', 10,
  ));
  umb.position.y = 2.3;
  umb.castShadow = true;
  g.add(umb);
  g.add(M.cyl(0.62, 0.08, M.paint(0xf0f3f8, { rough: 0.5 }), 0, 0.78, 0, 14));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.add(M.cyl(0.24, 0.1, M.paint(0xe6455c, { rough: 0.6 }), Math.cos(a) * 1.0, 0.45, Math.sin(a) * 1.0, 10));
    g.add(M.cyl(0.04, 0.45, M.bar(0xc8d0dc), Math.cos(a) * 1.0, 0.22, Math.sin(a) * 1.0, 6));
  }
  return g;
}

/* ================================================================== *
 * Food
 * ================================================================== */
export function burgerStand(ctx) {
  const s = stall(ctx, { label: 'Burgers', roofA: '#e6455c', roofB: '#ffd76a', body: '#fff0d8' });
  const root = s.root;

  // Giant rooftop burger.
  const burger = new THREE.Group();
  burger.position.set(0, s.h + 1.9, 0);
  root.add(burger);
  const bunTop = M.sphere(0.9, M.enamel(0xd99b4a), 0, 0.45, 0);
  bunTop.scale.y = 0.6;
  burger.add(bunTop);
  burger.add(M.cyl(0.92, 0.22, M.enamel(0x6b4423), 0, 0.05, 0, 16));
  burger.add(M.cyl(0.98, 0.1, M.enamel(0x6ec24a), 0, -0.1, 0, 16));
  burger.add(M.cyl(0.95, 0.12, M.enamel(0xffc23c), 0, -0.2, 0, 16));
  burger.add(M.cyl(0.9, 0.28, M.enamel(0xc98a3f), 0, -0.4, 0, 16));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    burger.add(M.sphere(0.07, M.enamel(0xfff6e8), Math.cos(a) * 0.4, 0.72, Math.sin(a) * 0.4));
  }

  root.add(patioSet(3.1, 1.8, 1));
  const grillSmoke = V(0.8, s.h * 0.9, 0.2);

  let smokeT = 0;
  return {
    root, bulbMats: [s.bulbMat],
    update(dt, t, st) {
      burger.rotation.y += dt * 0.5;
      burger.position.y = s.h + 1.9 + Math.sin(t * 1.5) * 0.08;
      smokeT -= dt;
      if (smokeT <= 0 && st.open) {
        smokeT = 0.55;
        ctx.fx?.smoke(root.localToWorld(grillSmoke.clone()), 0.32, 0xdddddd);
      }
    },
  };
}

export function pizzaPlace(ctx) {
  const s = stall(ctx, { w: 4.0, d: 3.0, label: 'Pizza', roofA: '#2f7a3a', roofB: '#fff6e8', body: '#f7e9cf' });
  const root = s.root;

  // Brick oven chimney.
  root.add(M.box(0.8, 1.6, 0.8, M.mat('pizza-brick', { map: T.paving('brick'), roughness: 0.9 }), -1.4, s.h + 0.9, -0.8));
  const chimTop = V(-1.4, s.h + 1.9, -0.8);

  // Spinning pizza sign.
  const pizza = new THREE.Group();
  pizza.position.set(1.3, s.h + 1.7, 0);
  root.add(pizza);
  pizza.add(M.cyl(1.0, 0.16, M.enamel(0xe8c98a), 0, 0, 0, 20));
  pizza.add(M.cyl(0.86, 0.08, M.enamel(0xe0673c), 0, 0.1, 0, 20));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    pizza.add(M.cyl(0.13, 0.06, M.enamel(0xc0304a), Math.cos(a) * 0.52, 0.16, Math.sin(a) * 0.52, 10));
  }

  root.add(patioSet(3.4, 2.0, 4));
  root.add(patioSet(-3.4, 2.2, 6));

  let smokeT = 0;
  return {
    root, bulbMats: [s.bulbMat],
    update(dt, t, st) {
      pizza.rotation.y += dt * 0.9;
      pizza.rotation.z = Math.sin(t) * 0.12;
      smokeT -= dt;
      if (smokeT <= 0 && st.open) {
        smokeT = 0.7;
        ctx.fx?.smoke(root.localToWorld(chimTop.clone()), 0.4, 0xcccccc);
      }
    },
  };
}

export function iceCream(ctx) {
  const s = stall(ctx, { label: 'Ice Cream', roofA: '#ff7bb0', roofB: '#bfe4ff', body: '#fff6f8', signBg: '#2b1a3d', signFg: '#ffc0e0' });
  const root = s.root;

  const cone = new THREE.Group();
  cone.position.set(0, s.h + 1.5, 0);
  root.add(cone);
  const waffle = M.cone(0.55, 1.5, M.enamel(0xd9a55a), 0, 0, 0, 14);
  waffle.rotation.x = Math.PI;
  cone.add(waffle);
  const scoops = [0xfff0f5, 0xffd3a0, 0xc8a0ff];
  for (let i = 0; i < 3; i++) {
    const sc = M.sphere(0.46 - i * 0.05, M.enamel(scoops[i]), (i - 1) * 0.12, 0.85 + i * 0.5, (i % 2) * 0.1);
    cone.add(sc);
  }
  const cherry = M.sphere(0.14, M.enamel(0xe6455c), 0, 2.2, 0);
  cone.add(cherry);

  root.add(patioSet(3.0, 1.9, 8));
  return {
    root, bulbMats: [s.bulbMat],
    update(dt, t) {
      cone.rotation.y += dt * 0.7;
      cone.position.y = s.h + 1.5 + Math.sin(t * 1.9) * 0.07;
    },
  };
}

export function drinksStand(ctx) {
  const s = stall(ctx, { label: 'Drinks', roofA: '#3b8fe0', roofB: '#fff6e8', body: '#eaf4ff' });
  const root = s.root;

  const cup = new THREE.Group();
  cup.position.set(0, s.h + 1.6, 0);
  root.add(cup);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.44, 1.5, 16), M.enamel(0xe6455c));
  cup.add(body);
  cup.add(M.cyl(0.66, 0.1, M.enamel(0xfff6e8), 0, 0.78, 0, 16));
  const straw = M.cyl(0.07, 1.5, M.enamel(0xffd76a), 0.16, 1.4, 0, 8);
  straw.rotation.z = -0.28;
  cup.add(straw);
  // Bubbles.
  const bubbles = [];
  for (let i = 0; i < 6; i++) {
    const b = M.sphere(0.09, M.glass(0xbfe4ff), (Math.random() - 0.5) * 0.7, 0, (Math.random() - 0.5) * 0.7);
    cup.add(b);
    bubbles.push({ b, p: Math.random() });
  }
  root.add(patioSet(3.0, 1.8, 2));

  return {
    root, bulbMats: [s.bulbMat],
    update(dt, t) {
      cup.rotation.y += dt * 0.45;
      for (const bb of bubbles) {
        bb.p += dt * 0.5;
        if (bb.p > 1) bb.p -= 1;
        bb.b.position.y = -0.6 + bb.p * 1.3;
        bb.b.scale.setScalar(0.5 + bb.p * 0.8);
      }
    },
  };
}

export function popcornCart(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h, { color: 0xc4c8cf }));

  // Classic red-and-gold cart.
  const cart = new THREE.Group();
  cart.position.y = 0.55;
  root.add(cart);
  cart.add(M.box(2.4, 1.0, 1.4, M.enamel(0xe6455c), 0, 0.5, 0));
  cart.add(M.box(2.5, 0.12, 1.5, M.paint(0xffca4a, { rough: 0.3, metal: 0.8 }), 0, 1.06, 0));
  // Glass popper box.
  cart.add(M.box(1.5, 1.0, 1.0, M.glass(0xffffff), 0, 1.6, 0));
  for (const x of [-0.75, 0.75]) for (const z of [-0.5, 0.5]) {
    cart.add(M.cyl(0.05, 1.05, M.bar(0xffca4a), x, 1.6, z, 6));
  }
  cart.add(M.box(1.6, 0.1, 1.1, M.paint(0xffca4a, { rough: 0.3, metal: 0.8 }), 0, 2.12, 0));
  // Striped parasol.
  cart.add(M.cyl(0.05, 1.6, M.bar(0xc8d0dc), 0, 2.9, 0, 6));
  const umb = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.7, 12), M.canopy('#e6455c', '#fff6e8', 12));
  umb.position.y = 3.8;
  umb.castShadow = true;
  cart.add(umb);
  // Wheels.
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 16), M.bar(0xffca4a));
    w.position.set(s * 1.0, -0.15, 0.72);
    cart.add(w);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      const sp = M.box(0.82, 0.03, 0.03, M.bar(0xffca4a), s * 1.0, -0.15, 0.72);
      sp.rotation.z = a;
      cart.add(sp);
    }
  }

  // Popping kernels inside the glass box.
  const kernels = [];
  for (let i = 0; i < 14; i++) {
    const k = M.sphere(0.075, M.enamel(0xfff6e0),
      (Math.random() - 0.5) * 1.2, 1.25, (Math.random() - 0.5) * 0.7);
    cart.add(k);
    kernels.push({ k, v: Math.random() * 2, base: 1.25 });
  }

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.55), new THREE.MeshBasicMaterial({
    map: T.signboard('Popcorn', '#3d1020', '#ffd76a'), transparent: true,
  }));
  sign.position.set(0, 1.75, 0.72);
  cart.add(sign);
  const bulbs = C.bulbRing(1.7, 12, 3.6, 0xffe9b0, 0.08);
  cart.add(bulbs);

  return {
    root, bulbMats: [bulbs.userData.bulbMat],
    update(dt, t, st) {
      umb.rotation.y += dt * 0.15;
      for (const kk of kernels) {
        if (!st.open) continue;
        kk.v -= dt * 5.5;
        kk.k.position.y += kk.v * dt;
        if (kk.k.position.y < kk.base) {
          kk.k.position.y = kk.base;
          kk.v = 1.4 + Math.random() * 1.6;
        }
      }
    },
  };
}

export function coffeeHut(ctx) {
  const s = stall(ctx, { label: 'Coffee', roofA: '#6b4423', roofB: '#e8d8b8', body: '#efe3d0', signBg: '#2b1c10', signFg: '#e8c98a' });
  const root = s.root;

  const mug = new THREE.Group();
  mug.position.set(0, s.h + 1.5, 0);
  root.add(mug);
  mug.add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.58, 1.0, 16), M.enamel(0xfff6e8)));
  mug.add(M.cyl(0.62, 0.1, M.enamel(0x5a3a1e), 0, 0.46, 0, 16));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 8, 14, Math.PI), M.enamel(0xfff6e8));
  handle.position.set(0.72, 0, 0);
  handle.rotation.z = -Math.PI / 2;
  handle.rotation.y = Math.PI / 2;
  mug.add(handle);
  mug.add(M.cyl(0.85, 0.08, M.enamel(0xd9c0a0), 0, -0.54, 0, 16));

  const steamPt = V(0, s.h + 2.1, 0);
  let steamT = 0;
  return {
    root, bulbMats: [s.bulbMat],
    update(dt, t, st) {
      mug.rotation.y = Math.sin(t * 0.6) * 0.4;
      steamT -= dt;
      if (steamT <= 0 && st.open) {
        steamT = 0.45;
        ctx.fx?.smoke(root.localToWorld(steamPt.clone()), 0.22, 0xffffff);
      }
    },
  };
}

export function candyShop(ctx) {
  const s = stall(ctx, { w: 3.8, label: 'Candy', roofA: '#ff7bb0', roofB: '#a06cf0', body: '#fff0f8', signBg: '#3d1030', signFg: '#ffd0ea' });
  const root = s.root;

  // Lollipop forest on the roof.
  const pops = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    g.position.set(-1.3 + i * 0.9, s.h + 0.35, (i % 2) * 0.5 - 0.25);
    root.add(g);
    g.add(M.cyl(0.05, 1.1, M.enamel(0xfff6e8), 0, 0.55, 0, 6));
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 18), M.enamel(M.funColor(i * 3)));
    disc.rotation.x = Math.PI / 2;
    disc.position.y = 1.25;
    g.add(disc);
    // Spiral stripe.
    const spiral = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 20), M.enamel(0xfff6e8));
    spiral.position.y = 1.25;
    spiral.position.z = 0.06;
    g.add(spiral);
    pops.push(disc);
  }
  return {
    root, bulbMats: [s.bulbMat],
    update(dt) { for (const p of pops) p.rotation.y += dt * 1.6; },
  };
}

/* ================================================================== *
 * Retail
 * ================================================================== */
export function souvenirShop(ctx) {
  const s = stall(ctx, { w: 4.2, d: 3.2, h: 3.0, label: 'Gifts', roofA: '#a06cf0', roofB: '#ffd76a', body: '#f0e8ff', signBg: '#241a3d', signFg: '#ffd76a' });
  const root = s.root;

  // Display of plush toys and mugs on the counter.
  for (let i = 0; i < 5; i++) {
    const x = -1.5 + i * 0.75;
    const toy = new THREE.Group();
    toy.position.set(x, s.h * 0.62, s.d / 2 + 0.2);
    const col = M.funColor(i + 2);
    toy.add(M.sphere(0.17, M.fabric(col), 0, 0.17, 0));
    toy.add(M.sphere(0.13, M.fabric(col), 0, 0.42, 0));
    for (const sx of [-1, 1]) toy.add(M.sphere(0.06, M.fabric(col), sx * 0.11, 0.52, 0));
    root.add(toy);
  }
  // Flag bunting.
  const bunting = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.34), M.fabric(M.funColor(i)));
    f.position.set(-2.0 + t * 4.0, s.h + 0.55 - Math.sin(t * Math.PI) * 0.35, s.d / 2 + 1.3);
    root.add(f);
    bunting.push({ f, t });
  }
  return {
    root, bulbMats: [s.bulbMat],
    update(dt, time) {
      for (const b of bunting) b.f.rotation.z = Math.sin(time * 2.2 + b.t * 6) * 0.2;
    },
  };
}

export function balloonCart(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h, { color: 0xc4c8cf }));

  const cart = new THREE.Group();
  root.add(cart);
  cart.add(M.box(1.6, 0.9, 1.1, M.enamel(0x54d4f0), 0, 0.85, 0));
  cart.add(M.box(1.7, 0.1, 1.2, M.paint(0xffca4a, { rough: 0.35, metal: 0.7 }), 0, 1.34, 0));
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 6, 14), M.bar(0xc8d0dc));
    w.position.set(s * 0.7, 0.35, 0.45);
    cart.add(w);
  }
  cart.add(M.cyl(0.04, 1.4, M.bar(0xc8d0dc), -0.7, 1.9, 0, 6));

  // Balloon bunch on strings.
  const balloons = [];
  for (let i = 0; i < 11; i++) {
    const g = new THREE.Group();
    const a = (i / 11) * Math.PI * 2;
    const r = 0.35 + (i % 3) * 0.25;
    g.position.set(Math.cos(a) * r, 3.0 + (i % 4) * 0.3, Math.sin(a) * r);
    const b = M.sphere(0.32, M.enamel(M.funColor(i)), 0, 0, 0);
    b.scale.y = 1.2;
    g.add(b);
    g.add(M.cone(0.09, 0.16, M.enamel(M.funColor(i)), 0, -0.4, 0, 8));
    const strLen = g.position.y - 1.4;
    const str = M.cyl(0.012, strLen, M.bar(0xf0f3f8), 0, -0.4 - strLen / 2, 0, 4);
    g.add(str);
    cart.add(g);
    balloons.push({ g, phase: i * 0.7, base: g.position.clone() });
  }

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.4), new THREE.MeshBasicMaterial({
    map: T.signboard('Balloons', '#123040', '#7de0f0'), transparent: true,
  }));
  sign.position.set(0, 1.75, 0.58);
  cart.add(sign);

  return {
    root,
    update(dt, t) {
      for (const b of balloons) {
        b.g.position.x = b.base.x + Math.sin(t * 0.9 + b.phase) * 0.14;
        b.g.position.z = b.base.z + Math.cos(t * 0.75 + b.phase) * 0.14;
        b.g.position.y = b.base.y + Math.sin(t * 1.3 + b.phase) * 0.1;
        b.g.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.14;
      }
    },
  };
}

export function hatShop(ctx) {
  const s = stall(ctx, { label: 'Hats', roofA: '#2fbfa0', roofB: '#ffd76a', body: '#e8f7f2', signBg: '#0f3a30', signFg: '#8ff0d4' });
  const root = s.root;
  const hats = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    g.position.set(-1.2 + i * 0.8, s.h + 0.45, 0);
    root.add(g);
    g.add(M.cyl(0.07, 0.5, M.bar(0xc8d0dc), 0, 0.25, 0, 6));
    const col = M.funColor(i * 2 + 1);
    g.add(M.cyl(0.42, 0.05, M.fabric(col), 0, 0.55, 0, 14));
    g.add(M.cyl(0.24, 0.32, M.fabric(col), 0, 0.72, 0, 14));
    g.add(M.cyl(0.26, 0.07, M.fabric(0x2b3040), 0, 0.6, 0, 14));
    hats.push(g);
  }
  return {
    root, bulbMats: [s.bulbMat],
    update(dt) { for (let i = 0; i < hats.length; i++) hats[i].rotation.y += dt * (0.4 + i * 0.15); },
  };
}

/* ================================================================== *
 * Facilities
 * ================================================================== */
export function restroom(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h, { color: 0xc4c8cf }));
  const w = 4.0, d = 2.8, h = 2.9;
  root.add(M.box(w, h, d, M.plaster('#dfe6ef'), 0, h / 2 + 0.1, 0));
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.001, w * 0.72, 1.1, 4), M.paint(0x3b8fe0, { rough: 0.6 }));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + 0.62;
  roof.scale.z = d / w;
  roof.castShadow = true;
  root.add(roof);

  // Two doors with pictogram plaques.
  for (let i = 0; i < 2; i++) {
    const x = (i === 0 ? -1 : 1) * 0.95;
    root.add(M.box(1.1, 2.1, 0.12, M.timber('#9a7248'), x, 1.15, d / 2 + 0.02));
    const plaqueCol = i === 0 ? 0x3b8fe0 : 0xe04a9e;
    root.add(M.box(0.45, 0.45, 0.06, M.paint(plaqueCol, { rough: 0.4 }), x, 2.5, d / 2 + 0.08));
    // Simple figure on the plaque.
    root.add(M.sphere(0.07, M.paint(0xffffff, { rough: 0.5 }), x, 2.62, d / 2 + 0.12));
    root.add(M.box(0.12, 0.18, 0.04, M.paint(0xffffff, { rough: 0.5 }), x, 2.44, d / 2 + 0.12));
  }
  root.add(M.box(w + 0.2, 0.18, d + 0.2, M.paint(0x8d96a8, { rough: 0.7 }), 0, h + 0.1, 0));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({
    map: T.signboard('Restrooms', '#12304a', '#9ad4ff'), transparent: true,
  }));
  sign.position.set(0, h + 0.5, d / 2 + 0.15);
  root.add(sign);
  const lamp = M.sphere(0.13, M.glow(0xcfe8ff, 2.2), 0, h - 0.2, d / 2 + 0.2);
  root.add(lamp);

  // Small hedge either side.
  for (const s of [-1, 1]) {
    root.add(M.box(0.8, 0.7, 0.8, M.foliage(0x3f8f43), s * (w / 2 + 0.7), 0.45, 0.9));
  }
  return { root, update() {} };
}

export function firstAid(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h, { color: 0xc4c8cf }));
  const w = 3.4, d = 2.6, h = 2.7;
  root.add(M.box(w, h, d, M.plaster('#ffffff'), 0, h / 2 + 0.1, 0));
  root.add(M.box(w + 0.3, 0.2, d + 0.3, M.paint(0xe6455c, { rough: 0.5 }), 0, h + 0.2, 0));
  // Red cross.
  root.add(M.box(1.1, 0.34, 0.1, M.paint(0xe6455c, { rough: 0.4 }), 0, 1.9, d / 2 + 0.03));
  root.add(M.box(0.34, 1.1, 0.1, M.paint(0xe6455c, { rough: 0.4 }), 0, 1.9, d / 2 + 0.03));
  root.add(M.box(1.2, 2.0, 0.1, M.glass(0xdff0ff), 0, 1.1, d / 2 + 0.01));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.62), new THREE.MeshBasicMaterial({
    map: T.signboard('First Aid', '#3d1020', '#ffb0b8'), transparent: true,
  }));
  sign.position.set(0, h + 0.62, d / 2 + 0.1);
  root.add(sign);
  const beaconMat = M.glowUnique(0xff4444, 2.4);
  root.add(M.sphere(0.15, beaconMat, 0, h + 0.45, 0));
  return {
    root,
    update(dt, t) { M.pulse(beaconMat, 0.7 + Math.max(0, Math.sin(t * 3.4)) * 1.6); },
  };
}

export function infoKiosk(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h, { color: 0xc4c8cf }));
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 2.5, 8), M.plaster('#fff3e0'));
  body.position.y = 1.35;
  body.castShadow = true;
  root.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.1, 8), M.canopy('#3b8fe0', '#fff6e8', 8));
  roof.position.y = 3.1;
  roof.castShadow = true;
  root.add(roof);
  root.add(M.sphere(0.2, M.glow(0xffd76a, 3.0), 0, 3.8, 0));
  // "i" panels.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
    const p = M.box(0.9, 1.0, 0.08, M.paint(0x3b8fe0, { rough: 0.4 }),
      Math.cos(a) * 1.3, 1.7, Math.sin(a) * 1.3);
    p.rotation.y = -a + Math.PI / 2;
    root.add(p);
    const dot = M.box(0.14, 0.14, 0.05, M.paint(0xffffff, { rough: 0.4 }),
      Math.cos(a) * 1.36, 2.0, Math.sin(a) * 1.36);
    dot.rotation.y = -a + Math.PI / 2;
    root.add(dot);
    const stem = M.box(0.14, 0.42, 0.05, M.paint(0xffffff, { rough: 0.4 }),
      Math.cos(a) * 1.36, 1.6, Math.sin(a) * 1.36);
    stem.rotation.y = -a + Math.PI / 2;
    root.add(stem);
  }
  const bulbs = C.bulbRing(1.95, 14, 2.7, 0xffe9b0, 0.09);
  root.add(bulbs);
  return {
    root, bulbMats: [bulbs.userData.bulbMat],
    update(dt) { roof.rotation.y += dt * 0.12; },
  };
}

export function atm(ctx) {
  const root = new THREE.Group();
  root.add(C.basePad(ctx.w, ctx.h, { color: 0xc4c8cf }));
  root.add(M.box(1.3, 2.2, 0.9, M.paint(0x2b3040, { rough: 0.4, metal: 0.5 }), 0, 1.2, 0));
  root.add(M.box(1.45, 0.25, 1.05, M.paint(0xffc23c, { rough: 0.4 }), 0, 2.4, 0));
  const screenMat = M.glowUnique(0x46d6ff, 1.6);
  const screen = M.box(0.85, 0.6, 0.06, screenMat, 0, 1.75, 0.47);
  root.add(screen);
  root.add(M.box(0.7, 0.25, 0.06, M.paint(0x1b2030, { rough: 0.6 }), 0, 1.3, 0.47));
  // Little shelter.
  for (const s of [-1, 1]) root.add(M.cyl(0.07, 2.8, M.bar(0xc8d0dc), s * 1.0, 1.4, -0.3, 6));
  const cover = M.box(2.4, 0.12, 1.5, M.paint(0x3b8fe0, { rough: 0.5 }), 0, 2.85, 0.1);
  root.add(cover);
  return {
    root,
    update(dt, t) { M.pulse(screenMat, 1.0 + Math.sin(t * 2.6) * 0.35); },
  };
}
