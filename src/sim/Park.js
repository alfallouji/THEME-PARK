/**
 * The park itself: placement, ratings, weather, progression and the day cycle.
 *
 * This is the coordinator every other system talks to. It owns the list of
 * attractions, derives the park rating from what guests actually experience,
 * and decides how many new guests turn up at the gate.
 */
import * as THREE from 'three';
import { Grid, GRID_W, GRID_H, TILE, CELL } from '../world/Grid.js';
import { Paths, PATH_STYLES } from '../world/Paths.js';
import { Attraction } from './Attraction.js';
import { Pathfinder } from './Pathfinder.js';
import { GuestManager } from './Guests.js';
import { StaffManager, STAFF_TYPES } from './Staff.js';
import { Economy } from './Economy.js';
import {
  CATALOG, isRide, isShop, isFacility, isScenery, rotatedFootprint, relocateCost,
} from '../data/catalog.js';

/** One in-game day in real seconds at 1x speed. */
export const DAY_LENGTH = 600;

export const WEATHERS = {
  clear: { id: 'clear', name: 'Clear', emoji: '☀️', heat: 0.7, misery: 0, appeal: 1.15, mode: 'clear' },
  sunny: { id: 'sunny', name: 'Sunny', emoji: '🌤️', heat: 0.9, misery: 0, appeal: 1.2, mode: 'clear' },
  cloudy: { id: 'cloudy', name: 'Cloudy', emoji: '☁️', heat: 0.35, misery: 0.05, appeal: 0.95, mode: 'clear' },
  rain: { id: 'rain', name: 'Rain', emoji: '🌧️', heat: 0.1, misery: 0.45, appeal: 0.55, mode: 'rain' },
  storm: { id: 'storm', name: 'Thunderstorm', emoji: '⛈️', heat: 0.15, misery: 0.8, appeal: 0.3, mode: 'storm' },
  snow: { id: 'snow', name: 'Snow', emoji: '🌨️', heat: 0.0, misery: 0.5, appeal: 0.6, mode: 'snow' },
};

const WEATHER_WEIGHTS = [
  ['clear', 26], ['sunny', 24], ['cloudy', 22], ['rain', 15], ['storm', 6], ['snow', 4],
];

export class Park {
  constructor(engine, fx) {
    this.engine = engine;
    this.fx = fx;

    this.grid = new Grid();
    this.paths = new Paths(engine, this.grid);
    this.pf = new Pathfinder(this.grid);
    this.economy = new Economy(14000);

    this.guests = new GuestManager(engine, this.grid, this.pf, this);
    this.staff = new StaffManager(engine, this.grid, this.pf, this);

    /** @type {Attraction[]} */
    this.attractions = [];
    this.rides = [];
    this.shops = [];
    this.scenery = [];
    this.bins = [];
    this.lamps = [];

    this.name = 'WonderPark';
    this.day = 1;
    this.dayFraction = 0.34;   // open mid-morning on day one
    this.timeScale = 1;
    this.paused = false;
    this.elapsed = 0;

    this.entryFee = 8;
    this.rating = 60;
    this._ratingTarget = 60;
    this.beauty = new Float32Array(GRID_W * GRID_H);
    this.busyCells = [];

    this.weather = WEATHERS.sunny;
    this.weatherTimer = 120;
    this.marketing = 0;          // remaining seconds of campaign
    this.marketingPower = 0;

    // Service contract: broken rides are fixed automatically, at a premium
    // over what an on-site mechanic would cost.
    this.autoRepair = false;
    /** Console cheat: ignore rating gates on the build catalogue. */
    this.unlockAll = false;
    this.autoRepairPremium = 1.35;
    this.autoRepairDelay = 4;

    this.breakdownsToday = 0;
    this.messages = [];
    this.objectives = makeObjectives();
    this.completedObjectives = 0;
    this.awards = [];

    this.attractionCtx = {
      grid: this.grid,
      fx: this.fx,
      economy: this.economy,
      time: 0,
      night: 0,
      dayFraction: this.dayFraction,
      onBreakdown: (a) => this._onBreakdown(a),
      onIncome: (a, amt) => this.onIncome?.(a, amt),
    };

    this._beautyDirty = true;
    this._busyTimer = 0;
    /** True only while a save is being applied. */
    this.loading = false;
  }

  /* ================================================================== *
   * Placement
   * ================================================================== */

  /** Validate a placement without committing it. */
  canPlace(defId, gx, gz, { free = false, rotation = 0 } = {}) {
    const def = CATALOG[defId];
    if (!def) return { ok: false, reason: 'Unknown item' };
    const fp = rotatedFootprint(def, rotation);
    const blocked = this.grid.blockingReason(gx, gz, fp.w, fp.h);
    if (blocked) return { ok: false, reason: blocked };
    if (!free && !this.economy.canAfford(def.cost)) {
      return { ok: false, reason: 'Not enough credits' };
    }
    if (!free && !this.isUnlocked(def)) {
      return { ok: false, reason: `Needs park rating ${def.unlock}` };
    }
    // Paths inside the footprint are paved over at no charge and no refund.
    const pavedOver = this.grid.countPathsIn(gx, gz, fp.w, fp.h);
    return { ok: true, def, pavedOver };
  }

  /** Has this item been earned yet? `unlockAll` is the console cheat. */
  isUnlocked(def) {
    return this.unlockAll || def.unlock <= this.rating;
  }

  /**
   * @param {object} [opts]
   * @param {boolean} [opts.free] Place without charging or logging the cost —
   *   used for the scenery the park opens with.
   */
  place(defId, gx, gz, rotation = 0, opts = {}) {
    const check = this.canPlace(defId, gx, gz, { ...opts, rotation });
    if (!check.ok) return { ok: false, reason: check.reason };
    const def = check.def;

    const att = new Attraction(def, gx, gz, rotation, this.attractionCtx);
    // Paved-over walkways are removed first, so the footprint claims clean ground.
    const paved = this.grid.clearPathsIn(gx, gz, att.w, att.h);
    if (paved) {
      this.paths.markDirty();
      this.pf.invalidate();
    }
    this.grid.claim(gx, gz, att.w, att.h, att, CELL.BUILDING);
    this.engine.scene.add(att.root);
    this.attractions.push(att);

    if (isRide(def)) this.rides.push(att);
    else if (isShop(def) || isFacility(def)) this.shops.push(att);
    else this.scenery.push(att);

    if (att.model.isBin || def.id === 'trashBin') this.bins.push(att);
    if (att.model.isLamp || def.id === 'lampPost') this.lamps.push(att);

    if (!opts.free) this.economy.spend(def.cost, 'construction');
    this._beautyDirty = true;
    this._recomputeConnections();
    if (!opts.free) {
      this.fx.dust(att.center.clone(), Math.max(1, def.w * 0.4));
      this.log(
        paved ? `Built ${def.name} over ${paved} path tile${paved === 1 ? '' : 's'}`
          : `Built ${def.name}`,
        'good', def.emoji,
      );
    }
    this.checkObjectives();
    return { ok: true, attraction: att, pavedOver: paved };
  }

  remove(att) {
    if (!att) return 0;
    const refund = att.salvage;
    this.grid.release(att.gx, att.gz, att.w, att.h);
    att.dispose(this.engine.scene);

    const drop = (arr) => { const i = arr.indexOf(att); if (i >= 0) arr.splice(i, 1); };
    drop(this.attractions); drop(this.rides); drop(this.shops);
    drop(this.scenery); drop(this.bins); drop(this.lamps);

    for (const s of this.staff.staff) {
      if (s.targetAttraction === att) { s.targetAttraction = null; s.task = 'idle'; s.route = null; }
    }
    this.economy.refund(refund, 'construction');
    this.fx.dust(att.center.clone(), Math.max(1, att.w * 0.5));
    this._beautyDirty = true;
    this._recomputeConnections();
    this.log(`Demolished ${att.def.name} (+${Math.round(refund)})`, 'warn', '🧨');
    return refund;
  }

  /* ---------------- relocation ---------------- */

  /**
   * Can this attraction be picked up and set down at (gx,gz) with `rotation`?
   * Its own current tiles count as free ground, so nudging something one tile
   * sideways works.
   */
  canRelocate(att, gx, gz, rotation) {
    if (!att) return { ok: false, reason: 'Nothing selected' };
    const fp = rotatedFootprint(att.def, rotation);
    const blocked = this.grid.blockingReason(gx, gz, fp.w, fp.h, { ignore: att });
    if (blocked) return { ok: false, reason: blocked };
    const unchanged = gx === att.gx && gz === att.gz
      && Math.abs(rotation - att.rotation) < 1e-4;
    const cost = unchanged ? 0 : relocateCost(att.def);
    if (cost > 0 && !this.economy.canAfford(cost)) {
      return { ok: false, reason: `Moving costs ${cost} credits` };
    }
    return {
      ok: true, cost, unchanged,
      pavedOver: this.grid.countPathsIn(gx, gz, fp.w, fp.h),
    };
  }

  /**
   * Commit a relocation. Everything the attraction has earned, its upgrade
   * tier and its condition all come with it — only the ground changes.
   */
  relocate(att, gx, gz, rotation) {
    const check = this.canRelocate(att, gx, gz, rotation);
    if (!check.ok) return { ok: false, reason: check.reason };
    if (check.unchanged) return { ok: true, cost: 0, unchanged: true };

    this.grid.release(att.gx, att.gz, att.w, att.h);
    att.reanchor(gx, gz, rotation, this.grid);
    const paved = this.grid.clearPathsIn(gx, gz, att.w, att.h);
    this.grid.claim(gx, gz, att.w, att.h, att, CELL.BUILDING);
    if (paved) { this.paths.markDirty(); this.pf.invalidate(); }

    // Anyone queuing was queuing somewhere that no longer exists.
    for (const g of att.queue) g.onRideRemoved?.(att);
    att.queue.length = 0;
    // Staff walking to it are following a stale route.
    for (const s of this.staff.staff) {
      if (s.targetAttraction === att) { s.targetAttraction = null; s.task = 'idle'; s.route = null; }
      if (att.mechanicAssigned === s) att.mechanicAssigned = null;
    }

    this.economy.spend(check.cost, 'construction');
    this._beautyDirty = true;
    this._recomputeConnections();
    this.fx.dust(att.center.clone(), Math.max(1, att.w * 0.4));
    this.log(`Moved ${att.def.name} (-${check.cost})`, 'info', '📦');
    return { ok: true, cost: check.cost, pavedOver: paved };
  }

  /* ---------------- paths ---------------- */

  placePath(gx, gz, styleIndex) {
    const style = PATH_STYLES[styleIndex] || PATH_STYLES[0];
    if (!this.grid.inBounds(gx, gz)) return false;
    const i = this.grid.idx(gx, gz);
    if (this.grid.kind[i] === CELL.PATH && this.grid.pathStyle[i] === styleIndex) return false;
    const isNew = this.grid.kind[i] !== CELL.PATH;
    const cost = isNew ? style.cost : Math.round(style.cost * 0.5);
    if (!this.economy.canAfford(cost)) return false;
    if (!this.grid.setPath(gx, gz, styleIndex)) return false;
    this.economy.spend(cost, 'construction');
    this.paths.markDirty();
    this.pf.invalidate();
    this._recomputeConnections();
    return true;
  }

  removePath(gx, gz) {
    if (!this.grid.clearPath(gx, gz)) return false;
    this.paths.markDirty();
    this.pf.invalidate();
    this._recomputeConnections();
    return true;
  }

  _recomputeConnections() {
    for (const a of this.attractions) a.recomputeEntry(this.grid);
  }

  /** Lay the starting plaza so the player isn't staring at bare grass. */
  buildStarterPaths() {
    const e = this.grid.entrance;
    const cx = e.gx;
    // Main avenue from the gate into the middle of the plot.
    for (let z = e.gz; z >= GRID_H / 2 - 6; z--) {
      for (let dx = -1; dx <= 1; dx++) this.grid.setPath(cx + dx, z, 0);
    }
    // Cross street.
    const zc = Math.floor(GRID_H / 2) - 6;
    for (let x = cx - 12; x <= cx + 12; x++) {
      for (let dz = 0; dz <= 1; dz++) this.grid.setPath(x, zc + dz, 0);
    }
    this.paths.markDirty();
    this.pf.invalidate();
  }

  /* ================================================================== *
   * Derived state
   * ================================================================== */

  /** Scenery beauty field, recomputed only when scenery changes. */
  _rebuildBeauty() {
    this.beauty.fill(0);
    const add = (cx, cz, amount, radiusTiles) => {
      const r = Math.ceil(radiusTiles);
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx, z = cz + dz;
          if (x < 0 || z < 0 || x >= GRID_W || z >= GRID_H) continue;
          const d = Math.hypot(dx, dz);
          if (d > radiusTiles) continue;
          this.beauty[z * GRID_W + x] += amount * (1 - d / radiusTiles);
        }
      }
    };
    for (const a of this.attractions) {
      const s = a.def.scenery;
      if (!s) continue;
      const cx = a.gx + (a.w >> 1), cz = a.gz + (a.h >> 1);
      add(cx, cz, s, (a.def.sceneryRadius || 8) / TILE);
    }
    // Litter subtracts from beauty.
    this._beautyDirty = false;
  }

  beautyAt(wx, wz) {
    const gx = this.grid.gridX(wx), gz = this.grid.gridZ(wz);
    if (!this.grid.inBounds(gx, gz)) return 0;
    const i = this.grid.idx(gx, gz);
    return Math.max(0, this.beauty[i] - this.grid.litter[i] * 4);
  }

  binNear(wx, wz) {
    for (const b of this.bins) {
      const dx = b.center.x - wx, dz = b.center.z - wz;
      if (dx * dx + dz * dz < 49) return b;
    }
    return null;
  }

  get hasAtm() { return this.shops.some((s) => s.def.serves === 'cash' && s.open && !s.broken); }

  /** Attractions a mechanic might visit. */
  get maintainable() {
    const out = [];
    for (const a of this.rides) if (a.broken || a.condition < 0.8) out.push(a);
    for (const a of this.shops) if (a.broken || a.condition < 0.7) out.push(a);
    return out;
  }

  get brokenCount() {
    return this.attractions.reduce((n, a) => n + (a.broken ? 1 : 0), 0);
  }

  /** Nearest open service of a given kind that this guest can afford. */
  findService(need, pos, guest) {
    let best = null, bestScore = 0;
    for (const s of this.shops) {
      if (s.def.serves !== need) continue;
      if (!s.open || s.broken || !s.connected) continue;
      if (s.price > guest.money) continue;
      const d = pos.distanceTo(s.entry);
      if (d > 120) continue;
      const score = 1 / (1 + d / 25);
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  /* ---------------- rating ---------------- */

  _computeRating() {
    // 1. Attraction quality — variety matters more than raw count.
    const kinds = new Set();
    let excitement = 0;
    for (const r of this.rides) {
      if (!r.connected) continue;
      kinds.add(r.def.id);
      excitement += r.excitement * (0.6 + r.condition * 0.4);
    }
    const varietyScore = Math.min(1, kinds.size / 12);
    const excitementScore = Math.min(1, excitement / 70);

    // 2. Guest sentiment.
    const happiness = this.guests.stats.avgHappiness;

    // 3. Upkeep of the place.
    const cleanliness = 1 - Math.min(1, this.grid.averageLitter() * 1.6);
    const workingRides = this.rides.length
      ? 1 - this.brokenCount / Math.max(1, this.attractions.length)
      : 0.6;

    // 4. Scenery along the paths guests actually walk.
    let beautySum = 0, beautyN = 0;
    for (let i = 0; i < this.grid.kind.length; i++) {
      if (this.grid.kind[i] !== CELL.PATH) continue;
      beautySum += Math.min(8, this.beauty[i]); beautyN++;
    }
    const beautyScore = beautyN ? Math.min(1, (beautySum / beautyN) / 5) : 0;

    // 5. Facility coverage.
    const toilets = this.shops.filter((s) => s.def.serves === 'toilet' && s.connected).length;
    const food = this.shops.filter((s) => s.def.serves === 'hunger' && s.connected).length;
    const drink = this.shops.filter((s) => s.def.serves === 'thirst' && s.connected).length;
    const guestsPer = Math.max(1, this.guests.count);
    const facilityScore = Math.min(1,
      (Math.min(1, toilets / Math.ceil(guestsPer / 60)) * 0.4)
      + (Math.min(1, food / Math.ceil(guestsPer / 70)) * 0.3)
      + (Math.min(1, drink / Math.ceil(guestsPer / 70)) * 0.3));

    const score =
      varietyScore * 200 +
      excitementScore * 240 +
      happiness * 240 +
      cleanliness * 110 +
      beautyScore * 110 +
      facilityScore * 70 +
      workingRides * 30;

    this._ratingTarget = Math.max(0, Math.min(1000, score));
    this.ratingParts = {
      variety: varietyScore, excitement: excitementScore, happiness,
      cleanliness, beauty: beautyScore, facilities: facilityScore, working: workingRides,
    };
  }

  /** What guests consider a reasonable admission price for this park. */
  fairEntryFee() { return 8 + this.rating * 0.035; }

  /** Guests per second wanting to come in. */
  arrivalRate() {
    // Nobody arrives in the small hours.
    const f = this.dayFraction;
    let timeCurve;
    if (f < 0.30) timeCurve = 0.02;
    else if (f < 0.42) timeCurve = (f - 0.30) / 0.12;
    else if (f < 0.72) timeCurve = 1;
    else if (f < 0.88) timeCurve = 1 - (f - 0.72) / 0.16;
    else timeCurve = 0.04;

    const ratingPull = 0.25 + Math.pow(this.rating / 1000, 0.85) * 2.4;
    // Entry fee: guests compare it against what the park is worth.
    const worth = this.fairEntryFee();
    const priceFactor = THREE.MathUtils.clamp(1.35 - (this.entryFee / Math.max(4, worth)) * 0.65, 0.05, 1.5);
    const marketing = 1 + this.marketingPower;
    const weather = this.weather.appeal;

    return ratingPull * timeCurve * priceFactor * marketing * weather * 0.3;
  }

  /* ================================================================== *
   * Events from guests
   * ================================================================== */

  onGuestEntered(g) {
    if (this.entryFee > 0) {
      const fee = Math.min(this.entryFee, g.money);
      g.money -= fee;
      this.economy.earn(fee, 'entry');
    }
  }

  onGuestLeaving(g) {
    // Happy guests buy a souvenir on the way out if there's a shop.
    if (g.happiness > 0.68 && g.money > 15) {
      const shop = this.shops.find((s) => s.def.serves === 'souvenir' && s.open && !s.broken);
      if (shop) {
        g.money -= shop.price;
        shop.sell(this.attractionCtx);
      }
    }
  }

  onGuestRode(g, att, score) {
    if (score > 0.7 && Math.random() < 0.06) {
      this.fx.confetti(att.center.clone().setY(2.5), 14);
    }
  }

  /**
   * Pay to fix anything that has been broken for longer than the grace period.
   * The delay gives a mechanic the chance to get there first, so hiring staff
   * remains the cheaper option.
   */
  _updateAutoRepair(dt) {
    if (!this.autoRepair) return;
    for (const a of this.attractions) {
      if (!a.broken) { a.autoRepairTimer = 0; continue; }
      a.autoRepairTimer = (a.autoRepairTimer || 0) + dt;
      if (a.autoRepairTimer < this.autoRepairDelay) continue;

      const cost = Math.round(a.instantRepairCost() * this.autoRepairPremium);
      if (!this.economy.canAfford(cost)) {
        if (!a.autoRepairWarned) {
          a.autoRepairWarned = true;
          this.log(`Auto-repair can't afford ${a.def.name} (${cost})`, 'bad', '💸');
        }
        continue;
      }
      this.economy.spend(cost, 'repairs');
      a.repairAmount(1);
      a.condition = 1;
      a.autoRepairTimer = 0;
      a.autoRepairWarned = false;
      this.fx.sparks(a.center.clone().setY(2));
      this.log(`Auto-repair fixed ${a.def.name} (-${cost})`, 'good', '🛠️');
      this.onAutoRepair?.(a, cost);
    }
  }

  _onBreakdown(att) {
    att.autoRepairTimer = 0;
    att.autoRepairWarned = false;
    this.breakdownsToday++;
    this.log(`${att.def.name} has broken down!`, 'bad', '⚠️');
    this.onBreakdownEvent?.(att);
  }

  /* ================================================================== *
   * Weather & marketing
   * ================================================================== */

  _updateWeather(dt) {
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = 150 + Math.random() * 260;
      const total = WEATHER_WEIGHTS.reduce((a, [, w]) => a + w, 0);
      let r = Math.random() * total;
      let pick = 'clear';
      for (const [id, w] of WEATHER_WEIGHTS) { r -= w; if (r <= 0) { pick = id; break; } }
      if (pick !== this.weather.id) {
        this.weather = WEATHERS[pick];
        this.fx.weather.set(this.weather.mode);
        this.log(`Weather: ${this.weather.name}`, 'info', this.weather.emoji);
      }
    }
  }

  startMarketing(cost, seconds, power) {
    if (!this.economy.canAfford(cost)) return false;
    this.economy.spend(cost, 'marketing');
    this.marketing = Math.max(this.marketing, seconds);
    this.marketingPower = Math.max(this.marketingPower, power);
    this.log('Marketing campaign launched', 'good', '📣');
    return true;
  }

  /* ================================================================== *
   * Main update
   * ================================================================== */

  update(realDt, sky) {
    const dt = this.paused ? 0 : realDt * this.timeScale;
    this.elapsed += dt;

    // --- clock ---
    const prevFraction = this.dayFraction;
    if (dt > 0) {
      this.dayFraction += dt / DAY_LENGTH;
      if (this.dayFraction >= 1) {
        this.dayFraction -= 1;
        this._endDay();
      }
    }

    const night = sky.nightAmount;
    const ctx = this.attractionCtx;
    ctx.time = this.elapsed;
    ctx.night = night;
    ctx.dayFraction = this.dayFraction;

    if (this._beautyDirty) this._rebuildBeauty();

    // --- attractions ---
    for (const a of this.attractions) a.update(dt, ctx);

    // --- crowd ---
    if (dt > 0) {
      const guestCtx = {
        park: this,
        attractionCtx: ctx,
        needSpeed: 1,
        heat: this.weather.heat,
        weatherMisery: this.weather.misery,
        fx: this.fx,
      };
      this.guests.update(dt, guestCtx);
      this.staff.update(dt, { fx: this.fx, guests: this.guests, park: this, onRepaired: (a, s) => {
        this.log(`${s.def.name} repaired ${a.def.name}`, 'good', '🔧');
      } });
    }

    // --- running costs ---
    if (dt > 0) {
      const wages = this.staff.totalWage() / 60;
      this.economy.drain(wages, 'staff', dt);
      let upkeep = 0;
      for (const a of this.attractions) if (a.open) upkeep += a.upkeep;
      this.economy.drain(upkeep / 60, 'upkeep', dt);
      this.economy.update(dt);

      if (this.marketing > 0) {
        this.marketing -= dt;
        if (this.marketing <= 0) { this.marketingPower = 0; this.log('Marketing campaign ended', 'info', '📣'); }
      }

      this._updateWeather(dt);
      this._updateAutoRepair(dt);
    }

    // --- rating drifts toward its computed target ---
    this._ratingTick = (this._ratingTick || 0) - realDt;
    if (this._ratingTick <= 0) {
      this._ratingTick = 1.0;
      this._computeRating();
      this.checkObjectives();
    }
    this.rating += (this._ratingTarget - this.rating) * Math.min(1, realDt * 0.25);

    // --- busy-cell sampling for staff patrols ---
    this._busyTimer -= realDt;
    if (this._busyTimer <= 0) {
      this._busyTimer = 3;
      const counts = new Map();
      for (const g of this.guests.activeList) {
        const gx = this.grid.gridX(g.pos.x), gz = this.grid.gridZ(g.pos.z);
        if (!this.grid.isPath(gx, gz)) continue;
        const k = this.grid.idx(gx, gz);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      this.busyCells = [...counts.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 24)
        .map(([i]) => ({ gx: i % GRID_W, gz: (i / GRID_W) | 0 }));
    }

    this.paths.update(realDt);
  }

  _endDay() {
    const summary = this.economy.closeDay(this.day);
    this.day++;
    this.breakdownsToday = 0;
    this.onDayEnd?.(summary, this.day);
    this.log(
      `Day ${this.day - 1} closed: ${summary.profit >= 0 ? '+' : ''}${Math.round(summary.profit)} credits`,
      summary.profit >= 0 ? 'good' : 'bad', '📅',
    );
    this._checkAwards();
  }

  /* ================================================================== *
   * Progression
   * ================================================================== */

  checkObjectives() {
    // While a save is being applied the park is half-rebuilt: buildings exist
    // but the saved completion flags have not been restored yet, so every
    // already-earned objective would fire again and pay out a second time.
    if (this.loading) return;
    for (const o of this.objectives) {
      if (o.done) continue;
      const v = o.progress(this);
      o.value = v;
      if (v >= o.goal) {
        o.done = true;
        this.completedObjectives++;
        this.economy.earn(o.reward, 'entry');
        this.log(`Objective complete: ${o.name} (+${o.reward})`, 'gold', '🏆');
        this.onObjective?.(o);
      }
    }
  }

  _checkAwards() {
    const candidates = [
      { id: 'clean', name: 'Cleanest Park in the Region', emoji: '✨', cash: 1500,
        test: () => this.grid.averageLitter() < 0.05 && this.guests.count > 40 },
      { id: 'thrill', name: 'Best Thrill Park', emoji: '🎢', cash: 2500,
        test: () => this.rides.filter((r) => r.intensity > 5).length >= 4 && this.rating > 500 },
      { id: 'value', name: 'Best Value Park', emoji: '💷', cash: 1800,
        test: () => this.entryFee <= 10 && this.rating > 450 && this.guests.stats.avgHappiness > 0.7 },
      { id: 'beauty', name: 'Most Beautiful Park', emoji: '🌺', cash: 2000,
        test: () => (this.ratingParts?.beauty ?? 0) > 0.8 },
      { id: 'safe', name: 'Safest Park', emoji: '🛡️', cash: 1600,
        test: () => this.breakdownsToday === 0 && this.rides.length >= 6 },
    ];
    for (const a of candidates) {
      if (this.awards.some((x) => x.id === a.id)) continue;
      if (a.test()) {
        this.awards.push(a);
        this.economy.earn(a.cash, 'entry');
        this.log(`Award won: ${a.name} (+${a.cash})`, 'gold', a.emoji);
        this.onAward?.(a);
      }
    }
  }

  log(text, kind = 'info', emoji = '•') {
    const clock = this._clockString();
    this.messages.push({ text, kind, emoji, clock });
    if (this.messages.length > 120) this.messages.shift();
    this.onMessage?.({ text, kind, emoji, clock });
  }

  _clockString() {
    const total = this.dayFraction * 24;
    const h = Math.floor(total);
    const m = Math.floor((total - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /* ---------------- stats for the UI ---------------- */

  snapshot() {
    return {
      cash: this.economy.cash,
      rating: this.rating,
      guests: this.guests.count,
      happiness: this.guests.stats.avgHappiness,
      cleanliness: 1 - Math.min(1, this.grid.averageLitter() * 1.6),
      rides: this.rides.length,
      shops: this.shops.length,
      staff: this.staff.count,
      broken: this.brokenCount,
      profit: this.economy.profitRate,
      day: this.day,
      weather: this.weather,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Objectives
 * ------------------------------------------------------------------ */
function makeObjectives() {
  const mk = (id, name, desc, emoji, goal, reward, progress) =>
    ({ id, name, desc, emoji, goal, reward, progress, value: 0, done: false });

  return [
    mk('first-ride', 'Open for Business', 'Build your first ride', '🎠', 1, 500,
      (p) => p.rides.length),
    mk('food', 'Feed the Masses', 'Build a food shop and a drinks stall', '🍔', 2, 400,
      (p) => new Set(p.shops.filter((s) => ['hunger', 'thirst'].includes(s.def.serves))
        .map((s) => s.def.serves)).size),
    mk('toilets', 'Basic Decency', 'Build a restroom', '🚻', 1, 300,
      (p) => p.shops.filter((s) => s.def.serves === 'toilet').length),
    mk('crowd-50', 'Drawing a Crowd', 'Have 50 guests in the park at once', '👥', 50, 900,
      (p) => p.guests.count),
    mk('staff', 'Staff Up', 'Hire a mechanic and a janitor', '🧑‍🔧', 2, 700,
      (p) => (p.staff.countOf('mechanic') > 0 ? 1 : 0) + (p.staff.countOf('janitor') > 0 ? 1 : 0)),
    mk('variety', 'Something for Everyone', 'Build 5 different kinds of ride', '🎡', 5, 1400,
      (p) => new Set(p.rides.map((r) => r.def.id)).size),
    mk('upgrade', 'Deluxe Treatment', 'Upgrade any ride to Deluxe', '⭐', 1, 800,
      (p) => p.rides.some((r) => r.level >= 2) ? 1 : 0),
    mk('rating-300', 'Rising Star', 'Reach a park rating of 300', '📈', 300, 1200,
      (p) => p.rating),
    mk('scenery', 'Landscaper', 'Place 25 pieces of scenery', '🌳', 25, 900,
      (p) => p.scenery.length),
    mk('cash-50k', 'Tycoon', 'Bank 50,000 credits', '💰', 50000, 3000,
      (p) => p.economy.cash),
    mk('crowd-200', 'Packed House', 'Have 200 guests in the park at once', '🎉', 200, 3500,
      (p) => p.guests.count),
    mk('coaster', 'The Big One', 'Build a roller coaster', '🎢', 1, 2500,
      (p) => p.rides.filter((r) => r.def.id === 'rollerCoaster').length),
    mk('rating-700', 'World Class', 'Reach a park rating of 700', '🏆', 700, 6000,
      (p) => p.rating),
  ];
}
