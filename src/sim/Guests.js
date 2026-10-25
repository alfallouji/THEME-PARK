/**
 * Guest crowd: simulation + instanced rendering.
 *
 * Guests are plain objects in a pool; their bodies are drawn as three
 * InstancedMeshes (torso, head, hair) so a thousand visitors cost three draw
 * calls. Each guest tracks needs, a wallet and an opinion of the park, and
 * those opinions are what the park rating is actually made of.
 */
import * as THREE from 'three';
import * as M from '../gfx/Materials.js';
import { GRID_W, TILE, CELL } from '../world/Grid.js';

export const GUEST_STATE = {
  ARRIVING: 'arriving',
  DECIDING: 'deciding',
  WALKING: 'walking',
  QUEUING: 'queuing',
  RIDING: 'riding',
  BUYING: 'buying',
  RESTING: 'resting',
  LEAVING: 'leaving',
  GONE: 'gone',
};

const SKIN = [0xf5d5b0, 0xe8c09a, 0xd9a273, 0xb07c52, 0x8a5a38, 0x6b4227];
const HAIR = [0x2b1d12, 0x6b4423, 0xc9a227, 0x1a1a1a, 0x8b3a2f, 0x5a5a5a, 0xe0e0e0];

const FIRST = ['Ava', 'Ben', 'Cleo', 'Dev', 'Elle', 'Finn', 'Gus', 'Hana', 'Ivy', 'Jax',
  'Kit', 'Lena', 'Milo', 'Nora', 'Omar', 'Pia', 'Quinn', 'Rex', 'Sana', 'Theo',
  'Uma', 'Vic', 'Wren', 'Xan', 'Yara', 'Zane'];
const LAST = ['Reed', 'Finch', 'Blake', 'Cole', 'Dunn', 'Frost', 'Hale', 'Kerr',
  'Lowe', 'Marsh', 'Nash', 'Pike', 'Rowe', 'Shaw', 'Vance', 'Webb'];

let NEXT_GUEST = 1;

export class Guest {
  constructor() { this.reset(); }

  reset() {
    this.id = NEXT_GUEST++;
    this.active = false;
    this.state = GUEST_STATE.GONE;
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 1.5;
    this.walkPhase = Math.random() * 6.28;
    this.route = null;
    this.routeIdx = 0;
    this.lateral = (Math.random() - 0.5) * 0.9;

    this.name = '';
    this.money = 0;
    this.spent = 0;
    this.happiness = 0.75;
    this.hunger = 0;
    this.thirst = 0;
    this.toilet = 0;
    this.energy = 1;
    this.nausea = 0;
    this.intensityTolerance = 5;
    this.patience = 1;

    this.destination = null;     // Attraction
    this.destKind = null;        // 'ride' | 'shop' | 'wander' | 'exit'
    this.queueSlot = -1;
    this.rideTimer = 0;
    this.buyTimer = 0;
    this.restTimer = 0;
    this.thinkTimer = 0;
    this.lastRideId = -1;
    this.ridden = new Set();
    this.carryingTrash = 0;
    this.thought = '';
    this.timeInPark = 0;
    this.shirt = 0;
    this.skin = 0;
    this.hair = 0;
    this.scale = 1;
  }

  spawn(pos, cfg) {
    this.reset();
    this.active = true;
    this.state = GUEST_STATE.ARRIVING;
    this.pos.copy(pos);
    this.name = `${FIRST[(Math.random() * FIRST.length) | 0]} ${LAST[(Math.random() * LAST.length) | 0]}`;
    this.money = cfg.wallet;
    this.startMoney = cfg.wallet;
    this.happiness = cfg.happiness;
    this.intensityTolerance = cfg.tolerance;
    this.patience = 0.6 + Math.random() * 0.8;
    this.speed = 1.9 + Math.random() * 0.6;
    this.shirt = M.funColor((Math.random() * 10) | 0);
    this.skin = SKIN[(Math.random() * SKIN.length) | 0];
    this.hair = HAIR[(Math.random() * HAIR.length) | 0];
    this.scale = 0.86 + Math.random() * 0.26;   // adults and children
    if (Math.random() < 0.28) { this.scale = 0.66; this.intensityTolerance *= 0.55; }
    this.hunger = Math.random() * 0.25;
    this.thirst = Math.random() * 0.25;
    this.energy = 0.85 + Math.random() * 0.15;
  }

  /* --- callbacks used by Attraction --- */
  onBoarded(att) {
    this.state = GUEST_STATE.RIDING;
    this.rideTimer = att.def.cycle + 2.2;
    this.money -= att.price;
    this.spent += att.price;
    this.queueSlot = -1;
  }

  onRideBroke(att) {
    this.state = GUEST_STATE.DECIDING;
    this.queueSlot = -1;
    this.destination = null;
    this.happiness = Math.max(0, this.happiness - 0.16);
    this.thought = `${att.def.name} broke down while I was queuing!`;
  }

  onRideRemoved(att) {
    this.state = GUEST_STATE.DECIDING;
    this.queueSlot = -1;
    this.destination = null;
  }

  get needsSummary() {
    const n = [];
    if (this.hunger > 0.55) n.push('hungry');
    if (this.thirst > 0.55) n.push('thirsty');
    if (this.toilet > 0.6) n.push('needs a restroom');
    if (this.energy < 0.3) n.push('tired');
    if (this.nausea > 0.5) n.push('queasy');
    if (this.money < 6) n.push('out of money');
    return n;
  }
}

export class GuestManager {
  constructor(engine, grid, pathfinder, park) {
    this.engine = engine;
    this.grid = grid;
    this.pf = pathfinder;
    this.park = park;

    this.max = 700;
    this.guests = [];
    this.pool = [];
    for (let i = 0; i < this.max; i++) {
      const g = new Guest();
      this.guests.push(g);
      this.pool.push(g);
    }
    this.activeList = [];
    this.spawnAccum = 0;
    this.thinkCursor = 0;

    this._buildMeshes();

    this.stats = {
      arrived: 0, left: 0, happyLeft: 0, angryLeft: 0,
      avgHappiness: 0.75, spent: 0,
    };
  }

  _buildMeshes() {
    const N = this.max;
    const bodyGeo = new THREE.CapsuleGeometry(0.17, 0.48, 3, 8);
    const headGeo = new THREE.SphereGeometry(0.17, 10, 8);
    const hairGeo = new THREE.SphereGeometry(0.185, 10, 6);
    hairGeo.scale(1, 0.62, 1);

    const skinMat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 });
    const shirtMat = new THREE.MeshStandardMaterial({ roughness: 0.68, metalness: 0 });
    const hairMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });

    this.bodyMesh = new THREE.InstancedMesh(bodyGeo, shirtMat, N);
    this.headMesh = new THREE.InstancedMesh(headGeo, skinMat, N);
    this.hairMesh = new THREE.InstancedMesh(hairGeo, hairMat, N);
    for (const m of [this.bodyMesh, this.headMesh, this.hairMesh]) {
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false;
      m.count = 0;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
      this.engine.scene.add(m);
    }
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._col = new THREE.Color();
  }

  get count() { return this.activeList.length; }

  /* ------------------------------------------------------------------ *
   * Spawning
   * ------------------------------------------------------------------ */

  /** Guests appear just outside the gate and walk in. */
  spawnGuest(park) {
    if (!this.pool.length) return null;
    const g = this.pool.pop();
    const e = this.grid.entrance;
    const x = this.grid.worldX(e.gx) + (Math.random() - 0.5) * 3;
    const z = this.grid.worldZ(e.gz) + 7 + Math.random() * 3;

    const rating = park.rating;
    const wallet = 28 + Math.random() * 42 + rating * 0.05;
    g.spawn(new THREE.Vector3(x, 0, z), {
      wallet,
      happiness: THREE.MathUtils.clamp(0.55 + rating / 1600 + (Math.random() - 0.5) * 0.2, 0.25, 0.98),
      tolerance: 2 + Math.random() * 7,
    });
    g.target.set(this.grid.worldX(e.gx), 0, this.grid.worldZ(e.gz));
    this.activeList.push(g);
    this.stats.arrived++;
    return g;
  }

  despawn(g) {
    g.active = false;
    g.state = GUEST_STATE.GONE;
    if (g.destination) {
      const q = g.destination.queue;
      const i = q.indexOf(g);
      if (i >= 0) q.splice(i, 1);
    }
    g.destination = null;
    const i = this.activeList.indexOf(g);
    if (i >= 0) this.activeList.splice(i, 1);
    this.pool.push(g);
  }

  /* ------------------------------------------------------------------ *
   * Update
   * ------------------------------------------------------------------ */

  update(dt, ctx) {
    const park = ctx.park;

    // --- arrivals ---
    const rate = park.arrivalRate();
    this.spawnAccum += rate * dt;
    while (this.spawnAccum >= 1) {
      this.spawnAccum -= 1;
      if (this.activeList.length < this.max - 4) this.spawnGuest(park);
    }

    // --- AI: think for a slice of the crowd each frame ---
    const n = this.activeList.length;
    const thinkBudget = Math.max(6, Math.ceil(n * dt * 3.2));
    for (let k = 0; k < thinkBudget && n > 0; k++) {
      this.thinkCursor = (this.thinkCursor + 1) % n;
      const g = this.activeList[this.thinkCursor];
      if (g) this._think(g, dt, ctx);
    }

    // --- movement + needs for everyone ---
    for (let i = this.activeList.length - 1; i >= 0; i--) {
      const g = this.activeList[i];
      this._tick(g, dt, ctx);
      if (g.state === GUEST_STATE.GONE) this.despawn(g);
    }

    this._writeInstances(dt);
    this._rollupStats();
  }

  _rollupStats() {
    let sum = 0;
    for (const g of this.activeList) sum += g.happiness;
    this.stats.avgHappiness = this.activeList.length ? sum / this.activeList.length : 0.75;
  }

  /* ---------------- per-guest continuous update ---------------- */

  _tick(g, dt, ctx) {
    g.timeInPark += dt;

    // Needs drift.
    //
    // These rates are deliberately slow: a guest stays for roughly 7 in-game
    // minutes, and crossing a large park takes a minute on its own. Faster
    // decay than this and guests spend their whole visit walking towards a
    // need they can never satisfy in time.
    const nf = ctx.needSpeed;
    g.hunger = Math.min(1.4, g.hunger + dt * 0.0035 * nf);
    g.thirst = Math.min(1.4, g.thirst + dt * 0.0045 * nf * (1 + ctx.heat * 0.9));
    g.toilet = Math.min(1.4, g.toilet + dt * 0.003 * nf);
    g.nausea = Math.max(0, g.nausea - dt * 0.02);
    if (g.state !== GUEST_STATE.RESTING) {
      g.energy = Math.max(0, g.energy - dt * 0.0022 * nf);
    }

    // Happiness drifts toward a target set by the guest's circumstances.
    //
    // Modelling it as a target rather than an accumulating drain matters: a
    // pure drain means happiness only ever falls, so every guest eventually
    // storms out no matter how good the park is. With a target, a clean and
    // well-appointed park holds guests at a high baseline, and rides and
    // purchases are impulses on top of it.
    let pressure = 0;
    if (g.hunger > 0.7) pressure += (g.hunger - 0.7) * 0.9;
    if (g.thirst > 0.7) pressure += (g.thirst - 0.7) * 1.0;
    if (g.toilet > 0.75) pressure += (g.toilet - 0.75) * 1.6;
    if (g.energy < 0.25) pressure += (0.25 - g.energy) * 0.8;
    if (g.nausea > 0.6) pressure += (g.nausea - 0.6) * 1.1;
    if (g.money < 5) pressure += 0.12;

    const cell = this._cellUnder(g);
    if (cell >= 0) {
      const lit = this.grid.litter[cell];
      if (lit > 0.25) pressure += (lit - 0.25) * 0.8;
    }
    const beauty = ctx.park.beautyAt(g.pos.x, g.pos.z);

    const target = THREE.MathUtils.clamp(
      0.62
      + Math.min(0.26, beauty * 0.05)
      - pressure * 0.85
      - ctx.weatherMisery * 0.32,
      0, 1,
    );
    // Falling is quicker than recovering, so neglect is still felt.
    const rate = target < g.happiness ? 0.085 : 0.05;
    g.happiness += (target - g.happiness) * Math.min(1, dt * rate);

    switch (g.state) {
      case GUEST_STATE.ARRIVING:
      case GUEST_STATE.WALKING:
      case GUEST_STATE.LEAVING:
        this._move(g, dt, ctx);
        break;

      case GUEST_STATE.QUEUING: {
        const att = g.destination;
        if (!att || att.broken || !att.open) break;
        const slot = att.queue.indexOf(g);
        if (slot >= 0) this._standInQueue(g, att, slot, dt);
        // Patience runs out in long queues.
        g.queueTime = (g.queueTime || 0) + dt;
        const tolerance = 55 * g.patience * (1 + att.excitement * 0.12);
        if (g.queueTime > tolerance) {
          const i = att.queue.indexOf(g);
          if (i >= 0) att.queue.splice(i, 1);
          g.happiness = Math.max(0, g.happiness - 0.12);
          g.thought = `I waited too long for ${att.def.name}.`;
          g.state = GUEST_STATE.DECIDING;
          g.destination = null;
          g.queueTime = 0;
        }
        break;
      }

      case GUEST_STATE.RIDING: {
        g.rideTimer -= dt;
        const att = g.destination;
        if (g.rideTimer <= 0) {
          if (att) this._finishRide(g, att, ctx);
          g.state = GUEST_STATE.DECIDING;
          g.queueTime = 0;
        }
        break;
      }

      case GUEST_STATE.BUYING: {
        g.buyTimer -= dt;
        if (g.buyTimer <= 0) {
          const att = g.destination;
          if (att && !att.broken && att.open) this._completePurchase(g, att, ctx);
          g.destination = null;
          g.state = GUEST_STATE.DECIDING;
        }
        break;
      }

      case GUEST_STATE.RESTING: {
        g.restTimer -= dt;
        g.energy = Math.min(1, g.energy + dt * 0.06);
        g.happiness = Math.min(1, g.happiness + dt * 0.01);
        if (g.restTimer <= 0) g.state = GUEST_STATE.DECIDING;
        break;
      }
    }

    // Litter: guests drop rubbish when they have some and no bin is close.
    if (g.carryingTrash > 0 && cell >= 0 && Math.random() < dt * 0.35) {
      const nearBin = ctx.park.binNear(g.pos.x, g.pos.z);
      if (nearBin) {
        g.carryingTrash = 0;
      } else if (g.happiness < 0.72 || Math.random() < 0.35) {
        this.grid.addLitter(cell % GRID_W, (cell / GRID_W) | 0, 0.22);
        g.carryingTrash = Math.max(0, g.carryingTrash - 1);
      }
    }

    // Leaving conditions.
    //
    // Only evaluated between activities. A guest already walking to a burger
    // stand should be allowed to reach it — bailing out mid-journey was what
    // made the whole crowd give up before doing anything.
    if (g.state === GUEST_STATE.DECIDING || g.state === GUEST_STATE.RESTING) {
      const broke = g.money < 4 && !ctx.park.hasAtm;
      const spent = g.timeInPark > 420 + g.patience * 300;
      if (g.happiness < 0.15 || broke || spent) {
        this._headForExit(g, ctx);
      }
    }
  }

  _finishRide(g, att, ctx) {
    g.lastRideId = att.id;
    g.ridden.add(att.id);
    // How good was it? Excitement vs intensity fit, condition, price paid.
    const fit = 1 - Math.min(1, Math.abs(att.intensity - g.intensityTolerance) / 6);
    const value = THREE.MathUtils.clamp((att.excitement * 2.1 + 1.5) / Math.max(1, att.price), 0.3, 1.6);
    const quality = att.condition;
    const score = THREE.MathUtils.clamp(
      (att.excitement / 9) * 0.5 + fit * 0.25 + quality * 0.15 + (value - 0.6) * 0.2, 0, 1,
    );
    g.happiness = THREE.MathUtils.clamp(g.happiness + score * 0.24 - 0.02, 0, 1);
    g.nausea = Math.min(1.2, g.nausea + att.intensity * 0.055 * (1 - fit * 0.4));
    g.energy = Math.max(0, g.energy - 0.04);
    att.addRating(score * 5);
    att.popularity = att.popularity * 0.95 + score * 0.05;
    if (Math.random() < 0.45) g.carryingTrash += 1;
    g.thought = score > 0.62
      ? `${att.def.name} was brilliant!`
      : score > 0.35 ? `${att.def.name} was alright.` : `${att.def.name} wasn't worth it.`;
    // Pop the guest back out at the ride entrance.
    g.pos.copy(att.entry);
    ctx.park.onGuestRode?.(g, att, score);
  }

  _completePurchase(g, att, ctx) {
    const serves = att.def.serves;
    if (att.price > g.money && att.price > 0) return;
    if (att.price > 0) {
      g.money -= att.price;
      g.spent += att.price;
      this.stats.spent += att.price;
    }
    // Recorded for every visit, including the free facilities — otherwise
    // restrooms and first aid posts always report zero customers.
    att.sell(ctx.attractionCtx);
    switch (serves) {
      case 'hunger': g.hunger = Math.max(0, g.hunger - 0.75); g.carryingTrash += 1; break;
      case 'thirst': g.thirst = Math.max(0, g.thirst - 0.8); g.toilet += 0.18; g.carryingTrash += 1; break;
      case 'toilet': g.toilet = 0; break;
      case 'nausea': g.nausea = 0; break;
      case 'souvenir': g.happiness = Math.min(1, g.happiness + 0.09); break;
      case 'info': g.happiness = Math.min(1, g.happiness + 0.03); break;
      case 'cash': g.money += 45; break;
    }
    g.happiness = Math.min(1, g.happiness + 0.05);
    g.thought = serves === 'toilet' ? 'Much better.' : `Enjoyed something from ${att.def.name}.`;
  }

  _headForExit(g, ctx) {
    g.state = GUEST_STATE.LEAVING;
    g.destination = null;
    const e = this.grid.entrance;
    this._routeTo(g, e.gx, e.gz);
    g.exitPoint = new THREE.Vector3(
      this.grid.worldX(e.gx), 0, this.grid.worldZ(e.gz) + 12,
    );
    // Souvenir impulse buy on the way out.
    ctx.park.onGuestLeaving?.(g);
    this.stats.left++;
    if (g.happiness > 0.62) this.stats.happyLeft++;
    else if (g.happiness < 0.35) this.stats.angryLeft++;
  }

  /* ---------------- decision making ---------------- */

  _think(g, dt, ctx) {
    if (g.state !== GUEST_STATE.DECIDING) return;
    const park = ctx.park;

    // Urgent needs first.
    const urgent = [];
    if (g.toilet > 0.5) urgent.push(['toilet', g.toilet * 2.4]);
    if (g.nausea > 0.6) urgent.push(['nausea', g.nausea * 1.6]);
    if (g.hunger > 0.45) urgent.push(['hunger', g.hunger * 1.5]);
    if (g.thirst > 0.45) urgent.push(['thirst', g.thirst * 1.6]);
    if (g.money < 12 && park.hasAtm) urgent.push(['cash', 1.2]);
    urgent.sort((a, b) => b[1] - a[1]);

    for (const [need] of urgent) {
      const target = park.findService(need, g.pos, g);
      if (target) { this._goTo(g, target, 'shop'); return; }
    }

    // Rest if exhausted and there's a bench nearby.
    if (g.energy < 0.22) {
      g.state = GUEST_STATE.RESTING;
      g.restTimer = 6 + Math.random() * 8;
      return;
    }

    // Pick the best ride available.
    let best = null, bestScore = 0;
    for (const att of park.rides) {
      if (!att.connected) continue;
      const dist = g.pos.distanceTo(att.entry);
      if (dist > 130) continue;
      let s = att.appealTo(g);
      if (s <= 0) continue;
      s *= 1 / (1 + dist / 45);
      if (s > bestScore) { bestScore = s; best = att; }
    }

    // Occasionally browse shops even without a pressing need.
    if (Math.random() < 0.2 && g.money > 20) {
      const shop = park.findService('souvenir', g.pos, g);
      if (shop && (!best || Math.random() < 0.4)) { this._goTo(g, shop, 'shop'); return; }
    }

    if (best && bestScore > 0.35) {
      this._goTo(g, best, 'ride');
      return;
    }

    // Nothing appealing — wander, and get a bit less happy about it.
    const cell = this.grid.randomPathCell();
    if (cell) {
      this._routeTo(g, cell.gx, cell.gz);
      g.state = GUEST_STATE.WALKING;
      g.destKind = 'wander';
      g.destination = null;
    } else {
      g.thinkTimer = 1;
    }
    if (park.rides.length === 0) {
      g.happiness = Math.max(0, g.happiness - 0.03);
      g.thought = 'There is nothing to do here.';
    }
  }

  _goTo(g, att, kind) {
    g.destination = att;
    g.destKind = kind;
    const c = att.entryCell;
    if (!c) { g.state = GUEST_STATE.DECIDING; g.destination = null; return; }
    const ok = this._routeTo(g, c.gx, c.gz);
    if (!ok) { g.destination = null; g.state = GUEST_STATE.DECIDING; return; }
    g.state = GUEST_STATE.WALKING;
  }

  _routeTo(g, tgx, tgz) {
    const cell = this._cellUnder(g);
    let sx, sz;
    if (cell >= 0) { sx = cell % GRID_W; sz = (cell / GRID_W) | 0; }
    else {
      // Off-path (just spawned or just left a ride): snap to the nearest path.
      const near = this._nearestPath(g.pos);
      if (!near) return false;
      sx = near.gx; sz = near.gz;
    }
    const route = this.pf.find(sx, sz, tgx, tgz);
    if (!route) return false;
    g.route = route;
    g.routeIdx = 0;
    return true;
  }

  _cellUnder(g) {
    const gx = this.grid.gridX(g.pos.x);
    const gz = this.grid.gridZ(g.pos.z);
    if (!this.grid.inBounds(gx, gz)) return -1;
    const i = this.grid.idx(gx, gz);
    return this.grid.kind[i] === CELL.PATH ? i : -1;
  }

  _nearestPath(pos) {
    const gx = this.grid.gridX(pos.x);
    const gz = this.grid.gridZ(pos.z);
    for (let r = 0; r <= 4; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.grid.isPath(gx + dx, gz + dz)) return { gx: gx + dx, gz: gz + dz };
        }
      }
    }
    return null;
  }

  /* ---------------- movement ---------------- */

  _move(g, dt, ctx) {
    // Arriving guests walk straight to the gate before joining the network.
    if (g.state === GUEST_STATE.ARRIVING) {
      if (this._stepTowards(g, g.target, dt)) {
        g.state = GUEST_STATE.DECIDING;
        ctx.park.onGuestEntered?.(g);
      }
      return;
    }

    if (g.state === GUEST_STATE.LEAVING && (!g.route || g.routeIdx >= g.route.length)) {
      if (g.exitPoint && this._stepTowards(g, g.exitPoint, dt)) {
        g.state = GUEST_STATE.GONE;
      }
      return;
    }

    if (!g.route || g.routeIdx >= g.route.length) {
      // Reached the end of the route.
      this._arrive(g, ctx);
      return;
    }

    const cellIdx = g.route[g.routeIdx];
    const cgx = cellIdx % GRID_W, cgz = (cellIdx / GRID_W) | 0;
    this._v.set(
      this.grid.worldX(cgx) + g.lateral * 0.55,
      0,
      this.grid.worldZ(cgz) + g.lateral * 0.55,
    );
    if (this._stepTowards(g, this._v, dt)) {
      g.routeIdx++;
      if (g.routeIdx >= g.route.length) this._arrive(g, ctx);
    }
  }

  _arrive(g, ctx) {
    g.route = null;
    if (g.state === GUEST_STATE.LEAVING) {
      if (!g.exitPoint) { g.state = GUEST_STATE.GONE; }
      return;
    }
    const att = g.destination;
    if (!att) { g.state = GUEST_STATE.DECIDING; return; }

    if (g.destKind === 'ride') {
      if (!att.open || att.broken) { g.state = GUEST_STATE.DECIDING; g.destination = null; return; }
      if (att.price > g.money) { g.state = GUEST_STATE.DECIDING; g.destination = null; return; }
      att.queue.push(g);
      g.state = GUEST_STATE.QUEUING;
      g.queueTime = 0;
    } else {
      if (!att.open || att.broken) { g.state = GUEST_STATE.DECIDING; g.destination = null; return; }
      g.state = GUEST_STATE.BUYING;
      g.buyTimer = 1.6 + Math.random() * 1.6;
    }
  }

  /** Move toward a world point; returns true on arrival. */
  _stepTowards(g, target, dt) {
    const dx = target.x - g.pos.x;
    const dz = target.z - g.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.22) return true;
    const sp = g.speed * (0.7 + g.energy * 0.45) * (g.state === GUEST_STATE.LEAVING ? 1.15 : 1);
    const step = Math.min(d, sp * dt);
    g.pos.x += (dx / d) * step;
    g.pos.z += (dz / d) * step;
    const wantYaw = Math.atan2(dx, dz);
    let diff = wantYaw - g.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    g.yaw += diff * Math.min(1, dt * 9);
    g.walkPhase += step * 7;
    return false;
  }

  /** Line guests up two-abreast behind the ride entrance. */
  _standInQueue(g, att, slot, dt) {
    const dir = this._v.copy(att.entry).sub(att.center);
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    const px = -dir.z, pz = dir.x;
    const row = Math.floor(slot / 2);
    const side = (slot % 2) * 2 - 1;
    const tx = att.entry.x + dir.x * (0.5 + row * 0.62) + px * side * 0.42;
    const tz = att.entry.z + dir.z * (0.5 + row * 0.62) + pz * side * 0.42;
    this._s.set(tx, 0, tz);
    const dx = tx - g.pos.x, dz = tz - g.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.12) {
      const step = Math.min(d, 1.2 * dt);
      g.pos.x += (dx / d) * step;
      g.pos.z += (dz / d) * step;
      g.walkPhase += step * 7;
    }
    const wantYaw = Math.atan2(att.center.x - g.pos.x, att.center.z - g.pos.z);
    let diff = wantYaw - g.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    g.yaw += diff * Math.min(1, dt * 5);
  }

  /* ---------------- rendering ---------------- */

  _writeInstances(dt) {
    const m4 = this._m4, q = this._q, v = this._v, s = this._s, col = this._col;
    let n = 0;
    for (const g of this.activeList) {
      if (g.state === GUEST_STATE.RIDING) continue; // riding guests are drawn by the ride
      const sc = g.scale;
      // Walk bob + lean.
      const moving = g.state === GUEST_STATE.WALKING || g.state === GUEST_STATE.ARRIVING
        || g.state === GUEST_STATE.LEAVING;
      const bob = moving ? Math.abs(Math.sin(g.walkPhase)) * 0.055 : 0;
      const sway = moving ? Math.sin(g.walkPhase) * 0.06 : 0;
      q.setFromAxisAngle(UP, g.yaw);
      const sit = g.state === GUEST_STATE.RESTING ? -0.24 : 0;

      // torso
      v.set(g.pos.x, (0.62 + bob + sit) * sc, g.pos.z);
      s.set(sc, sc, sc);
      m4.compose(v, q, s);
      this.bodyMesh.setMatrixAt(n, m4);
      col.setHex(g.shirt);
      this.bodyMesh.instanceColor.setXYZ(n, col.r, col.g, col.b);

      // head
      v.set(g.pos.x + Math.sin(g.yaw) * sway * 0.1, (1.12 + bob + sit) * sc, g.pos.z + Math.cos(g.yaw) * sway * 0.1);
      m4.compose(v, q, s);
      this.headMesh.setMatrixAt(n, m4);
      col.setHex(g.skin);
      this.headMesh.instanceColor.setXYZ(n, col.r, col.g, col.b);

      // hair
      v.y = (1.19 + bob + sit) * sc;
      m4.compose(v, q, s);
      this.hairMesh.setMatrixAt(n, m4);
      col.setHex(g.hair);
      this.hairMesh.instanceColor.setXYZ(n, col.r, col.g, col.b);

      n++;
    }
    for (const m of [this.bodyMesh, this.headMesh, this.hairMesh]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
  }

  /** Nearest guest to a world ray hit — used for click-to-inspect. */
  pickGuest(point, maxDist = 1.4) {
    let best = null, bestD = maxDist * maxDist;
    for (const g of this.activeList) {
      if (g.state === GUEST_STATE.RIDING) continue;
      const dx = g.pos.x - point.x, dz = g.pos.z - point.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = g; }
    }
    return best;
  }

  clear() {
    for (const g of [...this.activeList]) this.despawn(g);
  }
}

const UP = new THREE.Vector3(0, 1, 0);
