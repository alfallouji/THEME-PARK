/**
 * Headless smoke test: boots the game in Chromium (SwiftShader WebGL), drives
 * a scripted play session, and fails on any console error or uncaught
 * exception. Run with: node scripts/smoke.mjs [--url http://localhost:4173]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const urlArg = process.argv.indexOf('--url');
const URL = urlArg >= 0 ? process.argv[urlArg + 1] : 'http://localhost:4173';
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const errors = [];
const warnings = [];

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });

page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error') errors.push(t);
  else if (m.type() === 'warning') warnings.push(t);
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + (e.stack || e.message)));
page.on('requestfailed', (r) => {
  const u = r.url();
  if (!u.startsWith('data:') && !u.includes('fonts.g')) {
    errors.push(`REQFAIL ${u} ${r.failure()?.errorText}`);
  }
});

function log(...a) { console.log(...a); }

try {
  log(`→ opening ${URL}`);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });

  log('→ waiting for boot');
  await page.waitForFunction(
    () => document.getElementById('boot')?.classList.contains('hidden'),
    null, { timeout: 90000 },
  );
  log('✓ booted');

  // Let a few frames run.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/01-start.png` });

  const ready = await page.evaluate(() => !!window.__park);
  if (!ready) throw new Error('window.__park was never set');

  // ---- place one of every catalogue entry on a scratch grid ----
  log('→ placing every catalogue item');
  const placeReport = await page.evaluate(async () => {
    const g = window.__park;
    const CATALOG = window.__CAT;
    const park = g.park;
    park.economy.cash = 100000000;
    park.rating = 1000;
    // Clear the starter plaza so the packing grid below is guaranteed empty.
    for (const a of [...park.attractions]) park.remove(a);
    for (let gz = 0; gz < 72; gz++) for (let gx = 0; gx < 72; gx++) park.grid.clearPath(gx, gz);
    park.paths.markDirty();
    park.pf.invalidate();
    const results = [];
    let gx = 2, gz = 2, rowH = 0;
    for (const def of Object.values(CATALOG)) {
      if (gx + def.w > 70) { gx = 2; gz += rowH + 1; rowH = 0; }
      rowH = Math.max(rowH, def.h);
      let r;
      try {
        r = park.place(def.id, gx, gz, 0);
      } catch (e) {
        r = { ok: false, reason: 'THREW: ' + (e.stack || e.message) };
      }
      results.push([def.id, r.ok, r.reason || '']);
      gx += def.w + 1;
    }
    return results;
  });
  const failed = placeReport.filter(([, ok]) => !ok);
  log(`  placed ${placeReport.length - failed.length}/${placeReport.length}`);
  for (const [id, , reason] of failed) log(`  ✗ ${id}: ${reason}`);
  if (failed.length) {
    errors.push('Placement failed for: ' + failed.map(([id, , r]) => `${id} (${r})`).join(', '));
  }

  // ---- run every ride's animation across its full cycle ----
  log('→ animating all attractions (simulated 60s)');
  const animErr = await page.evaluate(() => {
    const g = window.__park;
    const ctx = g.park.attractionCtx;
    try {
      for (let step = 0; step < 1200; step++) {
        ctx.time += 0.05;
        ctx.night = step > 600 ? 0.9 : 0;
        for (const a of g.park.attractions) {
          a.open = true;
          a.riders = a.capacity || 2;
          a.power = Math.min(1, step / 60);
          a.model.update?.(0.05, ctx.time, {
            power: a.power, running: true, riders: a.riders,
            night: ctx.night, dayFraction: 0.5, open: true,
          });
        }
      }
    } catch (e) { return e.stack || e.message; }
    return null;
  });
  if (animErr) errors.push('ANIMATION: ' + animErr);
  else log('✓ all ride animations ran clean');

  await page.screenshot({ path: `${SHOTS}/02-all-items.png` });

  // ---- reset to a realistic park and run the full sim ----
  log('→ building a playable park and running the simulation');
  await page.evaluate(() => {
    const g = window.__park;
    const park = g.park;
    for (const a of [...park.attractions]) park.remove(a);
    park.economy.cash = 200000;
    park.rating = 1000;

    // Grid of paths across the middle of the plot.
    for (let z = 20; z < 64; z++) for (let dx = -1; dx <= 1; dx++) park.grid.setPath(36 + dx, z, 0);
    for (let x = 14; x < 60; x++) { park.grid.setPath(x, 30, 1); park.grid.setPath(x, 31, 1); }
    for (let x = 14; x < 60; x++) { park.grid.setPath(x, 46, 0); park.grid.setPath(x, 47, 0); }
    park.paths.markDirty();
    park.pf.invalidate();

    const put = (id, x, z) => park.place(id, x, z, 0);
    put('carousel', 18, 32); put('teacups', 26, 32); put('pirateShip', 42, 32);
    put('ferrisWheel', 50, 32); put('rollerCoaster', 18, 48); put('logFlume', 28, 48);
    put('dropTower', 40, 48); put('hauntedHouse', 46, 48);
    put('burgerStand', 32, 28); put('drinksStand', 38, 28); put('restroom', 44, 28);
    put('iceCream', 24, 28); put('souvenirShop', 28, 44); put('atm', 34, 44);
    put('firstAid', 38, 44);
    for (let i = 0; i < 10; i++) {
      put('oakTree', 20 + i * 3, 34);
      put('flowerBed', 21 + i * 3, 44);
      put('trashBin', 22 + i * 3, 28);
      put('lampPost', 34, 22 + i * 3);
    }
    put('fountain', 34, 36);

    for (const t of ['mechanic', 'mechanic', 'janitor', 'janitor', 'entertainer', 'security']) {
      park.staff.hire(t);
    }
    park.timeScale = 4;
    park.paused = false;
    g.rig.goTo({ x: 0, z: 10 }, 90);
  });

  // Run real frames so guests spawn and walk.
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(2000);
    const s = await page.evaluate(() => {
      const p = window.__park.park;
      return {
        guests: p.guests.count, rating: Math.round(p.rating),
        cash: Math.round(p.economy.cash), day: p.day,
        broken: p.brokenCount, fps: Math.round(window.__park.fps),
        litter: +p.grid.averageLitter().toFixed(3),
        happy: +p.guests.stats.avgHappiness.toFixed(2),
      };
    });
    log(`  t=${(i + 1) * 2}s`, JSON.stringify(s));
  }
  await page.screenshot({ path: `${SHOTS}/03-running.png` });

  // ---- exercise the UI ----
  log('→ exercising UI panels');
  for (const [key, shot] of [['KeyO', 'objectives'], ['KeyG', 'finance'], ['KeyT', 'staff'], ['KeyP', 'park'], ['KeyH', 'help']]) {
    await page.keyboard.press(key === 'KeyG' ? 'g' : key.replace('Key', '').toLowerCase());
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/ui-${shot}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  // ---- tools: build ghost, path painting, demolish, selection, ride cam ----
  log('→ exercising tools');
  const toolErr = await page.evaluate(async () => {
    const g = window.__park;
    try {
      const CATALOG = window.__CAT;
      // Build a ghost for every definition (exercises every builder twice).
      for (const id of Object.keys(CATALOG)) {
        g.setTool('build', { defId: id });
        g._updateCursor();
      }
      g.setTool('path', { pathStyle: 2 });
      g.setTool('erasePath');
      g.setTool('demolish');
      g.setTool('select');

      // Select each kind of thing.
      const ride = g.park.rides[0];
      g.select(ride);
      g.upgrade(ride); g.upgrade(ride); g.upgrade(ride);
      g.repair(ride);
      g.enterRideCam(ride);
      if (g.park.guests.activeList[0]) g.select(g.park.guests.activeList[0]);
      if (g.park.staff.staff[0]) g.select(g.park.staff.staff[0]);
      return null;
    } catch (e) { return e.stack || e.message; }
  });
  if (toolErr) errors.push('TOOLS: ' + toolErr);

  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/04-ridecam.png` });
  await page.keyboard.press('Escape');

  // ---- move / rotate ----
  log('→ relocating and rotating');
  const moveErr = await page.evaluate(() => {
    const g = window.__park, park = g.park;
    const fail = [];
    try {
      for (const a of [...park.attractions]) park.remove(a);
      for (let z = 0; z < 72; z++) for (let x = 0; x < 72; x++) park.grid.clearPath(x, z);
      for (let x = 10; x < 64; x++) { park.grid.setPath(x, 30, 0); park.grid.setPath(x, 31, 0); }
      park.paths.markDirty(); park.pf.invalidate();
      park.economy.cash = 500000;
      park.unlockAll = true;

      // ferrisWheel is 8x6 — a non-square footprint, so rotation is observable.
      const r = park.place('ferrisWheel', 20, 32, 0);
      if (!r.ok) return 'could not place test ride: ' + r.reason;
      const a = r.attraction;
      if (a.w !== 8 || a.h !== 6) fail.push(`initial footprint ${a.w}x${a.h}, expected 8x6`);
      a.level = 3; a.condition = 0.5; a.totalIncome = 1234; a.totalGuests = 77;

      // Occupancy must actually be claimed.
      if (park.grid.ownerAt(27, 37) !== a) fail.push('grid not claimed at far corner');

      // --- move it ---
      const before = park.economy.cash;
      const expected = a.moveCost;
      const mv = park.relocate(a, 40, 32, 0);
      if (!mv.ok) fail.push('relocate refused: ' + mv.reason);
      if (Math.round(before - park.economy.cash) !== expected) {
        fail.push(`charged ${Math.round(before - park.economy.cash)}, expected ${expected}`);
      }
      if (a.gx !== 40) fail.push('anchor did not update');
      if (park.grid.ownerAt(21, 33)) fail.push('old tiles were not released');
      if (park.grid.ownerAt(41, 33) !== a) fail.push('new tiles were not claimed');
      if (a.level !== 3 || a.totalIncome !== 1234 || a.totalGuests !== 77) {
        fail.push('state was not preserved across the move');
      }
      if (Math.abs(a.condition - 0.5) > 1e-6) fail.push('condition was not preserved');

      // --- rotate a quarter turn: footprint must swap ---
      const rot = park.relocate(a, 40, 32, Math.PI / 2);
      if (!rot.ok) fail.push('rotate refused: ' + rot.reason);
      if (a.w !== 6 || a.h !== 8) fail.push(`rotated footprint ${a.w}x${a.h}, expected 6x8`);
      // 6 wide from x=40 means 40..45 claimed, 46/47 released.
      if (park.grid.ownerAt(45, 33) !== a) fail.push('rotated width under-claimed at x=45');
      if (park.grid.ownerAt(46, 33)) fail.push('tiles beyond the rotated width still claimed');
      if (park.grid.ownerAt(47, 33)) fail.push('tiles beyond the rotated width still claimed (47)');
      // 8 deep from z=32 means 32..39 claimed.
      if (park.grid.ownerAt(41, 39) !== a) fail.push('rotated depth not claimed');

      // --- a no-op move is free ---
      const c0 = park.economy.cash;
      const same = park.relocate(a, 40, 32, Math.PI / 2);
      if (!same.ok || !same.unchanged) fail.push('no-op move was not detected');
      if (park.economy.cash !== c0) fail.push('no-op move charged money');

      // --- overlapping another building must be refused ---
      const other = park.place('carousel', 10, 32, 0);
      if (other.ok) {
        const bad = park.canRelocate(a, 11, 32, 0);
        if (bad.ok) fail.push('relocate onto another building was allowed');
      }

      // --- cannot afford ---
      park.economy.cash = 1;
      const poor = park.canRelocate(a, 50, 32, 0);
      if (poor.ok) fail.push('relocate allowed with no money');
      park.economy.cash = 500000;

      // --- the interactive path: beginMove / confirmMove ---
      g.select(a);
      g.beginMove(a);
      if (g.tool.mode !== 'move') fail.push('beginMove did not enter move mode');
      if (a.root.visible) fail.push('original stayed visible while being carried');
      g.rotateTool();
      g.cursorCell = { gx: 50, gz: 34 };
      g.confirmMove();
      if (g.moveTarget) fail.push('moveTarget not cleared after confirm');
      if (!a.root.visible) fail.push('original not restored after confirm');
      if (a.gx !== 50 || a.gz !== 34) fail.push('confirmMove did not move the ride');

      // --- cancelling restores everything ---
      const gxBefore = a.gx, cashBefore = park.economy.cash;
      g.beginMove(a);
      g.cursorCell = { gx: 14, gz: 40 };
      g.setTool('select');
      if (g.moveTarget) fail.push('cancel left a move in progress');
      if (!a.root.visible) fail.push('cancel did not restore visibility');
      if (a.gx !== gxBefore) fail.push('cancel moved the ride anyway');
      if (park.economy.cash !== cashBefore) fail.push('cancel charged money');

      return fail.length ? fail.join(' | ') : null;
    } catch (e) { return 'THREW: ' + (e.stack || e.message); }
  });
  if (moveErr) errors.push('MOVE/ROTATE: ' + moveErr);
  else log('✓ move, rotate, refusal and cancel all behave');

  // ---- building over paths ----
  log('→ building over paths');
  const paveErr = await page.evaluate(() => {
    const g = window.__park, park = g.park, grid = park.grid;
    const fail = [];
    try {
      for (const a of [...park.attractions]) park.remove(a);
      for (let z = 0; z < 72; z++) for (let x = 0; x < 72; x++) grid.clearPath(x, z);
      park.economy.cash = 500000;
      park.unlockAll = true;

      // A big paved plaza.
      for (let z = 20; z < 44; z++) for (let x = 10; x < 40; x++) grid.setPath(x, z, 0);
      park.paths.markDirty(); park.pf.invalidate();
      const pathsBefore = grid.pathCells().length;

      // 1. A ride placed fully on paving must succeed and eat the tiles.
      const chk = park.canPlace('carousel', 14, 24, {});
      if (!chk.ok) fail.push('placing on solid paving was refused: ' + chk.reason);
      if (chk.pavedOver !== 36) fail.push(`expected 36 paved tiles reported, got ${chk.pavedOver}`);

      const r = park.place('carousel', 14, 24, 0);
      if (!r.ok) fail.push('place on paving failed: ' + r.reason);
      if (r.pavedOver !== 36) fail.push(`place reported ${r.pavedOver} paved, expected 36`);
      if (grid.pathCells().length !== pathsBefore - 36) {
        fail.push(`path count ${grid.pathCells().length}, expected ${pathsBefore - 36}`);
      }
      for (let z = 24; z < 30; z++) for (let x = 14; x < 20; x++) {
        if (grid.isPath(x, z)) fail.push(`path survived under the ride at ${x},${z}`);
        if (grid.ownerAt(x, z) !== r.attraction) fail.push(`cell ${x},${z} not claimed`);
      }
      // It should still be reachable: the surrounding plaza is intact.
      if (!r.attraction.connected) fail.push('ride on a plaza reported as disconnected');

      // 2. Overlapping an existing building must still be refused.
      const over = park.canPlace('teacups', 15, 25, {});
      if (over.ok) fail.push('placing on top of an existing ride was allowed');
      if (!/already/i.test(over.reason)) fail.push('unhelpful blocking reason: ' + over.reason);

      // 3. Overlapping scenery must be refused too.
      const tree = park.place('oakTree', 30, 24, 0);
      if (!tree.ok) fail.push('could not place test tree: ' + tree.reason);
      const onTree = park.canPlace('teacups', 29, 23, {});
      if (onTree.ok) fail.push('placing on top of a tree was allowed');

      // 4. Half paving / half building is still refused.
      const half = park.canPlace('teacups', 18, 26, {});
      if (half.ok) fail.push('footprint straddling a building was allowed');

      // 5. Off the map is still refused.
      if (park.canPlace('carousel', 70, 70, {}).ok) fail.push('off-map placement allowed');

      // 6. Relocating onto paving works and eats those tiles too.
      const before = grid.pathCells().length;
      const mv = park.relocate(r.attraction, 24, 34, 0);
      if (!mv.ok) fail.push('relocate onto paving refused: ' + mv.reason);
      if (mv.pavedOver !== 36) fail.push(`relocate paved ${mv.pavedOver}, expected 36`);
      if (grid.pathCells().length !== before - 36) fail.push('relocate did not remove paving');
      // ...and the vacated ground is bare, not re-paved.
      if (grid.isPath(14, 24)) fail.push('vacated tiles were re-paved');
      if (grid.ownerAt(14, 24)) fail.push('vacated tiles still claimed');

      return fail.length ? fail.join(' | ') : null;
    } catch (e) { return 'THREW: ' + (e.stack || e.message); }
  });
  if (paveErr) errors.push('BUILD OVER PATHS: ' + paveErr);
  else log('✓ builds over paving, refuses everything else');

  // ---- command console + auto-repair ----
  log('→ console commands and auto-repair');
  const cmdErr = await page.evaluate(() => {
    const g = window.__park;
    const ui = g.ui;
    try {
      ui.toggleConsole(true);
      const cmds = ['help', 'money 25000', 'rating 850', 'unlock', 'autorepair on',
        'clean', 'guests 12', 'weather rain', 'time 21.5', 'speed 2', 'fee 14',
        'staff mechanic 2', 'open', 'repair', 'firework 2', 'bogus', 'god', 'clear'];
      for (const c of cmds) ui.runCommand(c);
      ui.toggleConsole(false);
      if (!g.park.unlockAll) return 'unlock command did not take effect';
      if (!g.park.autoRepair) return 'autorepair command did not take effect';
      if (g.park.economy.cash < 1_000_000) return 'god mode did not grant credits';

      // Force a breakdown and let auto-repair deal with it.
      const ride = g.park.rides[0];
      if (!ride) return 'no ride to break';
      ride._breakDown(g.park.attractionCtx);
      if (!ride.broken) return 'ride did not break';
      for (let i = 0; i < 400; i++) g.park.update(0.05, g.sky);
      if (ride.broken) return 'auto-repair failed to fix a broken ride';
      return null;
    } catch (e) { return e.stack || e.message; }
  });
  if (cmdErr) errors.push('CONSOLE/AUTOREPAIR: ' + cmdErr);
  else log('✓ console commands and auto-repair work');

  // ---- save / load round trip ----
  log('→ save / load round trip');
  const saveErr = await page.evaluate(async () => {
    const g = window.__park, park = g.park;
    const Save = window.__SAVE;
    const fail = [];
    try {
      // Build a distinctive park.
      for (const a of [...park.attractions]) park.remove(a);
      for (let z = 0; z < 72; z++) for (let x = 0; x < 72; x++) park.grid.clearPath(x, z);
      for (let x = 12; x < 60; x++) { park.grid.setPath(x, 30, 0); park.grid.setPath(x, 31, 2); }
      park.paths.markDirty(); park.pf.invalidate();
      park.economy.cash = 123456;
      park.unlockAll = true;
      park.entryFee = 17;
      park.autoRepair = true;
      park.day = 9;
      park.dayFraction = 0.66;

      park.place('carousel', 14, 32, 0);
      park.place('ferrisWheel', 24, 32, Math.PI / 2);   // rotated footprint
      park.place('burgerStand', 36, 28, 0);
      park.place('oakTree', 44, 33, 0);
      for (const t of ['mechanic', 'janitor', 'janitor']) park.staff.hire(t);

      const wheel = park.rides.find((r) => r.def.id === 'ferrisWheel');
      wheel.upgrade(); wheel.upgrade();            // level 3
      wheel.price = 21;
      wheel.condition = 0.42;
      wheel.totalIncome = 9876;
      wheel.totalGuests = 654;
      wheel.open = false;
      park.grid.addLitter(20, 30, 0.6);

      const want = {
        cash: park.economy.cash, day: park.day, fee: park.entryFee,
        attractions: park.attractions.length,
        wheelW: wheel.w, wheelH: wheel.h, wheelLevel: wheel.level,
        wheelPrice: wheel.price, wheelIncome: wheel.totalIncome,
        wheelGuests: wheel.totalGuests, wheelOpen: wheel.open,
        wheelCond: +wheel.condition.toFixed(4),
        staff: park.staff.count,
        pathCells: park.grid.pathCells().length,
        litter: +park.grid.litter[park.grid.idx(20, 30)].toFixed(2),
        autoRepair: park.autoRepair,
      };

      const sres = Save.saveTo('slot3', g, 'roundtrip');
      if (!sres.ok) return 'save failed: ' + sres.error;

      // Wreck the park so a failed load cannot masquerade as success.
      for (const a of [...park.attractions]) park.remove(a);
      for (let z = 0; z < 72; z++) for (let x = 0; x < 72; x++) park.grid.clearPath(x, z);
      park.staff.staff.length = 0;
      park.economy.cash = 7;
      park.day = 1;
      park.entryFee = 3;
      park.autoRepair = false;
      park.paths.markDirty(); park.pf.invalidate();

      const lres = Save.loadFrom('slot3', g);
      if (!lres.ok) return 'load failed: ' + lres.error;
      if (lres.skipped?.length) fail.push('skipped on load: ' + lres.skipped.join(','));

      const w2 = park.rides.find((r) => r.def.id === 'ferrisWheel');
      if (!w2) return 'ferris wheel missing after load';
      const got = {
        cash: park.economy.cash, day: park.day, fee: park.entryFee,
        attractions: park.attractions.length,
        wheelW: w2.w, wheelH: w2.h, wheelLevel: w2.level,
        wheelPrice: w2.price, wheelIncome: w2.totalIncome,
        wheelGuests: w2.totalGuests, wheelOpen: w2.open,
        wheelCond: +w2.condition.toFixed(4),
        staff: park.staff.count,
        pathCells: park.grid.pathCells().length,
        litter: +park.grid.litter[park.grid.idx(20, 30)].toFixed(2),
        autoRepair: park.autoRepair,
      };
      for (const k of Object.keys(want)) {
        if (want[k] !== got[k]) fail.push(`${k}: saved ${want[k]}, restored ${got[k]}`);
      }
      // Path surface styles must survive too.
      if (park.grid.pathStyle[park.grid.idx(20, 31)] !== 2) fail.push('path style lost');
      // Rotated footprint must still be claimed correctly.
      if (park.grid.ownerAt(w2.gx, w2.gz) !== w2) fail.push('rotated ride not re-claimed');
      // The restored ride must still be reachable.
      if (!w2.connected) fail.push('restored ride lost its path connection');

      Save.deleteSave('slot3');
      if (Save.readSlot('slot3')) fail.push('delete did not remove the slot');

      // A save from another version must be refused, not silently applied.
      try {
        Save.applySave(g, { version: 999, park: {} });
        fail.push('a future-version save was accepted');
      } catch { /* expected */ }

      return fail.length ? fail.join(' | ') : null;
    } catch (e) { return 'THREW: ' + (e.stack || e.message); }
  });
  if (saveErr) errors.push('SAVE/LOAD: ' + saveErr);
  else log('✓ save, load, delete and version guard all behave');

  // ---- night + weather + fireworks ----
  log('→ night, weather and fireworks');
  await page.evaluate(() => {
    const g = window.__park;
    g.park.dayFraction = 0.92;
    g.park.weather = { id: 'rain', name: 'Rain', emoji: '🌧️', heat: 0.1, misery: 0.45, appeal: 0.6, mode: 'rain' };
    g.fx.weather.set('rain');
    g.park.economy.cash = 200000;
    for (let i = 0; i < 6; i++) g.park.place('fireworkLauncher', 30 + i * 2, 20, 0);
    for (let i = 0; i < 8; i++) {
      g.fx.firework({ x: (i - 4) * 9, y: 4, z: -10 });
    }
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOTS}/05-night.png` });

  // ---- demolish everything (teardown path) ----
  log('→ demolishing everything');
  const demoErr = await page.evaluate(() => {
    const g = window.__park;
    try {
      for (const a of [...g.park.attractions]) g.park.remove(a);
      return null;
    } catch (e) { return e.stack || e.message; }
  });
  if (demoErr) errors.push('DEMOLISH: ' + demoErr);
  await page.waitForTimeout(1200);

  // ---- persistence across a real page reload ----
  log('→ persistence across a page reload');
  await page.evaluate(async () => {
    const g = window.__park, park = g.park;
    const Save = window.__SAVE;
    for (const a of [...park.attractions]) park.remove(a);
    for (let x = 12; x < 50; x++) { park.grid.setPath(x, 30, 0); park.grid.setPath(x, 31, 0); }
    park.paths.markDirty(); park.pf.invalidate();
    park.economy.cash = 424242;
    park.unlockAll = true;
    park.day = 12;
    park.place('carousel', 16, 32, 0);
    park.place('hauntedHouse', 26, 32, 0);
    park.staff.hire('mechanic');
    Save.saveTo('slot2', g, 'reload test');
    // Snapshot the truth as it stands at save time, so the post-reload check
    // compares against reality rather than against assumptions.
    localStorage.setItem('__expect', JSON.stringify({
      cash: Math.round(park.economy.cash),
      day: park.day,
      rides: park.rides.length,
      mechanics: park.staff.countOf('mechanic'),
      staff: park.staff.count,
      paths: park.grid.pathCells().length,
    }));
  });

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(
    () => document.getElementById('boot')?.classList.contains('hidden'),
    null, { timeout: 90000 },
  );
  await page.waitForTimeout(800);

  const reloadCheck = await page.evaluate(async () => {
    const g = window.__park;
    const Save = window.__SAVE;
    const want = JSON.parse(localStorage.getItem('__expect') || '{}');
    const listed = Save.listSaves().find((s) => s.slot === 'slot2');
    if (!listed || listed.empty) return 'slot2 did not survive the reload';
    const r = g.loadGame('slot2');
    if (!r.ok) return 'load after reload failed: ' + r.error;
    const p = g.park;
    const got = {
      cash: Math.round(p.economy.cash),
      day: p.day,
      rides: p.rides.length,
      mechanics: p.staff.countOf('mechanic'),
      staff: p.staff.count,
      paths: p.grid.pathCells().length,
    };
    const problems = [];
    for (const k of Object.keys(want)) {
      if (want[k] !== got[k]) problems.push(`${k}: saved ${want[k]}, restored ${got[k]}`);
    }
    if (!p.rides.every((x) => x.connected)) problems.push('a restored ride is not path-connected');
    Save.deleteSave('slot2');
    localStorage.removeItem('__expect');
    return problems.length ? problems.join(', ') : null;
  });
  if (reloadCheck) errors.push('RELOAD PERSISTENCE: ' + reloadCheck);
  else log('✓ saves survive a full page reload');

  await page.screenshot({ path: `${SHOTS}/06-reloaded.png` });

  const final = await page.evaluate(() => ({
    attractions: window.__park.park.attractions.length,
    guests: window.__park.park.guests.count,
    fps: Math.round(window.__park.fps),
  }));
  log('  final', JSON.stringify(final));
} catch (e) {
  errors.push('HARNESS: ' + (e.stack || e.message));
} finally {
  await page.screenshot({ path: `${SHOTS}/99-final.png` }).catch(() => {});
  await browser.close();
}

log('\n================ RESULT ================');
if (warnings.length) {
  log(`${warnings.length} warning(s):`);
  for (const w of [...new Set(warnings)].slice(0, 12)) log('  ⚠ ' + w.slice(0, 300));
}
if (errors.length) {
  log(`\n${errors.length} ERROR(S):`);
  for (const e of [...new Set(errors)].slice(0, 25)) log('\n  ✗ ' + e.slice(0, 2500));
  process.exit(1);
}
log('✓ no errors');
