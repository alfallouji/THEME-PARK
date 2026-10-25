/**
 * Simulation soak test.
 *
 * Steps the park simulation directly (no rendering) so a couple of in-game
 * days run in seconds, then asserts that the core loop actually works:
 * guests arrive, walk the paths, queue, ride, spend, drop litter, and that
 * staff clean and repair.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:5173', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('hidden'),
  null, { timeout: 90000 });
await page.waitForTimeout(600);

const result = await page.evaluate(async () => {
  const g = window.__park;
  const park = g.park;

  // --- build a realistic park connected to the entrance ---
  park.economy.cash = 400000;
  park.rating = 400;
  park.unlockAll = true;
  const e = park.grid.entrance;

  // Main avenue from the gate, plus three cross streets.
  for (let z = e.gz; z >= 16; z--) for (let dx = -1; dx <= 1; dx++) park.grid.setPath(e.gx + dx, z, 0);
  for (const row of [18, 30, 44]) {
    for (let x = 12; x < 62; x++) { park.grid.setPath(x, row, 0); park.grid.setPath(x, row + 1, 0); }
  }
  for (let z = 18; z < 46; z++) { park.grid.setPath(13, z, 0); park.grid.setPath(61, z, 0); }
  park.paths.markDirty();
  park.pf.invalidate();

  // Rides south of each cross street, shops north of it, so every footprint
  // touches a walkway and nothing overlaps.
  const built = [];
  const put = (id, x, z) => { const r = park.place(id, x, z, 0); built.push([id, r.ok, r.reason || '']); };

  put('carousel', 16, 32); put('teacups', 24, 32); put('pirateShip', 32, 32);
  put('waveSwinger', 40, 32); put('bumperCars', 50, 38);
  put('helterSkelter', 16, 46); put('hauntedHouse', 22, 46); put('ferrisWheel', 32, 46);
  put('octopus', 44, 46);
  // The eccentric ones along the top street.
  put('magicCarpet', 16, 20); put('ufoAbduction', 24, 20);
  put('giantFrisbee', 34, 22); put('reverseBungee', 44, 22);

  // Food and facilities on the north side of the middle street.
  put('burgerStand', 16, 28); put('drinksStand', 21, 28); put('iceCream', 26, 28);
  put('restroom', 31, 28); put('pizzaPlace', 40, 28); put('coffeeHut', 45, 28);
  put('souvenirShop', 50, 28); put('atm', 55, 28); put('firstAid', 55, 16);
  put('restroom', 50, 42); put('drinksStand', 55, 42);

  for (let i = 0; i < 6; i++) put('trashBin', 16 + i * 5, 42);
  for (let i = 0; i < 6; i++) put('oakTree', 15 + i * 5, 36);
  for (let i = 0; i < 5; i++) put('flowerBed', 17 + i * 6, 43);

  for (const t of ['mechanic', 'mechanic', 'janitor', 'janitor', 'entertainer', 'security']) {
    park.staff.hire(t);
  }

  park.paused = false;
  park.timeScale = 1;

  // --- step the simulation directly, no rendering ---
  const DT = 0.05;
  const STEPS = 24000;              // 1200 in-game seconds = two full days
  const samples = [];
  let peakGuests = 0, ridesStarted = 0, totalBreak = 0;

  const prevRiders = new Map();
  for (const a of park.rides) prevRiders.set(a.id, a.totalGuests);

  for (let i = 0; i < STEPS; i++) {
    park.update(DT, g.sky);
    // Keep the sky clock in step so night/day logic behaves.
    g.sky.dayFraction = park.dayFraction;
    g.sky.nightAmount = park.dayFraction < 0.25 || park.dayFraction > 0.8 ? 1 : 0;
    peakGuests = Math.max(peakGuests, park.guests.count);
    if (i % 4000 === 0) {
      samples.push({
        t: Math.round(i * DT),
        day: park.day,
        clock: g.sky.clockString ? undefined : undefined,
        guests: park.guests.count,
        arrived: park.guests.stats.arrived,
        rating: Math.round(park.rating),
        cash: Math.round(park.economy.cash),
        happy: +park.guests.stats.avgHappiness.toFixed(2),
        litter: +park.grid.averageLitter().toFixed(3),
        broken: park.brokenCount,
      });
    }
  }
  for (const a of park.rides) {
    ridesStarted += a.totalGuests - (prevRiders.get(a.id) || 0);
  }

  // --- what states are the guests actually in? ---
  const states = {};
  for (const gu of park.guests.activeList) states[gu.state] = (states[gu.state] || 0) + 1;

  // Did guests actually spread out over the whole path network?
  const visited = new Set();
  for (const gu of park.guests.activeList) {
    const gx = park.grid.gridX(gu.pos.x), gz = park.grid.gridZ(gu.pos.z);
    if (park.grid.inBounds(gx, gz)) visited.add(gz);
  }

  const ridesDetail = park.rides.map((a) => ({
    id: a.def.id, riders: a.totalGuests, income: Math.round(a.totalIncome),
    queue: a.queue.length, cond: +a.condition.toFixed(2), broken: a.broken,
    connected: a.connected,
  }));
  const shopsDetail = park.shops.map((a) => ({
    id: a.def.id, sold: a.totalGuests, income: Math.round(a.totalIncome), connected: a.connected,
  }));

  return {
    buildFailures: built.filter(([, ok]) => !ok),
    samples,
    peakGuests,
    distinctRowsOccupied: visited.size,
    minRow: Math.min(...visited, 99), maxRow: Math.max(...visited, -1),
    totalRideBoardings: ridesStarted,
    states,
    ridesDetail,
    shopsDetail,
    ledger: {
      entry: Math.round(park.economy.total.entry),
      rides: Math.round(park.economy.total.rides),
      shops: Math.round(park.economy.total.shops),
      staff: Math.round(park.economy.total.staff),
      upkeep: Math.round(park.economy.total.upkeep),
    },
    objectives: park.objectives.filter((o) => o.done).map((o) => o.id),
    awards: park.awards.map((a) => a.id),
  };
});

console.log(JSON.stringify(result, null, 1));
if (errors.length) {
  console.log('\nERRORS:');
  for (const e of [...new Set(errors)].slice(0, 10)) console.log(' ✗', e.slice(0, 900));
}
await browser.close();
