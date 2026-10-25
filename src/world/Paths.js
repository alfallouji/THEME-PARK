/**
 * Path network renderer.
 *
 * Paths are drawn as instanced tiles (one InstancedMesh per surface style) with
 * automatically generated curbs along any edge that isn't adjacent to another
 * path. Litter is a separate instanced layer driven by per-cell grime, and the
 * tile tint darkens as a cell gets dirty so mess is readable at a glance.
 */
import * as THREE from 'three';
import * as M from '../gfx/Materials.js';
import * as T from '../gfx/Textures.js';
import { GRID_W, TILE, CELL } from './Grid.js';

export const PATH_STYLES = [
  { id: 'stone', name: 'Stone Path', tex: 'stone', color: 0xffffff, cost: 12 },
  { id: 'tarmac', name: 'Tarmac', tex: 'asphalt', color: 0xffffff, cost: 9 },
  { id: 'brick', name: 'Red Brick', tex: 'brick', color: 0xffffff, cost: 18 },
  { id: 'boardwalk', name: 'Boardwalk', tex: 'wood', color: 0xffffff, cost: 22 },
];

const LITTER_COLORS = [0xe8e2d4, 0xd8564f, 0x4fa3d8, 0xf0c04a, 0xffffff, 0x8fbf6a];

export class Paths {
  constructor(engine, grid) {
    this.engine = engine;
    this.grid = grid;
    this.group = new THREE.Group();
    engine.scene.add(this.group);

    this.tileMeshes = [];
    this.curbMesh = null;
    this.litterMesh = null;
    this.dirty = true;
    this._litterTimer = 0;

    this.tileGeo = new THREE.BoxGeometry(TILE, 0.16, TILE);
    this.curbGeo = new THREE.BoxGeometry(TILE, 0.22, 0.18);
    this.litterGeo = new THREE.IcosahedronGeometry(0.16, 0);

    this.curbMat = M.paint(0xd9dde4, { rough: 0.85 });
    this.litterMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });

    this.styleMats = PATH_STYLES.map((s, i) =>
      M.mat('path-' + s.id, { map: T.paving(s.tex), roughness: 0.88, metalness: 0.02 }));
  }

  markDirty() { this.dirty = true; }

  /** Rebuild every instanced layer from the current grid state. */
  rebuild() {
    this.dirty = false;

    // --- collect cells per style ---
    const byStyle = PATH_STYLES.map(() => []);
    const curbs = [];
    const g = this.grid;

    for (let i = 0; i < g.kind.length; i++) {
      if (g.kind[i] !== CELL.PATH) continue;
      const gx = i % GRID_W, gz = (i / GRID_W) | 0;
      const style = Math.min(PATH_STYLES.length - 1, g.pathStyle[i]);
      byStyle[style].push([gx, gz, i]);

      const mask = g.pathMask(gx, gz);
      if (!(mask & 1)) curbs.push([gx, gz, 0]); // +x
      if (!(mask & 2)) curbs.push([gx, gz, 1]); // -x
      if (!(mask & 4)) curbs.push([gx, gz, 2]); // +z
      if (!(mask & 8)) curbs.push([gx, gz, 3]); // -z
    }

    // --- tiles ---
    for (const m of this.tileMeshes) { this.group.remove(m); m.dispose(); }
    this.tileMeshes = [];

    const m4 = new THREE.Matrix4();
    byStyle.forEach((cells, si) => {
      if (!cells.length) return;
      const inst = new THREE.InstancedMesh(this.tileGeo, this.styleMats[si], cells.length);
      inst.receiveShadow = true;
      inst.castShadow = false;
      inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cells.length * 3), 3);
      cells.forEach(([gx, gz], k) => {
        m4.makeTranslation(g.worldX(gx), 0.08, g.worldZ(gz));
        inst.setMatrixAt(k, m4);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.userData.cells = cells;
      this.group.add(inst);
      this.tileMeshes.push(inst);
    });

    // --- curbs ---
    if (this.curbMesh) { this.group.remove(this.curbMesh); this.curbMesh.dispose(); this.curbMesh = null; }
    if (curbs.length) {
      const inst = new THREE.InstancedMesh(this.curbGeo, this.curbMat, curbs.length);
      inst.castShadow = true; inst.receiveShadow = true;
      const q = new THREE.Quaternion();
      const v = new THREE.Vector3();
      const s = new THREE.Vector3(1, 1, 1);
      const half = TILE / 2 - 0.09;
      curbs.forEach(([gx, gz, dir], k) => {
        const x = g.worldX(gx), z = g.worldZ(gz);
        if (dir === 0) { v.set(x + half, 0.11, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); }
        else if (dir === 1) { v.set(x - half, 0.11, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); }
        else if (dir === 2) { v.set(x, 0.11, z + half); q.identity(); }
        else { v.set(x, 0.11, z - half); q.identity(); }
        m4.compose(v, q, s);
        inst.setMatrixAt(k, m4);
      });
      inst.instanceMatrix.needsUpdate = true;
      this.group.add(inst);
      this.curbMesh = inst;
    }

    this.refreshLitter();
  }

  /**
   * Rebuild the litter layer and re-tint tiles by grime. Called on a slow
   * cadence — litter changes gradually, so per-frame updates would be waste.
   */
  refreshLitter() {
    const g = this.grid;
    const items = [];
    for (const inst of this.tileMeshes) {
      const cells = inst.userData.cells;
      cells.forEach(([gx, gz, i], k) => {
        const l = g.litter[i];
        const t = 1 - l * 0.42;
        inst.instanceColor.setXYZ(k, t, t * (1 - l * 0.06), t * (1 - l * 0.16));
        if (l > 0.12) {
          // Deterministic scatter so litter doesn't twitch between refreshes.
          const n = Math.min(5, Math.ceil(l * 5));
          for (let p = 0; p < n; p++) {
            const h = (i * 73856093 ^ p * 19349663) >>> 0;
            const ox = ((h % 1000) / 1000 - 0.5) * (TILE - 0.5);
            const oz = (((h >> 10) % 1000) / 1000 - 0.5) * (TILE - 0.5);
            const rot = ((h >> 20) % 628) / 100;
            items.push([g.worldX(gx) + ox, g.worldZ(gz) + oz, rot, (h >> 5) % LITTER_COLORS.length]);
          }
        }
      });
      inst.instanceColor.needsUpdate = true;
    }

    if (this.litterMesh) { this.group.remove(this.litterMesh); this.litterMesh.dispose(); this.litterMesh = null; }
    if (!items.length) return;

    const inst = new THREE.InstancedMesh(this.litterGeo, this.litterMat, items.length);
    inst.castShadow = true;
    inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(items.length * 3), 3);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    items.forEach(([x, z, rot, ci], k) => {
      q.setFromAxisAngle(new THREE.Vector3(0.3, 1, 0.2).normalize(), rot);
      v.set(x, 0.22, z);
      s.set(1, 0.55 + (k % 3) * 0.2, 1);
      m4.compose(v, q, s);
      inst.setMatrixAt(k, m4);
      col.setHex(LITTER_COLORS[ci]);
      inst.instanceColor.setXYZ(k, col.r, col.g, col.b);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.instanceColor.needsUpdate = true;
    this.group.add(inst);
    this.litterMesh = inst;
  }

  update(dt) {
    if (this.dirty) { this.rebuild(); return; }
    this._litterTimer += dt;
    if (this._litterTimer > 1.4) {
      this._litterTimer = 0;
      this.refreshLitter();
    }
  }
}
