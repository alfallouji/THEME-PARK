/**
 * Shared material + geometry cache.
 *
 * The park builds thousands of meshes; creating a material per mesh would
 * shred performance and break batching. Everything funnels through these
 * memoised factories so identical surfaces share one GPU program.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as T from './Textures.js';

const matCache = new Map();
const geoCache = new Map();

/** Cached MeshStandardMaterial. */
export function mat(key, opts) {
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial(opts);
  matCache.set(key, m);
  return m;
}

/** Cached physical material (used sparingly — glass, water, car paint). */
export function phys(key, opts) {
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshPhysicalMaterial(opts);
  matCache.set(key, m);
  return m;
}

/** Cached geometry. `build` runs once per key. */
export function geo(key, build) {
  if (geoCache.has(key)) return geoCache.get(key);
  const g = build();
  geoCache.set(key, g);
  return g;
}

/* ------------------------------------------------------------------ *
 * Colour palette — one place to retune the whole park's look
 * ------------------------------------------------------------------ */
export const PALETTE = {
  red: 0xe6455c,
  crimson: 0xc0304a,
  orange: 0xff8a3d,
  amber: 0xffc23c,
  yellow: 0xffe066,
  lime: 0x9ede4a,
  green: 0x4caf50,
  teal: 0x2fbfa0,
  cyan: 0x54d4f0,
  blue: 0x3b8fe0,
  navy: 0x27406b,
  violet: 0xa06cf0,
  pink: 0xff7bb0,
  magenta: 0xe04a9e,
  cream: 0xfff3e0,
  white: 0xf5f7fb,
  grey: 0x9aa3b2,
  slate: 0x5a6478,
  dark: 0x2a3142,
  charcoal: 0x1b2030,
  brown: 0x8b5a34,
  tan: 0xc39a68,
  gold: 0xffca4a,
  chrome: 0xc8d0dc,
};

/** Cycle of vivid colours for procedurally varied props (balloons, cars, tents). */
export const FUN_COLORS = [
  0xe6455c, 0xff8a3d, 0xffc23c, 0x9ede4a, 0x2fbfa0,
  0x54d4f0, 0x3b8fe0, 0xa06cf0, 0xff7bb0, 0xe04a9e,
];

export function funColor(i) { return FUN_COLORS[Math.abs(i | 0) % FUN_COLORS.length]; }

/* ------------------------------------------------------------------ *
 * Common material presets
 * ------------------------------------------------------------------ */

/** Flat painted surface — the workhorse for ride structures. */
export function paint(color, { rough = 0.55, metal = 0.05 } = {}) {
  return mat(`paint-${color}-${rough}-${metal}`, {
    color, roughness: rough, metalness: metal,
  });
}

/** Glossy enamel — ride cars, carousel horses, bumper cars. */
export function enamel(color) {
  return phys(`enamel-${color}`, {
    color, roughness: 0.22, metalness: 0.1, clearcoat: 0.85, clearcoatRoughness: 0.15,
  });
}

/** Brushed/painted metal structure — coaster track, towers, trusses. */
export function steel(color = PALETTE.chrome, rough = 0.35) {
  return mat(`steel-${color}-${rough}`, {
    color, roughness: rough, metalness: 0.85, map: T.metalPlate(),
  });
}

/** Plain structural metal without the plate texture (thin members). */
export function bar(color = PALETTE.chrome) {
  return mat(`bar-${color}`, { color, roughness: 0.32, metalness: 0.9 });
}

export function timber(tint = '#a8743f') {
  return mat('timber-' + tint, { map: T.wood(tint), roughness: 0.78, metalness: 0.0 });
}

export function plaster(tint = '#e8dfd0') {
  return mat('plaster-' + tint, { map: T.stucco(tint), roughness: 0.9, metalness: 0.0 });
}

export function canopy(a, b, count = 16) {
  const t = T.stripes(a, b, count);
  return mat(`canopy-${a}-${b}-${count}`, {
    map: t, roughness: 0.65, metalness: 0.0, side: THREE.DoubleSide,
  });
}

/* ------------------------------------------------------------------ *
 * Bulbs and the global day/night driver
 * ------------------------------------------------------------------ */

/** Every emissive bulb material in the park, dimmed centrally each frame. */
const bulbs = new Set();

function registerBulb(m, intensity) {
  if (m.userData.isBulb) return m;
  m.userData.isBulb = true;
  m.userData.base = intensity;
  m.userData.pulse = 1;
  bulbs.add(m);
  return m;
}

/**
 * Emissive bulb/neon, shared through the material cache.
 *
 * Intensity is not owned by the caller: `setBulbNight` drives every registered
 * bulb from the sky, so nothing stays blazing at noon. Props that want to
 * flicker or chase call `pulse()` instead of writing emissiveIntensity.
 */
export function glow(color, intensity = 2.4) {
  return registerBulb(mat(`glow-${color}-${intensity}`, {
    color: 0x111111, emissive: color, emissiveIntensity: intensity,
    roughness: 0.4, metalness: 0.0,
  }), intensity);
}

/**
 * An un-cached bulb material. Use when a single prop needs to animate its own
 * brightness without dragging every other user of that colour along with it.
 */
export function glowUnique(color, intensity = 2.4) {
  return registerBulb(new THREE.MeshStandardMaterial({
    color: 0x111111, emissive: color, emissiveIntensity: intensity,
    roughness: 0.4, metalness: 0.0,
  }), intensity);
}

/** Set a bulb's brightness multiplier (1 = normal). Survives day/night scaling. */
export function pulse(material, value) {
  if (material?.userData?.isBulb) material.userData.pulse = value;
}

/**
 * @param {number} night 0 = midday, 1 = fully dark.
 * Bulbs read as dull glass in daylight and blaze after dusk.
 */
export function setBulbNight(night) {
  const k = 0.05 + night * 0.32;
  for (const m of bulbs) {
    m.emissiveIntensity = m.userData.base * m.userData.pulse * k;
  }
}

/** Transparent glass / acrylic canopy. */
export function glass(color = 0xaad4ff) {
  return phys('glass-' + color, {
    color, roughness: 0.08, metalness: 0.0, transmission: 0.0,
    transparent: true, opacity: 0.32, side: THREE.DoubleSide,
  });
}

export function rubber(color = 0x24282f) {
  return mat('rubber-' + color, { color, roughness: 0.92, metalness: 0.0 });
}

export function fabric(color) {
  return mat('fabric-' + color, { color, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
}

export function foliage(color = 0x3f8f43) {
  return mat('foliage-' + color, { color, roughness: 0.82, metalness: 0.0, flatShading: true });
}

/* ------------------------------------------------------------------ *
 * Shared primitive geometries
 * ------------------------------------------------------------------ */
export const G = {
  box: () => geo('box', () => new THREE.BoxGeometry(1, 1, 1)),
  sphere: (seg = 16) => geo('sph' + seg, () => new THREE.SphereGeometry(0.5, seg, seg * 0.6 | 0)),
  cyl: (seg = 16) => geo('cyl' + seg, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg)),
  cone: (seg = 16) => geo('cone' + seg, () => new THREE.ConeGeometry(0.5, 1, seg)),
  torus: (seg = 24, tub = 10) => geo(`tor${seg}_${tub}`, () => new THREE.TorusGeometry(0.5, 0.1, tub, seg)),
  plane: () => geo('plane', () => new THREE.PlaneGeometry(1, 1)),
  circle: (seg = 24) => geo('circ' + seg, () => new THREE.CircleGeometry(0.5, seg)),
  capsule: () => geo('cap', () => new THREE.CapsuleGeometry(0.5, 1, 4, 10)),
};

/* ------------------------------------------------------------------ *
 * Mesh helpers — terse constructors used heavily by the ride builders
 * ------------------------------------------------------------------ */

/** Box mesh with size + position in one call. */
export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(G.box(), material);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function cyl(radius, height, material, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(G.cyl(seg), material);
  m.scale.set(radius * 2, height, radius * 2);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function sphere(radius, material, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(G.sphere(seg), material);
  m.scale.setScalar(radius * 2);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function cone(radius, height, material, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(G.cone(seg), material);
  m.scale.set(radius * 2, height, radius * 2);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** A thin strut between two points — used for trusses and wheel spokes. */
export function strut(from, to, thickness, material) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const m = new THREE.Mesh(G.cyl(8), material);
  m.scale.set(thickness, len, thickness);
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  return m;
}

/** Flat ground-hugging disc (ride pads, shadows, puddles). */
export function pad(radius, material, y = 0.02) {
  const m = new THREE.Mesh(G.circle(32), material);
  m.rotation.x = -Math.PI / 2;
  m.scale.setScalar(radius * 2);
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

/**
 * Collapse a list of meshes that share one material into a single mesh.
 *
 * Ride structures (lattice towers, track supports, wheel spokes) are built
 * from dozens of small struts. Merging them at build time turns 100+ draw
 * calls per ride into one, which is the single biggest win available here
 * since none of those parts move relative to their parent.
 */
/**
 * Merge a mixed-material set of meshes into one mesh by baking each part's
 * colour into vertex colours.
 *
 * Little figures (ride passengers, carousel horses) are built from a dozen
 * tiny boxes each. At 30 riders per ride that is hundreds of draw calls for
 * objects a few pixels tall, so they collapse to one mesh apiece.
 */
/**
 * Bring a mesh's geometry into a form mergeGeometries will accept: baked world
 * transform, non-indexed, and exactly position/normal/uv. Primitives differ —
 * BoxGeometry is indexed, IcosahedronGeometry is not — and mixing the two
 * makes the merge fail.
 */
function normalizeForMerge(mesh) {
  mesh.updateMatrix();
  let g = mesh.geometry.clone();
  g.applyMatrix4(mesh.matrix);
  if (g.index) {
    const flat = g.toNonIndexed();
    g.dispose();
    g = flat;
  }
  for (const key of Object.keys(g.attributes)) {
    if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  return g;
}

export function mergeColored(meshes) {
  if (!meshes.length) return null;
  const geos = [];
  const c = new THREE.Color();
  for (const m of meshes) {
    const g = normalizeForMerge(m);
    c.copy(m.material.color || WHITE);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return null;
  const mesh = new THREE.Mesh(merged, vertexColorMat());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const WHITE = new THREE.Color(0xffffff);

export function vertexColorMat() {
  return mat('vcolor', { vertexColors: true, roughness: 0.62, metalness: 0.04 });
}

/**
 * Merge a group of meshes per material, preserving each material's look.
 * Returns a Group holding one mesh per distinct material.
 */
export function mergeByMaterial(meshes) {
  const groups = new Map();
  for (const m of meshes) {
    const arr = groups.get(m.material);
    if (arr) arr.push(m);
    else groups.set(m.material, [m]);
  }
  const out = new THREE.Group();
  for (const [material, arr] of groups) {
    const merged = mergeMeshes(arr, material);
    if (merged) out.add(merged);
  }
  return out;
}

export function mergeMeshes(meshes, material) {
  if (!meshes.length) return null;
  const geos = meshes.map(normalizeForMerge);
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return null;
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Recursively flag a subtree for shadow casting/receiving. */
export function shadows(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; }
  });
  return obj;
}

export function disposeAll() {
  for (const m of matCache.values()) m.dispose();
  for (const g of geoCache.values()) g.dispose();
  matCache.clear();
  geoCache.clear();
}
