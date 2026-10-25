/**
 * A placed object in the park: ride, shop, facility or scenery.
 *
 * Rides run a load -> ride -> unload cycle, wear out as they run, break down,
 * and are repaired by mechanics. Shops serve guests and take money. Scenery
 * contributes to the local beauty rating. One class covers all of them because
 * they share placement, selection, upgrading and demolition.
 */
import * as THREE from 'three';
import * as M from '../gfx/Materials.js';
import * as C from '../build/rides/common.js';
import {
  TIER, MAX_LEVEL, isRide, isShop, isFacility, isScenery, upgradeCost,
  rotatedFootprint, relocateCost,
} from '../data/catalog.js';
import { TILE } from '../world/Grid.js';

let NEXT_ID = 1;

export const RIDE_STATE = {
  CLOSED: 'closed',
  WAITING: 'waiting',   // open, taking guests into the vehicles
  RUNNING: 'running',
  UNLOADING: 'unloading',
  BROKEN: 'broken',
};

export class Attraction {
  constructor(def, gx, gz, rotation, ctx) {
    this.id = NEXT_ID++;
    this.def = def;
    this.gx = gx; this.gz = gz;
    this.rotation = rotation || 0;
    // Footprint is the rotated one: a quarter turn swaps width and depth.
    const fp = rotatedFootprint(def, this.rotation);
    this.w = fp.w; this.h = fp.h;
    this.seed = (this.id * 7919) % 101;

    this.isRide = isRide(def);
    this.isShop = isShop(def);
    this.isFacility = isFacility(def);
    this.isScenery = isScenery(def);

    // --- economy ---
    this.level = 1;
    this.price = def.ticket ?? def.price ?? 0;
    this.open = !this.isScenery;
    this.totalIncome = 0;
    this.totalGuests = 0;
    this.sessionIncome = 0;

    // --- condition / reliability ---
    this.condition = 1.0;
    this.broken = false;
    this.repairProgress = 0;
    this.mechanicAssigned = null;
    this.breakdownCheck = 6 + Math.random() * 8;

    // --- ride cycle ---
    this.state = this.isRide ? RIDE_STATE.WAITING : RIDE_STATE.CLOSED;
    this.power = 0;
    this.cycleTimer = 0;
    this.loadTimer = 0;
    this.riders = 0;
    this.queue = [];
    this.popularity = 0.5;
    this.recentRiders = 0;
    this.ratingSamples = [];

    // --- build the 3D model ---
    const buildCtx = { w: def.w, h: def.h, seed: this.seed, fx: ctx.fx, level: 1 };
    this.model = def.build(buildCtx);
    this.root = this.model.root;
    this.root.userData.attraction = this;
    this.root.traverse((o) => { if (o.isMesh) o.userData.attraction = this; });

    const c = ctx.grid.footprintCenter(gx, gz, this.w, this.h);
    this.root.position.set(c.x, 0, c.z);
    this.root.rotation.y = this.rotation;
    this.center = new THREE.Vector3(c.x, 0, c.z);

    // Bulb materials get dimmed in daylight so nothing looks washed out.
    this.bulbMats = this.model.bulbMats || [];
    this.tierDecor = null;

    // Cached for the guest AI: where guests stand to use this thing.
    this.entry = null;
    this.recomputeEntry(ctx.grid);
  }

  /** Move this attraction to a new anchor cell and rotation. */
  reanchor(gx, gz, rotation, grid) {
    this.gx = gx; this.gz = gz;
    this.rotation = rotation;
    const fp = rotatedFootprint(this.def, rotation);
    this.w = fp.w; this.h = fp.h;
    const c = grid.footprintCenter(gx, gz, this.w, this.h);
    this.root.position.set(c.x, 0, c.z);
    this.root.rotation.y = rotation;
    this.center.set(c.x, 0, c.z);
    this.recomputeEntry(grid);
  }

  /** Price of picking this up and putting it down again. */
  get moveCost() { return relocateCost(this.def); }

  /* ---------------- geometry helpers ---------------- */

  recomputeEntry(grid) {
    const cell = grid.adjacentPathCell(this.gx, this.gz, this.w, this.h);
    this.entryCell = cell;
    this.entry = cell
      ? new THREE.Vector3(grid.worldX(cell.gx), 0, grid.worldZ(cell.gz))
      : this.center.clone();
    this.connected = !!cell;
  }

  get radius() { return Math.max(this.w, this.h) * TILE * 0.5; }

  /* ---------------- tier / upgrades ---------------- */

  get tier() { return TIER[Math.min(this.level, MAX_LEVEL) - 1]; }
  get capacity() { return Math.max(1, Math.round((this.def.capacity || 0) * this.tier.capacity)); }
  get excitement() { return (this.def.excitement || 0) * this.tier.excitement; }
  get intensity() { return this.def.intensity || 0; }
  get reliability() { return Math.min(0.985, (this.def.reliability ?? 0.9) + this.tier.reliability); }
  get suggestedPrice() { return Math.round((this.def.ticket || 0) * this.tier.ticket); }
  get upkeep() { return (this.def.upkeep || 0) * (1 + (this.level - 1) * 0.28); }
  get canUpgrade() { return this.level < MAX_LEVEL && !this.isScenery; }
  get nextUpgradeCost() { return upgradeCost(this.def, this.level); }

  upgrade() {
    if (!this.canUpgrade) return false;
    this.level++;
    this.condition = Math.min(1, this.condition + 0.25);
    this.price = this.suggestedPrice;
    this._applyTierDecor();
    return true;
  }

  /** Visible reward for upgrading — bunting, extra bulbs, gold trim. */
  _applyTierDecor() {
    if (this.tierDecor) {
      this.root.remove(this.tierDecor);
      this.tierDecor = null;
    }
    this.tierFlags = [];
    if (this.level < 2) return;

    const g = new THREE.Group();
    const r = Math.max(this.w, this.h) * TILE * 0.5 - 0.4;

    // Tier 2+: pennant poles at the corners.
    const poles = this.level >= 3 ? 8 : 4;
    for (let i = 0; i < poles; i++) {
      const a = (i / poles) * Math.PI * 2 + Math.PI / poles;
      const p = C.pennant(3.0 + this.level * 0.25, M.funColor(i + this.level), i);
      p.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      p.rotation.y = -a;
      g.add(p);
      this.tierFlags.push(p.userData.flag);
    }

    // Tier 3+: a ring of bulbs around the perimeter.
    if (this.level >= 3) {
      const ring = C.bulbRing(r + 0.2, Math.round(r * 5), 0.4, 0xffe9b0, 0.1);
      g.add(ring);
      this.bulbMats = [...(this.model.bulbMats || []), ring.userData.bulbMat];
    }

    // Tier 4: gold arch over the entrance side.
    if (this.level >= 4) {
      const gold = M.mat('tier-gold', { color: 0xffca4a, roughness: 0.25, metalness: 0.9 });
      for (const s of [-1, 1]) {
        g.add(M.cyl(0.16, 4.2, gold, s * 1.8, 2.1, r + 0.4, 10));
      }
      g.add(M.box(4.0, 0.3, 0.3, gold, 0, 4.2, r + 0.4));
      g.add(M.sphere(0.28, M.glow(0xffe9b0, 3.2), 0, 4.6, r + 0.4));
    }

    this.tierDecor = g;
    this.root.add(g);
  }

  /* ---------------- condition / breakdowns ---------------- */

  repairAmount(amount) {
    this.condition = Math.min(1, this.condition + amount);
    if (this.broken && this.condition > 0.5) {
      this.broken = false;
      this.state = this.open ? RIDE_STATE.WAITING : RIDE_STATE.CLOSED;
      this.breakdownCheck = 12 + Math.random() * 12;
      return true;
    }
    return false;
  }

  instantRepairCost() {
    return Math.round(this.def.cost * 0.06 + (1 - this.condition) * this.def.cost * 0.14);
  }

  /* ---------------- per-frame simulation ---------------- */

  update(dt, ctx) {
    const t = ctx.time;

    if (this.tierFlags) for (const f of this.tierFlags) C.waveFlag(f, t);

    if (this.isScenery) {
      this.model.update?.(dt, t, { night: ctx.night, dayFraction: ctx.dayFraction, open: true, power: 0, riders: 0 });
      return;
    }

    if (this.isShop || this.isFacility) {
      this._updateShop(dt, ctx);
      return;
    }

    this._updateRide(dt, ctx);
  }

  _updateShop(dt, ctx) {
    this.model.update?.(dt, ctx.time, {
      open: this.open, night: ctx.night, dayFraction: ctx.dayFraction, power: this.open ? 1 : 0, riders: 0,
    });

    // Shops degrade slowly and simply stop serving when they break.
    // An unreachable shop serves nobody, so it must not wear out either —
    // otherwise disconnected stalls quietly break down forever and no
    // mechanic can ever get to them.
    if (this.open && this.connected) {
      this.condition = Math.max(0, this.condition - dt * 0.0016);
      this.breakdownCheck -= dt;
      if (this.breakdownCheck <= 0) {
        this.breakdownCheck = 25 + Math.random() * 25;
        const risk = (1 - this.reliability) * (1.6 - this.condition);
        if (Math.random() < risk) this._breakDown(ctx);
      }
    }
    if (this.broken) this._brokenFx(dt, ctx);
  }

  _updateRide(dt, ctx) {
    const st = {
      power: this.power, running: this.state === RIDE_STATE.RUNNING,
      riders: this.riders, night: ctx.night, dayFraction: ctx.dayFraction, open: this.open,
    };
    this.model.update?.(dt, ctx.time, st);

    if (this.broken) {
      this.power = Math.max(0, this.power - dt * 1.2);
      this._brokenFx(dt, ctx);
      return;
    }

    if (!this.open || !this.connected) {
      this.state = RIDE_STATE.CLOSED;
      this.power = Math.max(0, this.power - dt * 0.6);
      this.riders = 0;
      return;
    }

    switch (this.state) {
      case RIDE_STATE.CLOSED:
        this.state = RIDE_STATE.WAITING;
        break;

      case RIDE_STATE.WAITING: {
        this.power = Math.max(0, this.power - dt * 0.5);
        this.loadTimer += dt;
        const cap = this.capacity;
        // Board whoever is queuing; dispatch when full or after a grace period.
        const boarded = Math.min(this.queue.length, cap);
        if (boarded >= cap || (boarded > 0 && this.loadTimer > 7)) {
          this.riders = boarded;
          for (let i = 0; i < boarded; i++) {
            const g = this.queue.shift();
            g?.onBoarded?.(this);
          }
          this._charge(this.riders, ctx);
          this.state = RIDE_STATE.RUNNING;
          this.cycleTimer = this.def.cycle;
          this.loadTimer = 0;
        } else if (this.loadTimer > 14) {
          this.loadTimer = 0; // idle spin so the ride never looks dead
        }
        break;
      }

      case RIDE_STATE.RUNNING: {
        this.power = Math.min(1, this.power + dt * 0.55);
        this.cycleTimer -= dt;
        // Wear scales with intensity and how hard the ride works. Tuned so a
        // hard-running intense ride takes a couple of in-game days to go from
        // new to unreliable, not a single afternoon.
        this.condition = Math.max(0, this.condition - dt * (0.00022 + this.intensity * 0.00009));
        if (this.cycleTimer <= 0) {
          this.state = RIDE_STATE.UNLOADING;
          this.cycleTimer = 2.5;
        }
        break;
      }

      case RIDE_STATE.UNLOADING: {
        this.power = Math.max(0, this.power - dt * 0.8);
        this.cycleTimer -= dt;
        if (this.cycleTimer <= 0) {
          this.recentRiders += this.riders;
          this.riders = 0;
          this.state = RIDE_STATE.WAITING;
        }
        break;
      }
    }

    // Breakdown roll.
    this.breakdownCheck -= dt;
    if (this.breakdownCheck <= 0) {
      this.breakdownCheck = 18 + Math.random() * 22;
      const wear = 1 - this.condition;
      const risk = (1 - this.reliability) * (0.12 + wear * 1.6);
      if (Math.random() < risk) this._breakDown(ctx);
    }
  }

  _breakDown(ctx) {
    if (this.broken) return;
    this.broken = true;
    this.state = RIDE_STATE.BROKEN;
    this.riders = 0;
    this.repairProgress = 0;
    // Queued guests give up and get annoyed.
    for (const g of this.queue) g.onRideBroke?.(this);
    this.queue.length = 0;
    ctx.onBreakdown?.(this);
  }

  _brokenFx(dt, ctx) {
    this._fxTimer = (this._fxTimer || 0) - dt;
    if (this._fxTimer <= 0) {
      this._fxTimer = 0.5;
      const p = this.center.clone();
      p.y = 2.2 + Math.random() * 1.5;
      p.x += (Math.random() - 0.5) * this.radius;
      p.z += (Math.random() - 0.5) * this.radius;
      ctx.fx?.smoke(p, 0.55, 0x2b2b2b);
      if (Math.random() < 0.4) ctx.fx?.sparks(p);
    }
  }

  /** Take money for a dispatch. */
  _charge(count, ctx) {
    if (count <= 0) return;
    const gross = count * this.price;
    this.totalIncome += gross;
    this.sessionIncome += gross;
    this.totalGuests += count;
    ctx.economy.earn(gross, 'rides');
    if (gross > 0) ctx.onIncome?.(this, gross);
  }

  /** A guest buys from this shop. */
  sell(ctx) {
    const gross = this.price;
    const net = gross - (this.def.cogs || 0);
    this.totalIncome += net;
    this.sessionIncome += net;
    this.totalGuests++;
    ctx.economy.earn(net, 'shops');
    if (net > 0) ctx.onIncome?.(this, net);
    // Serving wears the shop very slightly.
    this.condition = Math.max(0, this.condition - 0.0006);
    return net;
  }

  /* ---------------- guest-facing scoring ---------------- */

  /**
   * How appealing this ride is to a given guest right now, 0 = won't ride.
   * Combines excitement, intensity tolerance, price sensitivity, queue length
   * and current condition.
   */
  appealTo(guest) {
    if (!this.open || this.broken || !this.connected) return 0;
    if (this.queue.length > this.capacity * 2.5 + 6) return 0;

    let score = this.excitement;

    // Intensity preference — timid guests refuse the big stuff.
    const tol = guest.intensityTolerance;
    const diff = this.intensity - tol;
    if (diff > 2.2) return 0;
    score *= diff > 0 ? Math.max(0.15, 1 - diff * 0.4) : 1 + Math.min(0.35, -diff * 0.07);

    // Price: guests compare against what the ride feels like it's worth.
    const fair = this.excitement * 2.1 + 1.5;
    if (this.price > guest.money) return 0;
    const value = fair / Math.max(1, this.price);
    score *= THREE.MathUtils.clamp(value, 0.15, 1.7);

    // Queue and condition.
    score *= 1 / (1 + this.queue.length / Math.max(4, this.capacity));
    score *= 0.55 + this.condition * 0.45;

    // Novelty: guests avoid riding the same thing twice in a row.
    if (guest.lastRideId === this.id) score *= 0.2;
    if (guest.ridden.has(this.id)) score *= 0.6;

    return score;
  }

  /** Average guest rating of this ride, 0..5 stars. */
  get stars() {
    if (!this.ratingSamples.length) {
      return THREE.MathUtils.clamp(this.excitement / 2, 0.5, 5);
    }
    const avg = this.ratingSamples.reduce((a, b) => a + b, 0) / this.ratingSamples.length;
    return THREE.MathUtils.clamp(avg, 0, 5);
  }

  addRating(r) {
    this.ratingSamples.push(r);
    if (this.ratingSamples.length > 40) this.ratingSamples.shift();
  }

  /* ---------------- teardown ---------------- */

  dispose(scene) {
    scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.isMesh || o.isPoints) {
        o.geometry?.dispose?.();
        // Materials are shared through the cache, so they are not disposed here.
      }
    });
    for (const g of this.queue) g.onRideRemoved?.(this);
    this.queue.length = 0;
  }

  /** Refund value when demolished. */
  get salvage() {
    let spent = this.def.cost;
    for (let l = 1; l < this.level; l++) spent += upgradeCost(this.def, l);
    return Math.round(spent * 0.45);
  }

  get statusLabel() {
    if (this.broken) return 'Broken down';
    if (!this.connected) return 'No path connection';
    if (!this.open) return 'Closed';
    if (this.isShop || this.isFacility) return 'Open';
    if (this.state === RIDE_STATE.RUNNING) return 'Running';
    if (this.state === RIDE_STATE.UNLOADING) return 'Unloading';
    return this.queue.length ? 'Loading' : 'Waiting for guests';
  }
}
