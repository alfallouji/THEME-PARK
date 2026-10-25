/**
 * A* over the path-tile network, with an LRU route cache.
 *
 * Hundreds of guests re-plan constantly, so the cache matters more than the
 * search: most guests are walking between the same handful of popular
 * destinations, and a cache hit costs one map lookup.
 */
import { GRID_W, GRID_H, CELL } from '../world/Grid.js';

const SIZE = GRID_W * GRID_H;

/** Minimal binary heap keyed by f-score. */
class Heap {
  constructor() { this.items = []; this.scores = []; }
  get size() { return this.items.length; }
  clear() { this.items.length = 0; this.scores.length = 0; }
  push(item, score) {
    this.items.push(item); this.scores.push(score);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.scores[p] <= this.scores[i]) break;
      this._swap(p, i); i = p;
    }
  }
  pop() {
    const top = this.items[0];
    const lastItem = this.items.pop(), lastScore = this.scores.pop();
    if (this.items.length) {
      this.items[0] = lastItem; this.scores[0] = lastScore;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.items.length && this.scores[l] < this.scores[m]) m = l;
        if (r < this.items.length && this.scores[r] < this.scores[m]) m = r;
        if (m === i) break;
        this._swap(m, i); i = m;
      }
    }
    return top;
  }
  _swap(a, b) {
    const ti = this.items[a]; this.items[a] = this.items[b]; this.items[b] = ti;
    const ts = this.scores[a]; this.scores[a] = this.scores[b]; this.scores[b] = ts;
  }
}

export class Pathfinder {
  constructor(grid) {
    this.grid = grid;
    this.gScore = new Float32Array(SIZE);
    this.came = new Int32Array(SIZE);
    this.stamp = new Int32Array(SIZE);
    this.closed = new Int32Array(SIZE);
    this.run = 0;
    this.heap = new Heap();

    /** @type {Map<number, number[]|null>} */
    this.cache = new Map();
    this.cacheLimit = 900;
    this.version = 0;
  }

  /** Called whenever the path network changes — invalidates every route. */
  invalidate() {
    this.cache.clear();
    this.version++;
  }

  /**
   * @returns {number[]|null} array of cell indices from start to goal
   * (inclusive), or null if unreachable.
   */
  find(sx, sz, gx, gz) {
    const g = this.grid;
    if (!g.isPath(sx, sz) || !g.isPath(gx, gz)) return null;
    const start = g.idx(sx, sz);
    const goal = g.idx(gx, gz);
    if (start === goal) return [start];

    const key = start * SIZE + goal;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;

    const route = this._search(start, goal);
    if (this.cache.size >= this.cacheLimit) {
      // Cheap eviction: drop the oldest quarter of the insertion order.
      let n = this.cacheLimit >> 2;
      for (const k of this.cache.keys()) {
        this.cache.delete(k);
        if (--n <= 0) break;
      }
    }
    this.cache.set(key, route);
    return route;
  }

  _search(start, goal) {
    const g = this.grid;
    const kind = g.kind;
    const litter = g.litter;
    this.run++;
    const run = this.run;
    const { gScore, came, stamp, closed, heap } = this;
    heap.clear();

    const gxGoal = goal % GRID_W, gzGoal = (goal / GRID_W) | 0;
    const h = (i) => {
      const x = i % GRID_W, z = (i / GRID_W) | 0;
      return Math.abs(x - gxGoal) + Math.abs(z - gzGoal);
    };

    gScore[start] = 0;
    came[start] = -1;
    stamp[start] = run;
    heap.push(start, h(start));

    let guard = 0;
    while (heap.size) {
      if (++guard > 24000) break; // safety valve on pathological maps
      const cur = heap.pop();
      if (closed[cur] === run) continue;
      closed[cur] = run;
      if (cur === goal) return this._rebuild(cur, run);

      const cx = cur % GRID_W, cz = (cur / GRID_W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const nz = cz + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || nz < 0 || nx >= GRID_W || nz >= GRID_H) continue;
        const ni = nz * GRID_W + nx;
        if (kind[ni] !== CELL.PATH) continue;
        if (closed[ni] === run) continue;
        // Guests mildly prefer clean paths, which spreads foot traffic around.
        const step = 1 + litter[ni] * 0.35;
        const tentative = gScore[cur] + step;
        if (stamp[ni] !== run || tentative < gScore[ni]) {
          stamp[ni] = run;
          gScore[ni] = tentative;
          came[ni] = cur;
          heap.push(ni, tentative + h(ni));
        }
      }
    }
    return null;
  }

  _rebuild(goal, run) {
    const out = [];
    let cur = goal;
    let guard = 0;
    while (cur !== -1 && guard++ < SIZE) {
      out.push(cur);
      cur = this.came[cur];
    }
    out.reverse();
    return out;
  }

  /** Is there any route at all from the entrance to this cell? */
  reachableFromEntrance(gx, gz) {
    const e = this.grid.entrance;
    return !!this.find(e.gx, e.gz, gx, gz);
  }
}
