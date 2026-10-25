/**
 * Ground, water and the scenery ring around the plot.
 *
 * The buildable plot is deliberately flat — tycoon placement is far more
 * pleasant without height snapping — while everything outside the fence rolls
 * into hills, forest and distant peaks to give the park a horizon.
 */
import * as THREE from 'three';
import * as M from '../gfx/Materials.js';
import * as T from '../gfx/Textures.js';
import { fbm } from '../gfx/Textures.js';
import { GRID_W, GRID_H, TILE, WORLD_HALF } from './Grid.js';

const GROUND_SIZE = 520;
const GROUND_SEGS = 180;

/* ------------------------------------------------------------------ *
 * Animated water
 * ------------------------------------------------------------------ */
const WATER_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vWave;
  void main() {
    vUv = uv;
    vec3 p = position;
    float w = sin(p.x * 0.35 + uTime * 1.1) * 0.06
            + sin(p.y * 0.42 - uTime * 0.85) * 0.05
            + sin((p.x + p.y) * 0.22 + uTime * 0.6) * 0.04;
    p.z += w;
    vWave = w;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform sampler2D uNormal;
  uniform float uNight;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vWave;

  void main() {
    // Two normal-map layers scrolling against each other sell the ripple.
    vec2 uv1 = vUv * 7.0 + vec2(uTime * 0.026, uTime * 0.017);
    vec2 uv2 = vUv * 4.3 - vec2(uTime * 0.019, uTime * 0.031);
    vec3 n1 = texture2D(uNormal, uv1).xyz * 2.0 - 1.0;
    vec3 n2 = texture2D(uNormal, uv2).xyz * 2.0 - 1.0;
    vec3 n = normalize(vec3(n1.xy + n2.xy, 2.4));
    vec3 nrm = normalize(vec3(n.x, n.z, n.y));

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(viewDir, nrm), 0.0), 2.6);

    vec3 col = mix(uDeep, uShallow, clamp(fres * 1.4 + vWave * 2.2 + 0.18, 0.0, 1.0));

    // Specular glint from the sun.
    vec3 h = normalize(uSunDir + viewDir);
    float spec = pow(max(dot(nrm, h), 0.0), 120.0);
    col += uSunColor * spec * 1.9 * (1.0 - uNight * 0.75);

    // Sparkle band so the surface never looks static.
    float sp = pow(max(dot(nrm, h), 0.0), 900.0);
    col += uSunColor * sp * 5.0 * (1.0 - uNight);

    col = mix(col, col * 0.3 + vec3(0.02, 0.05, 0.10), uNight * 0.8);

    gl_FragColor = vec4(col, 0.88);
    #include <colorspace_fragment>
  }
`;

export class Terrain {
  constructor(engine, grid) {
    this.engine = engine;
    this.grid = grid;
    this.group = new THREE.Group();
    engine.scene.add(this.group);

    this._buildGround();
    this._buildLake();
    this._buildFence();
    this._buildScenery();
    this._buildEntrance();
  }

  /** Height of the decorative terrain outside the plot. Flat (0) inside. */
  static heightAt(x, z) {
    const edgeStart = WORLD_HALF + 4;
    const d = Math.max(Math.abs(x), Math.abs(z));
    if (d <= edgeStart) return 0;
    const t = Math.min(1, (d - edgeStart) / 120);
    const ramp = t * t * (3 - 2 * t);
    const n = fbm(x * 0.004 + 10, z * 0.004 + 10, 4, 4, 3);
    const n2 = fbm(x * 0.013, z * 0.013, 3, 6, 9);
    return ramp * (n * 42 + n2 * 9 - 6);
  }

  _buildGround() {
    const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGS, GROUND_SEGS);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = new THREE.Color(0xffffff);
    const cDry = new THREE.Color(0xd8d2a6);
    const cRock = new THREE.Color(0x9a9689);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let y = Terrain.heightAt(x, z);
      // Very gentle undulation inside the plot: reads as real ground without
      // ever interfering with placement (buildings still sit at y = 0).
      const inside = Math.max(Math.abs(x), Math.abs(z)) <= WORLD_HALF;
      if (inside) y += (fbm(x * 0.02, z * 0.02, 2, 5, 21) - 0.5) * 0.18;
      pos.setY(i, y);

      // Tint by slope and altitude.
      const slope = Math.abs(Terrain.heightAt(x + 2, z) - y) + Math.abs(Terrain.heightAt(x, z + 2) - y);
      tmp.copy(cGrass);
      if (y > 16) tmp.lerp(cRock, Math.min(1, (y - 16) / 22));
      if (slope > 1.6) tmp.lerp(cRock, Math.min(0.7, (slope - 1.6) * 0.35));
      if (!inside) tmp.lerp(cDry, Math.min(0.35, fbm(x * 0.01, z * 0.01, 3, 5, 55) * 0.5));
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const grassTex = T.grass().clone();
    grassTex.needsUpdate = true;
    // One texture tile per 6 world units. Tighter than this and the detail
    // just aliases into a flat average at any distance.
    grassTex.repeat.set(GROUND_SIZE / 6, GROUND_SIZE / 6);
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.anisotropy = 16;

    const mat = new THREE.MeshStandardMaterial({
      map: grassTex,
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
    });

    this.ground = new THREE.Mesh(geo, mat);
    this.ground.receiveShadow = true;
    this.ground.name = 'ground';
    this.group.add(this.ground);

    // Invisible flat plane used for cursor raycasting — avoids the ground
    // mesh's micro-relief making the build cursor jitter.
    this.pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.pickPlane.rotation.x = -Math.PI / 2;
    this.pickPlane.name = 'pickplane';
    this.group.add(this.pickPlane);
  }

  _buildLake() {
    // A decorative lake tucked beyond the north-west corner of the plot.
    this.waterUniforms = {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(0x63c8d8) },
      uDeep: { value: new THREE.Color(0x134a63) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xfff0d0) },
      uNormal: { value: T.waterNormal() },
      uNight: { value: 0 },
    };
    const geo = new THREE.PlaneGeometry(190, 150, 60, 48);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.lake = new THREE.Mesh(geo, mat);
    this.lake.rotation.x = -Math.PI / 2;
    this.lake.position.set(-150, -1.4, -140);
    this.group.add(this.lake);

    // Sandy shoreline so the water doesn't slice through grass.
    const shoreGeo = new THREE.RingGeometry(78, 108, 48, 1);
    shoreGeo.rotateX(-Math.PI / 2);
    const shore = new THREE.Mesh(shoreGeo, M.mat('shore', {
      map: T.sand(), roughness: 0.95, transparent: true, opacity: 0.85,
    }));
    shore.position.set(-150, -1.2, -140);
    shore.scale.set(1.05, 1, 0.86);
    shore.receiveShadow = true;
    this.group.add(shore);
  }

  _buildFence() {
    // Perimeter railing marking the buildable plot.
    const postMat = M.paint(0x6b7280, { rough: 0.7 });
    const railMat = M.paint(0xf0f3f8, { rough: 0.6 });
    const half = WORLD_HALF + 1;
    const step = TILE * 2;
    const posts = [];
    const rails = [];

    const gapMin = -TILE * 2.2, gapMax = TILE * 2.2; // entrance gap on south edge

    for (let p = -half; p <= half; p += step) {
      const sides = [
        [p, -half, 0], [p, half, 0], [-half, p, 1], [half, p, 1],
      ];
      for (const [a, b, axis] of sides) {
        const x = axis === 0 ? a : a;
        const z = axis === 0 ? b : b;
        const wx = axis === 0 ? a : a;
        const wz = b;
        const isSouth = axis === 0 && b === half;
        if (isSouth && wx > gapMin && wx < gapMax) continue;
        posts.push(axis === 0 ? [a, b] : [b, a]);
      }
    }

    const postGeo = new THREE.CylinderGeometry(0.16, 0.18, 1.7, 7);
    const inst = new THREE.InstancedMesh(postGeo, postMat, posts.length);
    inst.castShadow = true;
    const m4 = new THREE.Matrix4();
    posts.forEach(([x, z], i) => {
      m4.makeTranslation(x, 0.85, z);
      inst.setMatrixAt(i, m4);
    });
    inst.instanceMatrix.needsUpdate = true;
    this.group.add(inst);

    // Two horizontal rails per side, split around the entrance gap.
    const addRail = (x1, z1, x2, z2, y) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len < 0.2) return;
      const g = new THREE.BoxGeometry(len, 0.11, 0.11);
      const m = new THREE.Mesh(g, railMat);
      m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
      m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      m.castShadow = true;
      rails.push(m);
      this.group.add(m);
    };
    for (const y of [0.62, 1.32]) {
      addRail(-half, -half, half, -half, y);
      addRail(-half, -half, -half, half, y);
      addRail(half, -half, half, half, y);
      addRail(-half, half, gapMin, half, y);
      addRail(gapMax, half, half, half, y);
    }
  }

  _buildEntrance() {
    // Grand arch over the park gate. Its bulbs are registered as night lights
    // so the gate isn't a blown-out white blob in daylight.
    const g = new THREE.Group();
    this.nightBulbs = [];
    const wx = 0, wz = WORLD_HALF + 1;
    const towerMat = M.plaster('#f2e2c4');
    const trimMat = M.paint(0xe6455c, { rough: 0.5 });
    const goldMat = M.mat('gate-gold', { color: 0xffca4a, roughness: 0.28, metalness: 0.85 });

    for (const side of [-1, 1]) {
      const x = side * 5.6;
      g.add(M.box(2.4, 7.2, 2.4, towerMat, x, 3.6, 0));
      g.add(M.box(2.9, 0.5, 2.9, trimMat, x, 7.3, 0));
      const roof = M.cone(2.0, 2.6, trimMat, x, 8.7, 0, 8);
      g.add(roof);
      g.add(M.sphere(0.3, goldMat, x, 10.2, 0));
      // Little windows.
      const winMat = M.glow(0xffd98a, 1.4);
      this.nightBulbs.push(winMat);
      for (let i = 0; i < 3; i++) {
        g.add(M.box(0.6, 0.9, 0.12, winMat, x, 2.2 + i * 1.8, 1.25));
      }
    }

    // Arch band connecting the towers.
    const archShape = new THREE.Shape();
    archShape.moveTo(-5.6, 0);
    archShape.lineTo(-5.6, 1.1);
    archShape.quadraticCurveTo(0, 3.4, 5.6, 1.1);
    archShape.lineTo(5.6, 0);
    archShape.quadraticCurveTo(0, 2.2, -5.6, 0);
    const archGeo = new THREE.ExtrudeGeometry(archShape, { depth: 0.7, bevelEnabled: false });
    archGeo.translate(0, 0, -0.35);
    const arch = new THREE.Mesh(archGeo, trimMat);
    arch.position.y = 6.4;
    arch.castShadow = true;
    g.add(arch);

    // Glowing sign.
    const signGeo = new THREE.PlaneGeometry(8.4, 1.9);
    const signMat = new THREE.MeshBasicMaterial({
      map: T.signboard('WonderPark', '#1d2740', '#ffd76a'),
      transparent: true,
    });
    for (const s of [1, -1]) {
      const sign = new THREE.Mesh(signGeo, signMat);
      sign.position.set(0, 7.5, s * 0.42);
      sign.rotation.y = s > 0 ? 0 : Math.PI;
      g.add(sign);
    }

    // Bulb string along the arch.
    const bulbMat = M.glow(0xffe9b0, 3.2);
    this.nightBulbs.push(bulbMat);
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const x = -5.3 + t * 10.6;
      const y = 6.6 + Math.sin(t * Math.PI) * 2.1;
      g.add(M.sphere(0.14, bulbMat, x, y, 0.5));
      g.add(M.sphere(0.14, bulbMat, x, y, -0.5));
    }

    g.position.set(wx, 0, wz);
    this.entranceGroup = g;
    this.group.add(g);
  }

  _buildScenery() {
    // Forest ring + distant peaks, all instanced and outside the plot.
    const trunkMat = M.paint(0x6b4a30, { rough: 0.9 });
    const leafMats = [M.foliage(0x2f7a3a), M.foliage(0x3f9448), M.foliage(0x276b36), M.foliage(0x4f9e50)];

    const spots = [];
    let seed = 1337;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

    for (let i = 0; i < 1400; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = WORLD_HALF + 12 + rnd() * 180;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      if (Math.max(Math.abs(x), Math.abs(z)) < WORLD_HALF + 6) continue;
      // Keep the lake clear.
      if (Math.hypot(x + 150, (z + 140) * 1.25) < 105) continue;
      const y = Terrain.heightAt(x, z);
      if (y < -3) continue;
      spots.push([x, y, z, 0.7 + rnd() * 1.1, rnd()]);
    }

    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 3.2, 6);
    trunkGeo.translate(0, 1.6, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    trunks.castShadow = true;

    const leafGeo = new THREE.IcosahedronGeometry(1.9, 0);
    const leafGroups = leafMats.map(() => []);
    spots.forEach((s, i) => leafGroups[(s[4] * leafMats.length) | 0].push(s));

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();

    spots.forEach(([x, y, z, s], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 2.399) % (Math.PI * 2));
      v.set(x, y, z);
      sc.set(s, s * (0.85 + (i % 7) * 0.05), s);
      m4.compose(v, q, sc);
      trunks.setMatrixAt(i, m4);
    });
    trunks.instanceMatrix.needsUpdate = true;
    this.group.add(trunks);

    leafGroups.forEach((grp, gi) => {
      if (!grp.length) return;
      const inst = new THREE.InstancedMesh(leafGeo, leafMats[gi], grp.length * 2);
      inst.castShadow = true;
      let n = 0;
      grp.forEach(([x, y, z, s], i) => {
        for (let k = 0; k < 2; k++) {
          const yy = y + 3.0 * s + k * 1.5 * s;
          const ss = s * (k === 0 ? 1.0 : 0.66);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 1.7 + k) % 6.28);
          v.set(x, yy, z);
          sc.set(ss, ss * 1.15, ss);
          m4.compose(v, q, sc);
          inst.setMatrixAt(n++, m4);
        }
      });
      inst.count = n;
      inst.instanceMatrix.needsUpdate = true;
      this.group.add(inst);
    });

    // Distant mountains — low-poly cones catching the fog.
    const mtnMat = M.mat('mountain', { color: 0x7d8aa0, roughness: 1.0, flatShading: true });
    const snowMat = M.mat('snow', { color: 0xe8eef8, roughness: 0.85, flatShading: true });
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + rnd() * 0.2;
      const rad = 330 + rnd() * 90;
      const h = 60 + rnd() * 90;
      const r = 40 + rnd() * 45;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7, 1), mtnMat);
      cone.position.set(x, h / 2 - 10, z);
      cone.rotation.y = rnd() * 6.28;
      this.group.add(cone);
      if (h > 105) {
        const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.32, h * 0.26, 7, 1), snowMat);
        cap.position.set(x, h - 10 - h * 0.13, z);
        cap.rotation.y = cone.rotation.y;
        this.group.add(cap);
      }
    }
  }

  update(dt, sky) {
    this.waterUniforms.uTime.value += dt;
    this.waterUniforms.uSunDir.value.copy(sky.sunDir);
    this.waterUniforms.uSunColor.value.copy(this.engine.sun.color);
    this.waterUniforms.uNight.value = sky.nightAmount;
  }
}
