/**
 * Park staff.
 *
 * Mechanics repair breakdowns and service worn rides, janitors sweep litter,
 * entertainers lift the mood of anyone nearby, and security stops guests
 * littering in the first place. Each type is a simple goal-seeking walker with
 * a work animation, drawn with the same instancing trick as the crowd.
 */
import * as THREE from 'three';
import * as M from '../gfx/Materials.js';
import { GRID_W, CELL } from '../world/Grid.js';

export const STAFF_TYPES = {
  mechanic: {
    id: 'mechanic', name: 'Mechanic', emoji: '🔧',
    wage: 34, hire: 260, uniform: 0xff8a3d, cap: 0xffc23c,
    blurb: 'Repairs breakdowns and services rides before they fail.',
  },
  janitor: {
    id: 'janitor', name: 'Janitor', emoji: '🧹',
    wage: 24, hire: 180, uniform: 0x3b8fe0, cap: 0x27406b,
    blurb: 'Sweeps litter off the paths and keeps the park presentable.',
  },
  entertainer: {
    id: 'entertainer', name: 'Entertainer', emoji: '🤹',
    wage: 28, hire: 200, uniform: 0xe04a9e, cap: 0xffd76a,
    blurb: 'Cheers up guests in a wide radius, especially those in queues.',
  },
  security: {
    id: 'security', name: 'Security', emoji: '🛡️',
    wage: 30, hire: 220, uniform: 0x27406b, cap: 0x1b2030,
    blurb: 'Guests nearby stop dropping litter and feel safer.',
  },
};

let NEXT_STAFF = 1;

export class StaffMember {
  constructor(type, pos) {
    this.id = NEXT_STAFF++;
    this.type = type;
    this.def = STAFF_TYPES[type];
    this.name = `${this.def.name} #${this.id}`;
    this.pos = pos.clone();
    this.yaw = 0;
    this.speed = type === 'mechanic' ? 2.1 : 1.7;
    this.walkPhase = 0;
    this.route = null;
    this.routeIdx = 0;
    this.task = 'idle';
    this.targetAttraction = null;
    this.targetCell = null;
    this.workTimer = 0;
    this.idleTimer = 0;
    this.lifetimeWork = 0;
    this.armSwing = 0;
  }
}

export class StaffManager {
  constructor(engine, grid, pathfinder, park) {
    this.engine = engine;
    this.grid = grid;
    this.pf = pathfinder;
    this.park = park;
    /** @type {StaffMember[]} */
    this.staff = [];
    this.max = 60;
    this._claimedCells = new Set();
    this._buildMeshes();
  }

  _buildMeshes() {
    const N = this.max;
    const bodyGeo = new THREE.CapsuleGeometry(0.19, 0.5, 3, 8);
    const headGeo = new THREE.SphereGeometry(0.18, 10, 8);
    const capGeo = new THREE.CylinderGeometry(0.2, 0.21, 0.13, 10);
    const toolGeo = new THREE.BoxGeometry(0.08, 0.62, 0.08);

    const mk = (geo, rough) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({
        roughness: rough, metalness: 0,
      }), N);
      m.castShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
      this.engine.scene.add(m);
      return m;
    };
    this.bodyMesh = mk(bodyGeo, 0.6);
    this.headMesh = mk(headGeo, 0.75);
    this.capMesh = mk(capGeo, 0.7);
    this.toolMesh = mk(toolGeo, 0.4);

    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._qt = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._col = new THREE.Color();
  }

  get count() { return this.staff.length; }

  countOf(type) { return this.staff.filter((s) => s.type === type).length; }

  totalWage() {
    return this.staff.reduce((a, s) => a + s.def.wage, 0);
  }

  hire(type) {
    if (this.staff.length >= this.max) return null;
    const e = this.grid.entrance;
    const pos = new THREE.Vector3(this.grid.worldX(e.gx), 0, this.grid.worldZ(e.gz));
    const s = new StaffMember(type, pos);
    this.staff.push(s);
    return s;
  }

  fire(member) {
    const i = this.staff.indexOf(member);
    if (i >= 0) this.staff.splice(i, 1);
    if (member.targetAttraction) member.targetAttraction.mechanicAssigned = null;
  }

  fireOne(type) {
    const m = [...this.staff].reverse().find((s) => s.type === type);
    if (m) { this.fire(m); return m; }
    return null;
  }

  /* ------------------------------------------------------------------ */

  update(dt, ctx) {
    this._claimedCells.clear();
    for (const s of this.staff) {
      if (s.type === 'janitor' && s.targetCell) {
        this._claimedCells.add(this.grid.idx(s.targetCell.gx, s.targetCell.gz));
      }
    }
    for (const s of this.staff) this._tick(s, dt, ctx);
    this._writeInstances();
  }

  _tick(s, dt, ctx) {
    switch (s.type) {
      case 'mechanic': this._mechanic(s, dt, ctx); break;
      case 'janitor': this._janitor(s, dt, ctx); break;
      case 'entertainer': this._entertainer(s, dt, ctx); break;
      case 'security': this._security(s, dt, ctx); break;
    }
    if (s.task === 'walking') this._follow(s, dt);
  }

  /* ---------------- mechanic ---------------- */

  _mechanic(s, dt, ctx) {
    if (s.task === 'working') {
      const att = s.targetAttraction;
      if (!att || !att.root.parent) { this._release(s); return; }
      s.workTimer -= dt;
      s.armSwing += dt * 9;
      if (Math.random() < dt * 5) {
        const p = att.center.clone();
        p.y = 1.2 + Math.random() * 1.4;
        p.x += (Math.random() - 0.5) * att.radius;
        p.z += (Math.random() - 0.5) * att.radius;
        ctx.fx?.sparks(p);
      }
      if (s.workTimer <= 0) {
        const wasBroken = att.broken;
        att.repairAmount(wasBroken ? 0.7 : 0.35);
        att.repairProgress = 0;
        s.lifetimeWork++;
        if (wasBroken) ctx.onRepaired?.(att, s);
        this._release(s);
      }
      return;
    }

    if (s.task === 'walking') {
      const att = s.targetAttraction;
      if (!att || !att.root.parent) { this._release(s); return; }
      if (s.pos.distanceTo(att.entry) < 2.2) {
        s.task = 'working';
        // Full breakdowns take longer than routine servicing.
        s.workTimer = att.broken ? 6 + (1 - att.condition) * 8 : 4;
        att.repairProgress = 0.01;
        s.stuck = 0;
        return;
      }
      // Watchdog: a route that ends short of the ride (or never starts) would
      // otherwise leave this mechanic walking on the spot forever, and the
      // ride broken for good.
      s.stuck = (s.stuck || 0) + dt;
      if (!s.route && s.stuck > 1.5) { s.stuck = 0; this._release(s); }
      else if (s.stuck > 45) { s.stuck = 0; this._release(s); }
      return;
    }

    // Idle: pick the most urgent job.
    s.idleTimer -= dt;
    if (s.idleTimer > 0) return;
    s.idleTimer = 0.7;

    let target = null, bestScore = 0;
    for (const att of ctx.park.maintainable) {
      if (att.mechanicAssigned && att.mechanicAssigned !== s) continue;
      if (!att.connected) continue;
      let score = 0;
      if (att.broken) score = 100 + (att.queue.length + att.popularity * 10);
      else if (att.condition < 0.8) score = (0.8 - att.condition) * 30;
      if (score <= 0) continue;
      score /= 1 + s.pos.distanceTo(att.entry) / 40;
      if (score > bestScore) { bestScore = score; target = att; }
    }

    if (target) {
      target.mechanicAssigned = s;
      s.targetAttraction = target;
      if (this._routeTo(s, target.entryCell)) s.task = 'walking';
      else { this._release(s); }
    } else {
      this._patrol(s);
    }
  }

  _release(s) {
    if (s.targetAttraction && s.targetAttraction.mechanicAssigned === s) {
      s.targetAttraction.mechanicAssigned = null;
    }
    s.targetAttraction = null;
    s.task = 'idle';
    s.route = null;
    s.stuck = 0;
    s.idleTimer = 0.3;
  }

  /* ---------------- janitor ---------------- */

  _janitor(s, dt, ctx) {
    if (s.task === 'working') {
      s.workTimer -= dt;
      s.armSwing += dt * 7;
      const c = s.targetCell;
      if (c) {
        const cleaned = this.grid.cleanCell(c.gx, c.gz, dt * 0.85);
        if (cleaned > 0 && Math.random() < dt * 3) {
          ctx.fx?.clean(new THREE.Vector3(this.grid.worldX(c.gx), 0.2, this.grid.worldZ(c.gz)));
        }
        const i = this.grid.idx(c.gx, c.gz);
        if (this.grid.litter[i] <= 0.01) s.workTimer = 0;
      }
      if (s.workTimer <= 0) {
        s.lifetimeWork++;
        s.targetCell = null;
        s.task = 'idle';
        s.idleTimer = 0.2;
      }
      return;
    }

    if (s.task === 'walking') {
      const c = s.targetCell;
      if (!c) { s.task = 'idle'; return; }
      const tx = this.grid.worldX(c.gx), tz = this.grid.worldZ(c.gz);
      if (Math.hypot(s.pos.x - tx, s.pos.z - tz) < 1.0) {
        s.task = 'working';
        s.workTimer = 3.5;
        s.stuck = 0;
        return;
      }
      s.stuck = (s.stuck || 0) + dt;
      if ((!s.route && s.stuck > 1.5) || s.stuck > 45) {
        s.stuck = 0; s.targetCell = null; s.task = 'idle'; s.idleTimer = 0.2;
      }
      return;
    }

    s.idleTimer -= dt;
    if (s.idleTimer > 0) return;
    s.idleTimer = 0.6;

    const dirty = this.grid.dirtiestCell(0.14, this._claimedCells);
    if (dirty) {
      s.targetCell = { gx: dirty.gx, gz: dirty.gz };
      this._claimedCells.add(dirty.index);
      if (this._routeTo(s, s.targetCell)) s.task = 'walking';
      else s.targetCell = null;
    } else {
      this._patrol(s);
    }
  }

  /* ---------------- entertainer & security ---------------- */

  _entertainer(s, dt, ctx) {
    s.armSwing += dt * 3.2;
    // Cheer up everyone in range; queued guests get double the benefit.
    const R2 = 11 * 11;
    for (const g of ctx.guests.activeList) {
      const dx = g.pos.x - s.pos.x, dz = g.pos.z - s.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > R2) continue;
      const k = 1 - Math.sqrt(d2) / 11;
      const boost = g.state === 'queuing' ? 0.055 : 0.028;
      g.happiness = Math.min(1, g.happiness + boost * k * dt);
    }
    if (Math.random() < dt * 0.35) {
      ctx.fx?.confetti(new THREE.Vector3(s.pos.x, 1.9, s.pos.z), 8);
    }
    if (s.task !== 'walking') this._patrol(s, true);
  }

  _security(s, dt, ctx) {
    const R2 = 13 * 13;
    for (const g of ctx.guests.activeList) {
      const dx = g.pos.x - s.pos.x, dz = g.pos.z - s.pos.z;
      if (dx * dx + dz * dz > R2) continue;
      // Guests near security hold onto their rubbish and feel safer.
      if (g.carryingTrash > 0 && Math.random() < dt * 0.9) g.carryingTrash = 0;
      g.happiness = Math.min(1, g.happiness + 0.006 * dt);
    }
    if (s.task !== 'walking') this._patrol(s, true);
  }

  /** Wander to a random path cell, preferring busy areas. */
  _patrol(s, crowdSeek = false) {
    s.idleTimer -= 0.016;
    if (s.task === 'walking') return;
    if (s.patrolCooldown > 0) { s.patrolCooldown -= 0.016; return; }
    let cell = null;
    if (crowdSeek && this.park.busyCells.length) {
      cell = this.park.busyCells[(Math.random() * this.park.busyCells.length) | 0];
    }
    if (!cell) cell = this.grid.randomPathCell();
    if (cell && this._routeTo(s, cell)) {
      s.task = 'walking';
      s.targetCell = cell;
    } else {
      s.patrolCooldown = 1.2;
    }
  }

  /* ---------------- movement ---------------- */

  _routeTo(s, cell) {
    if (!cell) return false;
    const near = this._nearestPath(s.pos);
    if (!near) return false;
    const route = this.pf.find(near.gx, near.gz, cell.gx, cell.gz);
    if (!route) return false;
    s.route = route;
    s.routeIdx = 0;
    return true;
  }

  _nearestPath(pos) {
    const gx = this.grid.gridX(pos.x);
    const gz = this.grid.gridZ(pos.z);
    for (let r = 0; r <= 5; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.grid.isPath(gx + dx, gz + dz)) return { gx: gx + dx, gz: gz + dz };
        }
      }
    }
    return null;
  }

  _follow(s, dt) {
    if (!s.route || s.routeIdx >= s.route.length) {
      s.route = null;
      // Mechanics and janitors keep their task; patrollers go back to idle.
      if (s.type === 'entertainer' || s.type === 'security') s.task = 'idle';
      return;
    }
    const ci = s.route[s.routeIdx];
    const tx = this.grid.worldX(ci % GRID_W);
    const tz = this.grid.worldZ((ci / GRID_W) | 0);
    const dx = tx - s.pos.x, dz = tz - s.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) { s.routeIdx++; return; }
    const step = Math.min(d, s.speed * dt);
    s.pos.x += (dx / d) * step;
    s.pos.z += (dz / d) * step;
    s.walkPhase += step * 6.5;
    const want = Math.atan2(dx, dz);
    let diff = want - s.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    s.yaw += diff * Math.min(1, dt * 9);
  }

  /* ---------------- rendering ---------------- */

  _writeInstances() {
    const m4 = this._m4, q = this._q, qt = this._qt, v = this._v, sc = this._s, col = this._col;
    let n = 0, tools = 0;
    for (const s of this.staff) {
      const isMascot = s.type === 'entertainer';
      const size = isMascot ? 1.08 : 1.0;
      const moving = s.task === 'walking';
      const bob = moving ? Math.abs(Math.sin(s.walkPhase)) * 0.06 : Math.sin(s.armSwing * 0.5) * 0.02;
      q.setFromAxisAngle(UP, s.yaw);
      sc.set(size, size, size);

      v.set(s.pos.x, 0.64 * size + bob, s.pos.z);
      m4.compose(v, q, sc);
      this.bodyMesh.setMatrixAt(n, m4);
      col.setHex(s.def.uniform);
      this.bodyMesh.instanceColor.setXYZ(n, col.r, col.g, col.b);

      const headScale = isMascot ? 1.55 : 1.0;
      v.set(s.pos.x, (1.15 + bob) * size, s.pos.z);
      sc.set(headScale, headScale, headScale);
      m4.compose(v, q, sc);
      this.headMesh.setMatrixAt(n, m4);
      col.setHex(isMascot ? s.def.uniform : 0xe8c09a);
      this.headMesh.instanceColor.setXYZ(n, col.r, col.g, col.b);

      sc.set(size, size, size);
      v.set(s.pos.x, (1.3 + bob) * size, s.pos.z);
      m4.compose(v, q, sc);
      this.capMesh.setMatrixAt(n, m4);
      col.setHex(s.def.cap);
      this.capMesh.instanceColor.setXYZ(n, col.r, col.g, col.b);

      // Tool in hand: spanner or broom, swung while working.
      if (s.type === 'mechanic' || s.type === 'janitor') {
        const swing = s.task === 'working' ? Math.sin(s.armSwing) * 0.9 : 0.3;
        qt.setFromAxisAngle(RIGHT, swing - 0.5);
        qt.premultiply(q);
        v.set(
          s.pos.x + Math.cos(s.yaw) * 0.32,
          0.72 + bob,
          s.pos.z - Math.sin(s.yaw) * 0.32,
        );
        sc.set(1, s.type === 'janitor' ? 1.5 : 1, 1);
        m4.compose(v, qt, sc);
        this.toolMesh.setMatrixAt(tools, m4);
        col.setHex(s.type === 'mechanic' ? 0xc8d0dc : 0xb5834a);
        this.toolMesh.instanceColor.setXYZ(tools, col.r, col.g, col.b);
        tools++;
      }
      n++;
    }
    for (const m of [this.bodyMesh, this.headMesh, this.capMesh]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
    this.toolMesh.count = tools;
    this.toolMesh.instanceMatrix.needsUpdate = true;
    this.toolMesh.instanceColor.needsUpdate = true;
  }

  pickStaff(point, maxDist = 1.4) {
    let best = null, bestD = maxDist * maxDist;
    for (const s of this.staff) {
      const dx = s.pos.x - point.x, dz = s.pos.z - point.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
