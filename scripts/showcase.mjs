/**
 * Visual QA: clears the park, places a handful of attractions in a row and
 * photographs them, so every ride can be eyeballed at a readable size.
 * Also captures a night pass to check the lighting.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

mkdirSync('scripts/shots', { recursive: true });

const GROUPS = [
  ['a-gentle', ['carousel', 'teacups', 'balloonRace']],
  ['b-swing', ['waveSwinger', 'pirateShip', 'enterprise']],
  ['c-big', ['ferrisWheel', 'dropTower', 'observationTower']],
  ['d-track', ['rollerCoaster', 'logFlume']],
  ['e-track2', ['goKarts', 'kiddieTrain']],
  ['f-themed', ['hauntedHouse', 'funhouse', 'helterSkelter']],
  ['g-tent', ['circusTent', 'bumperCars']],
  ['n-wild1', ['octopus', 'ufoAbduction']],
  ['o-wild2', ['giantFrisbee', 'magicCarpet', 'reverseBungee']],
  ['h-shops', ['burgerStand', 'pizzaPlace', 'iceCream', 'drinksStand', 'popcornCart']],
  ['i-shops2', ['coffeeHut', 'candyShop', 'souvenirShop', 'balloonCart', 'hatShop']],
  ['j-facil', ['restroom', 'firstAid', 'infoKiosk', 'atm']],
  ['k-scenery', ['oakTree', 'pineTree', 'palmTree', 'cherryTree', 'statue', 'gazebo', 'clockTower']],
  ['l-garden', ['flowerBed', 'gardenPlanter', 'hedge', 'topiary', 'rockGarden', 'fountain', 'pond']],
  ['m-street', ['bench', 'lampPost', 'trashBin', 'bannerArch', 'fireworkLauncher']],
];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 620 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

await page.goto('http://localhost:5173', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('hidden'),
  null, { timeout: 90000 });
await page.waitForTimeout(800);

// Hide the interface so screenshots show only the park.
await page.addStyleTag({ content: '#ui{display:none!important}' });

for (const [name, ids] of GROUPS) {
  const span = await page.evaluate(({ ids }) => {
    const g = window.__park, park = g.park;
    for (const a of [...park.attractions]) park.remove(a);
    for (let z = 0; z < 72; z++) for (let x = 0; x < 72; x++) park.grid.clearPath(x, z);
    park.economy.cash = 5_000_000;
    park.rating = 1000;

    // A path strip in front of the row so rides count as connected.
    let cursor = 6;
    const placed = [];
    for (const id of ids) {
      const d = park.grid && window.__CAT[id];
      placed.push({ id, gx: cursor, gz: 34, w: d.w, h: d.h });
      cursor += d.w + 2;
    }
    const right = cursor;
    for (let x = 4; x < right + 2; x++) {
      park.grid.setPath(x, 32, 0);
      park.grid.setPath(x, 33, 0);
    }
    park.paths.markDirty();
    park.pf.invalidate();

    for (const p of placed) park.place(p.id, p.gx, p.gz, 0);

    // Open everything and fill it with riders so the animation is visible.
    for (const a of park.attractions) {
      a.open = true;
      a.riders = a.capacity || 2;
      a.power = 1;
      a.state = 'running';
      a.cycleTimer = 999;
    }
    const left = park.grid.worldX(6);
    const rightW = park.grid.worldX(right);
    // Centre on the row of rides themselves (gz 34), not the plot origin.
    let maxH = 0;
    for (const p of placed) maxH = Math.max(maxH, p.h);
    return {
      cx: (left + rightW) / 2,
      cz: park.grid.worldZ(34) + maxH,
      width: rightW - left,
    };
  }, { ids });

  await page.evaluate(({ cx, cz, width }) => {
    const g = window.__park;
    g.rig.targetFocus.set(cx, 0, cz);
    g.rig.focus.set(cx, 0, cz);
    g.rig.targetDistance = g.rig.distance = Math.max(26, width * 0.72);
    g.rig.targetAzimuth = g.rig.azimuth = Math.PI;
    g.rig.targetPolar = g.rig.polar = 1.04;
  }, span);

  // Let the rides spin up and the reflection probe re-bake.
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `scripts/shots/ride-${name}.png` });
  console.log('shot', name);
}

// Night pass on a mixed park.
await page.evaluate(() => {
  const g = window.__park, park = g.park;
  for (const a of [...park.attractions]) park.remove(a);
  for (let x = 8; x < 64; x++) { park.grid.setPath(x, 32, 0); park.grid.setPath(x, 33, 0); }
  park.paths.markDirty(); park.pf.invalidate();
  park.economy.cash = 5_000_000; park.rating = 1000;
  const ids = ['carousel', 'ferrisWheel', 'waveSwinger', 'hauntedHouse', 'circusTent'];
  let x = 9;
  for (const id of ids) { park.place(id, x, 34, 0); x += window.__CAT[id].w + 1; }
  for (let i = 0; i < 14; i++) park.place('lampPost', 9 + i * 3, 31, 0);
  park.place('fireworkLauncher', 30, 26, 0);
  for (const a of park.attractions) { a.open = true; a.riders = a.capacity || 2; a.power = 1; }
  park.dayFraction = 0.02;
  g.rig.targetFocus.set(0, 0, 0); g.rig.focus.set(0, 0, 0);
  g.rig.targetDistance = g.rig.distance = 68;
  g.rig.targetPolar = g.rig.polar = 1.0;
});
await page.waitForTimeout(3000);
await page.evaluate(() => {
  for (let i = 0; i < 4; i++) window.__park.fx.firework({ x: (i - 2) * 14, y: 3, z: -6 });
});
await page.waitForTimeout(1400);
await page.screenshot({ path: 'scripts/shots/ride-z-night.png' });
console.log('shot night');

await browser.close();
