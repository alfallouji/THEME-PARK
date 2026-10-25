/**
 * Shared parts used across every ride builder: platforms, bulb strings, safety
 * fences, queue markers and the little seated figures that ride the vehicles.
 */
import * as THREE from 'three';
import * as M from '../../gfx/Materials.js';
import { TILE } from '../../world/Grid.js';

export const UP = new THREE.Vector3(0, 1, 0);

/** Convert a footprint in tiles to world units. */
export function span(tiles) { return tiles * TILE; }

/** Concrete pad under a ride, sized to its footprint. */
export function basePad(w, h, { inset = 0.15, color = 0xb9bec7 } = {}) {
  const m = M.box(span(w) - inset * 2, 0.22, span(h) - inset * 2, M.paint(color, { rough: 0.92 }));
  m.position.y = 0.11;
  m.receiveShadow = true;
  m.castShadow = false;
  return m;
}

/** Circular ride deck with a skirt. */
export function deck(radius, height, topColor, skirtColor) {
  const g = new THREE.Group();
  const top = M.cyl(radius, height, M.paint(topColor, { rough: 0.6 }), 0, height / 2, 0, 32);
  g.add(top);
  const skirt = M.cyl(radius * 1.02, height * 0.5, M.paint(skirtColor, { rough: 0.7 }), 0, height * 0.25, 0, 32);
  g.add(skirt);
  return g;
}

/**
 * Ring of light bulbs. Returns the group plus the shared emissive material so
 * the caller can dim it in daylight.
 */
export function bulbRing(radius, count, y, color = 0xffe9b0, size = 0.12) {
  const g = new THREE.Group();
  const mat = M.glow(color, 3.0);
  const geo = new THREE.SphereGeometry(size, 8, 6);
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    m4.makeTranslation(Math.cos(a) * radius, y, Math.sin(a) * radius);
    inst.setMatrixAt(i, m4);
  }
  inst.instanceMatrix.needsUpdate = true;
  g.add(inst);
  g.userData.bulbMat = mat;
  return g;
}

/** Straight run of bulbs between two points. */
export function bulbLine(from, to, count, color = 0xffe9b0, size = 0.1) {
  const mat = M.glow(color, 3.0);
  const geo = new THREE.SphereGeometry(size, 8, 6);
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const m4 = new THREE.Matrix4();
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.lerpVectors(from, to, i / (count - 1));
    m4.makeTranslation(v.x, v.y, v.z);
    inst.setMatrixAt(i, m4);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.userData.bulbMat = mat;
  return inst;
}

/** Low safety fence around a circular ride. */
export function fenceRing(radius, count = 28, color = 0x59617a, height = 1.0) {
  const g = new THREE.Group();
  const mat = M.bar(color);
  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, height, 6);
  const inst = new THREE.InstancedMesh(postGeo, mat, count);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    m4.makeTranslation(Math.cos(a) * radius, height / 2, Math.sin(a) * radius);
    inst.setMatrixAt(i, m4);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = true;
  g.add(inst);

  for (const y of [height * 0.45, height * 0.92]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 6, count * 2), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
  }
  return g;
}

/** Rectangular safety fence for square-footprint rides. */
export function fenceRect(w, d, color = 0x59617a, height = 1.0) {
  const g = new THREE.Group();
  const mat = M.bar(color);
  const hw = w / 2, hd = d / 2;
  const pts = [];
  const step = 1.6;
  for (let x = -hw; x <= hw; x += step) { pts.push([x, -hd], [x, hd]); }
  for (let z = -hd + step; z < hd; z += step) { pts.push([-hw, z], [hw, z]); }
  const inst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, height, 6), mat, pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach(([x, z], i) => { m4.makeTranslation(x, height / 2, z); inst.setMatrixAt(i, m4); });
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = true;
  g.add(inst);

  for (const y of [height * 0.45, height * 0.92]) {
    const railX = new THREE.BoxGeometry(w, 0.07, 0.07);
    const railZ = new THREE.BoxGeometry(0.07, 0.07, d);
    for (const z of [-hd, hd]) {
      const m = new THREE.Mesh(railX, mat); m.position.set(0, y, z); g.add(m);
    }
    for (const x of [-hw, hw]) {
      const m = new THREE.Mesh(railZ, mat); m.position.set(x, y, 0); g.add(m);
    }
  }
  return g;
}

/** Operator booth — every ride gets one, it sells the "staffed" look. */
export function operatorBooth(color = 0xe6455c) {
  const g = new THREE.Group();
  g.add(M.box(1.5, 1.5, 1.3, M.plaster('#f0e6d2'), 0, 0.75, 0));
  g.add(M.box(1.75, 0.16, 1.55, M.paint(color, { rough: 0.5 }), 0, 1.6, 0));
  g.add(M.box(1.0, 0.7, 0.1, M.glass(0xbfe4ff), 0, 1.05, 0.66));
  g.add(M.box(1.2, 0.1, 0.35, M.timber('#b5834a'), 0, 0.72, 0.8));
  const lamp = M.sphere(0.1, M.glow(0xffd98a, 2.6), 0, 1.78, 0);
  g.add(lamp);
  return g;
}

/**
 * Seated passenger. Deliberately chunky and low-poly — dozens ride at once and
 * they read best as bold silhouettes.
 */
export function seatedRider(seed = 0) {
  const shirt = M.paint(M.funColor(seed), { rough: 0.5 });
  const skinTones = [0xf0c8a0, 0xd9a273, 0xa9714b, 0x7a4d30, 0xf7dcc0];
  const skin = M.paint(skinTones[seed % skinTones.length], { rough: 0.75 });
  const hairCols = [0x2b1d12, 0x6b4423, 0xc9a227, 0x1a1a1a, 0x8b3a2f];
  const hair = M.paint(hairCols[(seed * 3) % hairCols.length], { rough: 0.9 });

  const parts = [];
  parts.push(M.box(0.34, 0.4, 0.24, shirt, 0, 0.42, 0));
  parts.push(M.sphere(0.145, skin, 0, 0.74, 0));
  const cap = M.sphere(0.155, hair, 0, 0.78, -0.01);
  cap.scale.y *= 0.6;
  parts.push(cap);
  // Arms raised — universal "having fun on a ride" pose.
  for (const s of [-1, 1]) {
    const arm = M.box(0.09, 0.34, 0.09, skin, s * 0.22, 0.6, 0);
    arm.rotation.z = s * 0.55;
    parts.push(arm);
  }
  for (const s of [-1, 1]) {
    parts.push(M.box(0.11, 0.28, 0.12, M.paint(0x3b4a63, { rough: 0.8 }), s * 0.09, 0.14, 0.06));
  }

  // One mesh per rider: a full ferris wheel carries 32 of them.
  const g = new THREE.Group();
  const merged = M.mergeColored(parts);
  if (merged) g.add(merged);
  g.scale.setScalar(0.92);
  return g;
}

/** Fill a vehicle with N riders spread across seat anchors. */
export function fillSeats(parent, anchors, count, seedBase = 0) {
  const made = [];
  for (let i = 0; i < Math.min(count, anchors.length); i++) {
    const r = seatedRider(seedBase + i);
    r.position.copy(anchors[i]);
    parent.add(r);
    made.push(r);
  }
  return made;
}

/** Slim support column with a flared foot. */
export function column(radius, height, mat, x = 0, z = 0) {
  const g = new THREE.Group();
  g.add(M.cyl(radius, height, mat, x, height / 2, z, 12));
  g.add(M.cyl(radius * 1.8, 0.3, mat, x, 0.15, z, 12));
  return g;
}

/**
 * A-frame leg pair, used by pirate ships, swingers and wheels.
 * Merged into a single mesh — these never move relative to their parent.
 */
export function aFrame(height, spread, mat, thickness = 0.22) {
  const parts = [];
  for (const s of [-1, 1]) {
    const from = new THREE.Vector3(s * spread, 0, 0);
    const to = new THREE.Vector3(0, height, 0);
    parts.push(M.strut(from, to, thickness, mat));
  }
  // Cross brace.
  parts.push(M.strut(
    new THREE.Vector3(-spread * 0.5, height * 0.5, 0),
    new THREE.Vector3(spread * 0.5, height * 0.5, 0),
    thickness * 0.6, mat,
  ));
  return M.mergeMeshes(parts, mat) || new THREE.Group();
}

/** Lattice tower — drop towers and observation masts. One merged mesh. */
export function lattice(height, width, mat, segments = 10) {
  const parts = [];
  const hw = width / 2;
  const corners = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]];
  for (const [x, z] of corners) {
    parts.push(M.cyl(0.11, height, mat, x, height / 2, z, 8));
  }
  const segH = height / segments;
  for (let i = 0; i <= segments; i++) {
    const y = i * segH;
    for (let c = 0; c < 4; c++) {
      const [x1, z1] = corners[c];
      const [x2, z2] = corners[(c + 1) % 4];
      parts.push(M.strut(new THREE.Vector3(x1, y, z1), new THREE.Vector3(x2, y, z2), 0.06, mat));
      if (i < segments) {
        parts.push(M.strut(
          new THREE.Vector3(x1, y, z1),
          new THREE.Vector3(x2, y + segH, z2),
          0.05, mat,
        ));
      }
    }
  }
  return M.mergeMeshes(parts, mat) || new THREE.Group();
}

/** Hanging chain approximated by a thin cylinder (cheap, reads fine at scale). */
export function chain(length, mat, thickness = 0.03) {
  return M.cyl(thickness, length, mat, 0, -length / 2, 0, 5);
}

/** Decorative flag on a pole. */
export function pennant(height, color, seed = 0) {
  const g = new THREE.Group();
  g.add(M.cyl(0.05, height, M.bar(0xc8d0dc), 0, height / 2, 0, 6));
  const flagGeo = new THREE.PlaneGeometry(0.9, 0.55, 6, 3);
  const flag = new THREE.Mesh(flagGeo, M.fabric(color));
  flag.position.set(0.45, height - 0.35, 0);
  flag.userData.wave = seed;
  g.add(flag);
  g.userData.flag = flag;
  return g;
}

/** Animate a pennant's cloth. */
export function waveFlag(flag, t) {
  const pos = flag.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const k = (x + 0.45) / 0.9;
    pos.setZ(i, Math.sin(t * 5 + k * 6 + flag.userData.wave) * 0.16 * k);
  }
  pos.needsUpdate = true;
}

/**
 * Build a closed Catmull-Rom curve from control points and return geometry
 * helpers used by the tracked rides.
 */
export function makeTrack(points, closed = true, tension = 0.5) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    closed, 'catmullrom', tension,
  );
  return curve;
}

/**
 * Orthonormal frame on a curve, built from world up rather than Frenet frames.
 *
 * Frenet frames flip and twist through inflection points, which would make
 * rails wander away from the vehicles riding them. Deriving the frame from
 * world up — the same way `placeOnCurve` does — keeps track and train in
 * exact agreement.
 *
 * The returned vectors are shared scratch objects: read them before the next
 * call.
 */
const _ft = new THREE.Vector3();
const _fs = new THREE.Vector3();
const _fu = new THREE.Vector3();

export function frameAt(curve, t, bank = 0) {
  curve.getTangentAt(THREE.MathUtils.clamp(t, 0, 1), _ft).normalize();
  _fs.crossVectors(UP, _ft);
  if (_fs.lengthSq() < 1e-6) _fs.set(1, 0, 0);
  _fs.normalize();
  _fu.crossVectors(_ft, _fs).normalize();
  if (bank !== 0) {
    _fu.applyAxisAngle(_ft, bank);
    _fs.crossVectors(_fu, _ft).normalize();
  }
  return { tangent: _ft, side: _fs, up: _fu };
}

/**
 * Rail tubes + cross ties along a curve. Returns a group; `gauge` is the
 * distance between rails.
 */
export function railsAlong(curve, {
  gauge = 1.1, railRadius = 0.07, ties = 90, tieColor = 0x6b7280,
  railColor = 0xe0e6ef, tubularSegments = 320, spineColor = null,
  bankStrength = 0,
} = {}) {
  const g = new THREE.Group();
  const railMat = M.mat(`rail-${railColor}`, { color: railColor, roughness: 0.3, metalness: 0.9 });
  const tieMat = M.paint(tieColor, { rough: 0.7 });

  const closed = curve.closed;
  const p = new THREE.Vector3();

  for (const sideSign of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= tubularSegments; i++) {
      const t = i / tubularSegments;
      curve.getPointAt(Math.min(t, 1), p);
      const bank = bankStrength ? bankAt(curve, t, bankStrength) : 0;
      const f = frameAt(curve, t, bank);
      pts.push(p.clone().addScaledVector(f.side, sideSign * gauge * 0.5));
    }
    if (closed) pts.pop();
    const railCurve = new THREE.CatmullRomCurve3(pts, closed);
    const geo = new THREE.TubeGeometry(railCurve, tubularSegments, railRadius, 8, closed);
    const mesh = new THREE.Mesh(geo, railMat);
    mesh.castShadow = true;
    g.add(mesh);
  }

  if (spineColor !== null) {
    const geo = new THREE.TubeGeometry(curve, tubularSegments, railRadius * 1.5, 8, closed);
    const mesh = new THREE.Mesh(geo, M.mat(`spine-${spineColor}`, {
      color: spineColor, roughness: 0.35, metalness: 0.8,
    }));
    mesh.castShadow = true;
    g.add(mesh);
  }

  // Cross ties, oriented with the same frame as the rails.
  const tieGeo = new THREE.BoxGeometry(gauge + 0.25, 0.08, 0.16);
  const inst = new THREE.InstancedMesh(tieGeo, tieMat, ties);
  inst.castShadow = true;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3(1, 1, 1);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < ties; i++) {
    const t = i / ties;
    curve.getPointAt(t, p);
    const bank = bankStrength ? bankAt(curve, t, bankStrength) : 0;
    const f = frameAt(curve, t, bank);
    mtx.makeBasis(f.side, f.up, f.tangent);
    q.setFromRotationMatrix(mtx);
    m4.compose(p, q, scl);
    inst.setMatrixAt(i, m4);
  }
  inst.instanceMatrix.needsUpdate = true;
  g.add(inst);

  return g;
}

/** Vertical support columns dropped from a curve to the ground. One merged mesh. */
export function trackSupports(curve, count, mat, { minHeight = 1.2, footY = 0 } = {}) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const p = curve.getPointAt(t);
    const h = p.y - footY;
    if (h < minHeight) continue;
    parts.push(M.cyl(0.14, h, mat, p.x, footY + h / 2, p.z, 8));
    // Angled braces on taller columns.
    if (h > 6) {
      const b1 = new THREE.Vector3(p.x, footY + h * 0.55, p.z);
      const b2 = new THREE.Vector3(p.x + 1.6, footY, p.z);
      const b3 = new THREE.Vector3(p.x - 1.6, footY, p.z);
      parts.push(M.strut(b1, b2, 0.08, mat));
      parts.push(M.strut(b1, b3, 0.08, mat));
    }
  }
  return M.mergeMeshes(parts, mat) || new THREE.Group();
}

/**
 * Place an object on a curve at parameter t with correct orientation and
 * banking. Shared by coaster trains, karts, logs and the kiddie train.
 */
const _p = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _up = new THREE.Vector3();
const _mtx = new THREE.Matrix4();
const _side = new THREE.Vector3();

export function placeOnCurve(obj, curve, t, { bank = 0, lift = 0 } = {}) {
  t = ((t % 1) + 1) % 1;
  curve.getPointAt(t, _p);
  curve.getTangentAt(t, _tan).normalize();
  _side.crossVectors(UP, _tan);
  if (_side.lengthSq() < 1e-5) _side.set(1, 0, 0);
  _side.normalize();
  _up.crossVectors(_tan, _side).normalize();
  if (bank !== 0) {
    _up.applyAxisAngle(_tan, bank);
    _side.crossVectors(_up, _tan).normalize();
  }
  _mtx.makeBasis(_side, _up, _tan);
  obj.quaternion.setFromRotationMatrix(_mtx);
  obj.position.copy(_p).addScaledVector(_up, lift);
  return obj;
}

/** Estimated banking angle from the curve's horizontal turn rate. */
export function bankAt(curve, t, strength = 1) {
  const d = 0.004;
  const a = curve.getTangentAt(((t - d) % 1 + 1) % 1);
  const b = curve.getTangentAt(((t + d) % 1 + 1) % 1);
  const cross = a.x * b.z - a.z * b.x;
  return THREE.MathUtils.clamp(-cross * 26 * strength, -0.95, 0.95);
}
