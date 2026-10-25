/**
 * Tile grid: occupancy, footprints and path connectivity.
 *
 * The park is a GRID_W x GRID_H lattice of TILE-sized cells centred on the
 * origin. Everything placeable claims a rectangular footprint of cells, which
 * keeps collision checks, removal and the minimap trivially cheap.
 */
export const GRID_W = 72;
export const GRID_H = 72;
export const TILE = 2;

/** Half-extent of the playable plot in world units. */
export const WORLD_HALF = (GRID_W * TILE) / 2;

export const CELL = {
  EMPTY: 0,
  PATH: 1,
  BUILDING: 2,
  WATER: 3,
  BLOCKED: 4,
};

export class Grid {
  constructor() {
    const n = GRID_W * GRID_H;
    /** @type {Uint8Array} cell kind */
    this.kind = new Uint8Array(n);
    /** @type {(object|null)[]} owning entity per cell */
    this.owner = new Array(n).fill(null);
    /** @type {Uint8Array} path style index per cell */
    this.pathStyle = new Uint8Array(n);
    /** @type {Float32Array} litter accumulation 0..1 */
    this.litter = new Float32Array(n);
    /** @type {Float32Array} grass wear 0..1 (cosmetic) */
    this.wear = new Float32Array(n);

    // Park entrance sits at the south edge, centre.
    this.entrance = { gx: GRID_W >> 1, gz: GRID_H - 1 };
  }

  idx(gx, gz) { return gz * GRID_W + gx; }

  inBounds(gx, gz) { return gx >= 0 && gz >= 0 && gx < GRID_W && gz < GRID_H; }

  /* ---------------- coordinate conversion ---------------- */

  /** Centre of a cell in world space. */
  worldX(gx) { return (gx - GRID_W / 2 + 0.5) * TILE; }
  worldZ(gz) { return (gz - GRID_H / 2 + 0.5) * TILE; }

  gridX(wx) { return Math.floor(wx / TILE + GRID_W / 2); }
  gridZ(wz) { return Math.floor(wz / TILE + GRID_H / 2); }

  /**
   * World-space centre of a footprint anchored at (gx,gz) with size (w,h).
   * Footprints grow towards +x/+z from their anchor cell.
   */
  footprintCenter(gx, gz, w, h) {
    return {
      x: this.worldX(gx) + (w - 1) * TILE * 0.5,
      z: this.worldZ(gz) + (h - 1) * TILE * 0.5,
    };
  }

  /* ---------------- queries ---------------- */

  kindAt(gx, gz) {
    if (!this.inBounds(gx, gz)) return CELL.BLOCKED;
    return this.kind[this.idx(gx, gz)];
  }

  ownerAt(gx, gz) {
    if (!this.inBounds(gx, gz)) return null;
    return this.owner[this.idx(gx, gz)];
  }

  isPath(gx, gz) { return this.kindAt(gx, gz) === CELL.PATH; }

  isFree(gx, gz) { return this.kindAt(gx, gz) === CELL.EMPTY; }

  /**
   * Can a w x h footprint anchored here be built?
   * @param {object} [opts]
   * @param {object} [opts.ignore] Treat cells owned by this entity as free —
   *   used when relocating something onto ground it already partly occupies.
   */
  canPlace(gx, gz, w, h, { allowOverPath = false, ignore = null } = {}) {
    for (let z = gz; z < gz + h; z++) {
      for (let x = gx; x < gx + w; x++) {
        if (!this.inBounds(x, z)) return false;
        const i = this.idx(x, z);
        const k = this.kind[i];
        if (k === CELL.EMPTY) continue;
        if (allowOverPath && k === CELL.PATH) continue;
        if (ignore && this.owner[i] === ignore) continue;
        return false;
      }
    }
    return true;
  }

  /**
   * Why a footprint can't be built here, or null if it can.
   *
   * Paths are treated as clearable ground — building over a walkway simply
   * removes it — so only real structures and the map edge block placement.
   */
  blockingReason(gx, gz, w, h, { ignore = null } = {}) {
    for (let z = gz; z < gz + h; z++) {
      for (let x = gx; x < gx + w; x++) {
        if (!this.inBounds(x, z)) return 'Off the edge of the park';
        const i = this.idx(x, z);
        const k = this.kind[i];
        if (k === CELL.EMPTY || k === CELL.PATH) continue;
        if (ignore && this.owner[i] === ignore) continue;
        if (k === CELL.WATER) return 'Cannot build on water';
        const owner = this.owner[i];
        return owner?.def
          ? `${owner.def.name} is already here`
          : 'Something is already built here';
      }
    }
    return null;
  }

  /** How many path tiles a footprint would pave over. */
  countPathsIn(gx, gz, w, h) {
    let n = 0;
    for (let z = gz; z < gz + h; z++) {
      for (let x = gx; x < gx + w; x++) {
        if (this.isPath(x, z)) n++;
      }
    }
    return n;
  }

  /** Remove every path tile inside a footprint. Returns how many went. */
  clearPathsIn(gx, gz, w, h) {
    let n = 0;
    for (let z = gz; z < gz + h; z++) {
      for (let x = gx; x < gx + w; x++) {
        if (!this.inBounds(x, z)) continue;
        const i = this.idx(x, z);
        if (this.kind[i] !== CELL.PATH) continue;
        this.kind[i] = CELL.EMPTY;
        this.pathStyle[i] = 0;
        this.litter[i] = 0;
        n++;
      }
    }
    return n;
  }

  /** Does any cell adjacent to this footprint carry a path? Rides need one. */
  touchesPath(gx, gz, w, h) {
    for (let x = gx - 1; x <= gx + w; x++) {
      if (this.isPath(x, gz - 1) || this.isPath(x, gz + h)) return true;
    }
    for (let z = gz - 1; z <= gz + h; z++) {
      if (this.isPath(gx - 1, z) || this.isPath(gx + w, z)) return true;
    }
    return false;
  }

  /** First path cell adjacent to a footprint — the entity's queue entry point. */
  adjacentPathCell(gx, gz, w, h) {
    const ring = [];
    for (let x = gx; x < gx + w; x++) { ring.push([x, gz - 1], [x, gz + h]); }
    for (let z = gz; z < gz + h; z++) { ring.push([gx - 1, z], [gx + w, z]); }
    for (const [x, z] of ring) if (this.isPath(x, z)) return { gx: x, gz: z };
    return null;
  }

  /* ---------------- mutation ---------------- */

  claim(gx, gz, w, h, entity, kind = CELL.BUILDING) {
    for (let z = gz; z < gz + h; z++) {
      for (let x = gx; x < gx + w; x++) {
        if (!this.inBounds(x, z)) continue;
        const i = this.idx(x, z);
        this.kind[i] = kind;
        this.owner[i] = entity;
        this.litter[i] = 0;
      }
    }
  }

  release(gx, gz, w, h) {
    for (let z = gz; z < gz + h; z++) {
      for (let x = gx; x < gx + w; x++) {
        if (!this.inBounds(x, z)) continue;
        const i = this.idx(x, z);
        this.kind[i] = CELL.EMPTY;
        this.owner[i] = null;
        this.pathStyle[i] = 0;
      }
    }
  }

  setPath(gx, gz, style) {
    if (!this.inBounds(gx, gz)) return false;
    const i = this.idx(gx, gz);
    if (this.kind[i] !== CELL.EMPTY && this.kind[i] !== CELL.PATH) return false;
    this.kind[i] = CELL.PATH;
    this.pathStyle[i] = style;
    this.owner[i] = null;
    return true;
  }

  clearPath(gx, gz) {
    if (!this.inBounds(gx, gz)) return false;
    const i = this.idx(gx, gz);
    if (this.kind[i] !== CELL.PATH) return false;
    this.kind[i] = CELL.EMPTY;
    this.litter[i] = 0;
    return true;
  }

  /* ---------------- path network bookkeeping ---------------- */

  /** All path cells, as flat indices. */
  pathCells() {
    const out = [];
    for (let i = 0; i < this.kind.length; i++) if (this.kind[i] === CELL.PATH) out.push(i);
    return out;
  }

  /** Neighbour path cells (4-way). */
  pathNeighbors(gx, gz, out = []) {
    out.length = 0;
    if (this.isPath(gx + 1, gz)) out.push([gx + 1, gz]);
    if (this.isPath(gx - 1, gz)) out.push([gx - 1, gz]);
    if (this.isPath(gx, gz + 1)) out.push([gx, gz + 1]);
    if (this.isPath(gx, gz - 1)) out.push([gx, gz - 1]);
    return out;
  }

  /**
   * 4-bit connection mask for path tile shaping:
   * 1 = +x, 2 = -x, 4 = +z, 8 = -z.
   */
  pathMask(gx, gz) {
    let m = 0;
    if (this.isPath(gx + 1, gz)) m |= 1;
    if (this.isPath(gx - 1, gz)) m |= 2;
    if (this.isPath(gx, gz + 1)) m |= 4;
    if (this.isPath(gx, gz - 1)) m |= 8;
    return m;
  }

  /* ---------------- litter ---------------- */

  addLitter(gx, gz, amount) {
    if (!this.inBounds(gx, gz)) return;
    const i = this.idx(gx, gz);
    if (this.kind[i] !== CELL.PATH) return;
    this.litter[i] = Math.min(1, this.litter[i] + amount);
  }

  cleanCell(gx, gz, amount = 1) {
    if (!this.inBounds(gx, gz)) return 0;
    const i = this.idx(gx, gz);
    const before = this.litter[i];
    this.litter[i] = Math.max(0, before - amount);
    return before - this.litter[i];
  }

  /** Mean litter across the path network, 0..1. */
  averageLitter() {
    let sum = 0, n = 0;
    for (let i = 0; i < this.kind.length; i++) {
      if (this.kind[i] === CELL.PATH) { sum += this.litter[i]; n++; }
    }
    return n ? sum / n : 0;
  }

  /** The dirtiest path cell above a threshold — janitor target selection. */
  dirtiestCell(threshold = 0.25, exclude = null) {
    let best = -1, bestVal = threshold;
    for (let i = 0; i < this.kind.length; i++) {
      if (this.kind[i] !== CELL.PATH) continue;
      if (this.litter[i] > bestVal && (!exclude || !exclude.has(i))) {
        bestVal = this.litter[i]; best = i;
      }
    }
    if (best < 0) return null;
    return { gx: best % GRID_W, gz: (best / GRID_W) | 0, amount: bestVal, index: best };
  }

  /** Random path cell — guest wander targets. */
  randomPathCell(rng = Math.random) {
    const cells = this.pathCells();
    if (!cells.length) return null;
    const i = cells[(rng() * cells.length) | 0];
    return { gx: i % GRID_W, gz: (i / GRID_W) | 0 };
  }
}
