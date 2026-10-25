/**
 * Saving and loading.
 *
 * A save is a plain JSON snapshot in localStorage, small enough to also be
 * exported as a file. Only authored state is stored — anything derivable is
 * rebuilt on load:
 *
 *  - Buildings are stored as (catalogue id, cell, rotation) plus the state
 *    they have earned, and reconstructed through the normal placement path.
 *  - Paths are stored as a run-length encoded sweep of the grid, which keeps
 *    a fully paved park down to a few hundred bytes.
 *  - Guests are deliberately *not* saved. They arrive and leave constantly,
 *    their pathfinding state is large, and a reloaded park refills within
 *    seconds anyway. Staff are restored by type and count.
 */
import { CATALOG } from '../data/catalog.js';
import { WEATHERS } from './Park.js';
import { STAFF_TYPES } from './Staff.js';
import { LEDGER_KEYS } from './Economy.js';
import { GRID_W, GRID_H, CELL } from '../world/Grid.js';

export const SAVE_VERSION = 1;
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'];
const KEY = (slot) => `wonderpark.save.${slot}`;

/* ------------------------------------------------------------------ *
 * Path encoding — run-length over the whole grid
 * ------------------------------------------------------------------ */

function encodePaths(grid) {
  const runs = [];
  let value = -1, len = 0;
  for (let i = 0; i < grid.kind.length; i++) {
    // -1 means "not a path"; otherwise the surface style index.
    const v = grid.kind[i] === CELL.PATH ? grid.pathStyle[i] : -1;
    if (v === value) { len++; } else {
      if (len) runs.push(value, len);
      value = v; len = 1;
    }
  }
  if (len) runs.push(value, len);
  return runs;
}

function decodePaths(grid, runs) {
  let i = 0;
  for (let r = 0; r < runs.length; r += 2) {
    const value = runs[r];
    const len = runs[r + 1];
    for (let n = 0; n < len && i < grid.kind.length; n++, i++) {
      if (value < 0) continue;
      grid.kind[i] = CELL.PATH;
      grid.pathStyle[i] = value;
      grid.owner[i] = null;
    }
  }
}

/** Litter is sparse, so only dirty cells are worth storing. */
function encodeLitter(grid) {
  const out = [];
  for (let i = 0; i < grid.litter.length; i++) {
    if (grid.litter[i] > 0.02) out.push(i, Math.round(grid.litter[i] * 100));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Serialise
 * ------------------------------------------------------------------ */

export function serialize(game) {
  const park = game.park;
  const e = park.economy;

  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    meta: {
      day: park.day,
      cash: Math.round(e.cash),
      rating: Math.round(park.rating),
      guests: park.guests.count,
      rides: park.rides.length,
      shops: park.shops.length,
    },
    park: {
      day: park.day,
      dayFraction: park.dayFraction,
      elapsed: park.elapsed,
      rating: park.rating,
      entryFee: park.entryFee,
      autoRepair: park.autoRepair,
      unlockAll: park.unlockAll,
      weather: park.weather.id,
      weatherTimer: park.weatherTimer,
      marketing: park.marketing,
      marketingPower: park.marketingPower,
      timeScale: park.timeScale,
    },
    economy: {
      cash: e.cash,
      total: { ...e.total },
      today: { ...e.today },
      history: e.history.slice(-60),
      dayIncome: e.dayIncome,
      dayExpense: e.dayExpense,
    },
    grid: {
      paths: encodePaths(park.grid),
      litter: encodeLitter(park.grid),
    },
    attractions: park.attractions.map((a) => ({
      id: a.def.id,
      gx: a.gx, gz: a.gz,
      rot: +a.rotation.toFixed(4),
      level: a.level,
      price: a.price,
      open: a.open,
      condition: +a.condition.toFixed(4),
      broken: a.broken,
      income: Math.round(a.totalIncome),
      guests: a.totalGuests,
      popularity: +a.popularity.toFixed(3),
    })),
    staff: park.staff.staff.map((s) => s.type),
    objectives: park.objectives.map((o) => ({ id: o.id, done: o.done, value: o.value })),
    awards: park.awards.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji, cash: a.cash })),
    stats: {
      arrived: park.guests.stats.arrived,
      left: park.guests.stats.left,
      happyLeft: park.guests.stats.happyLeft,
      angryLeft: park.guests.stats.angryLeft,
      spent: park.guests.stats.spent,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Restore
 * ------------------------------------------------------------------ */

export function applySave(game, data) {
  if (!data || typeof data !== 'object') throw new Error('Save file is empty or malformed.');
  if (data.version !== SAVE_VERSION) {
    throw new Error(`Save is version ${data.version ?? '?'}, this build reads version ${SAVE_VERSION}.`);
  }

  const park = game.park;
  const grid = park.grid;

  // Suppresses objective payouts while the park is being rebuilt.
  park.loading = true;
  let result;
  try {
    result = restore(game, park, grid, data);
  } finally {
    park.loading = false;
  }
  park.checkObjectives();
  return result;
}

function restore(game, park, grid, data) {
  // --- tear the current park down ---
  game.cancelMove?.();
  game.select(null);
  game.setTool('select');
  park.guests.clear();
  for (const a of [...park.attractions]) {
    grid.release(a.gx, a.gz, a.w, a.h);
    a.dispose(game.engine.scene);
  }
  park.attractions.length = 0;
  park.rides.length = 0;
  park.shops.length = 0;
  park.scenery.length = 0;
  park.bins.length = 0;
  park.lamps.length = 0;
  park.staff.staff.length = 0;

  grid.kind.fill(CELL.EMPTY);
  grid.pathStyle.fill(0);
  grid.litter.fill(0);
  grid.owner.fill(null);

  // --- park-level fields (before placement: unlockAll gates it) ---
  const p = data.park || {};
  park.day = p.day ?? 1;
  park.dayFraction = p.dayFraction ?? 0.34;
  park.elapsed = p.elapsed ?? 0;
  park.rating = p.rating ?? 60;
  park._ratingTarget = park.rating;
  park.entryFee = p.entryFee ?? 8;
  park.autoRepair = !!p.autoRepair;
  park.unlockAll = !!p.unlockAll;
  park.weather = WEATHERS[p.weather] || WEATHERS.sunny;
  park.weatherTimer = p.weatherTimer ?? 180;
  park.marketing = p.marketing ?? 0;
  park.marketingPower = p.marketingPower ?? 0;
  park.timeScale = p.timeScale ?? 1;
  game.fx.weather.set(park.weather.mode);

  // --- economy ---
  const ec = data.economy || {};
  park.economy.cash = ec.cash ?? 14000;
  for (const k of LEDGER_KEYS) {
    park.economy.total[k] = ec.total?.[k] ?? 0;
    park.economy.today[k] = ec.today?.[k] ?? 0;
  }
  park.economy.history = Array.isArray(ec.history) ? ec.history.slice(-60) : [];
  park.economy.dayIncome = ec.dayIncome ?? 0;
  park.economy.dayExpense = ec.dayExpense ?? 0;

  // --- paths ---
  if (data.grid?.paths) decodePaths(grid, data.grid.paths);
  const lit = data.grid?.litter || [];
  for (let i = 0; i < lit.length; i += 2) {
    const cell = lit[i];
    if (cell >= 0 && cell < grid.litter.length) grid.litter[cell] = lit[i + 1] / 100;
  }
  park.paths.markDirty();
  park.pf.invalidate();

  // --- buildings ---
  const skipped = [];
  for (const rec of data.attractions || []) {
    if (!CATALOG[rec.id]) { skipped.push(rec.id); continue; }
    const res = park.place(rec.id, rec.gx, rec.gz, rec.rot || 0, { free: true });
    if (!res.ok) { skipped.push(rec.id); continue; }
    const a = res.attraction;
    // Re-apply earned state. Upgrades go through the real path so the tier
    // decoration is rebuilt too.
    const targetLevel = Math.max(1, rec.level || 1);
    while (a.level < targetLevel) a.upgrade();
    a.price = rec.price ?? a.price;
    a.open = rec.open !== false;
    a.condition = rec.condition ?? 1;
    a.broken = !!rec.broken;
    if (a.broken) a.state = 'broken';
    a.totalIncome = rec.income || 0;
    a.totalGuests = rec.guests || 0;
    a.popularity = rec.popularity ?? 0.5;
  }

  // --- staff ---
  for (const type of data.staff || []) {
    if (STAFF_TYPES[type]) park.staff.hire(type);
  }

  // --- progression ---
  for (const rec of data.objectives || []) {
    const o = park.objectives.find((x) => x.id === rec.id);
    if (o) { o.done = !!rec.done; o.value = rec.value || 0; }
  }
  park.completedObjectives = park.objectives.filter((o) => o.done).length;
  park.awards = (data.awards || []).map((a) => ({ ...a, test: () => false }));

  const st = data.stats || {};
  Object.assign(park.guests.stats, {
    arrived: st.arrived || 0,
    left: st.left || 0,
    happyLeft: st.happyLeft || 0,
    angryLeft: st.angryLeft || 0,
    spent: st.spent || 0,
    avgHappiness: 0.75,
  });

  park._beautyDirty = true;
  park._recomputeConnections();
  // Re-evaluated by the caller once `loading` clears, with the saved
  // completion flags already in place.

  return { skipped };
}

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */

function storageAvailable() {
  try {
    const k = '__wp_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export const canStore = storageAvailable();

export function saveTo(slot, game, name) {
  if (!canStore) return { ok: false, error: 'This browser is blocking local storage.' };
  try {
    const data = serialize(game);
    data.name = name || defaultName(game);
    localStorage.setItem(KEY(slot), JSON.stringify(data));
    return { ok: true, data };
  } catch (err) {
    // Most likely the quota; everything else is a genuine bug.
    return { ok: false, error: err.name === 'QuotaExceededError'
      ? 'Out of local storage space — delete a save and try again.'
      : err.message };
  }
}

export function readSlot(slot) {
  if (!canStore) return null;
  try {
    const raw = localStorage.getItem(KEY(slot));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadFrom(slot, game) {
  const data = readSlot(slot);
  if (!data) return { ok: false, error: 'That slot is empty.' };
  try {
    const res = applySave(game, data);
    return { ok: true, data, ...res };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function deleteSave(slot) {
  if (!canStore) return;
  try { localStorage.removeItem(KEY(slot)); } catch { /* nothing to do */ }
}

/** Slot summaries for the save/load screen. */
export function listSaves() {
  return SLOTS.map((slot) => {
    const d = readSlot(slot);
    return {
      slot,
      empty: !d,
      name: d?.name || '',
      savedAt: d?.savedAt || 0,
      meta: d?.meta || null,
      stale: !!d && d.version !== SAVE_VERSION,
    };
  });
}

export function defaultName(game) {
  return `${game.park.name} — day ${game.park.day}`;
}

/* ------------------------------------------------------------------ *
 * File export / import
 * ------------------------------------------------------------------ */

export function exportFile(game) {
  const data = serialize(game);
  data.name = defaultName(game);
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wonderpark-day${game.park.day}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function importFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error('No file chosen.')); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(JSON.parse(String(reader.result))); }
        catch { reject(new Error('That file is not a valid WonderPark save.')); }
      };
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.readAsText(file);
    };
    input.click();
  });
}
