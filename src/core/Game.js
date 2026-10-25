/**
 * Game controller: owns the loop, the build tools and every player action.
 */
import * as THREE from 'three';
import { Engine } from './Engine.js';
import { CameraRig } from './CameraRig.js';
import { AudioEngine } from './Audio.js';
import { Sky } from '../gfx/Sky.js';
import { Effects } from '../gfx/Effects.js';
import { Terrain } from '../world/Terrain.js';
import { Park, DAY_LENGTH } from '../sim/Park.js';
import { UI } from '../ui/UI.js';
import { CATALOG, rotatedFootprint } from '../data/catalog.js';
import { STAFF_TYPES } from '../sim/Staff.js';
import { GRID_W, GRID_H, TILE } from '../world/Grid.js';
import { formatMoneyFull } from '../sim/Economy.js';
import * as M from '../gfx/Materials.js';
import * as Save from '../sim/SaveGame.js';

export class Game {
  constructor(canvas, onProgress) {
    this.engine = new Engine(canvas);
    this.sky = new Sky(this.engine);
    this.fx = new Effects(this.engine);
    this.park = new Park(this.engine, this.fx);
    this.terrain = new Terrain(this.engine, this.park.grid);
    this.rig = new CameraRig(this.engine.camera, canvas);
    this.audio = new AudioEngine();

    this.tool = { mode: 'select', defId: null, pathStyle: 0, rotation: 0 };
    this.selected = null;
    this.hovered = null;
    this.ghost = null;
    this.ghostDefId = null;
    this.followTarget = null;
    /** Attraction currently being relocated, if any. */
    this.moveTarget = null;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(-10, -10);
    this.groundPoint = new THREE.Vector3();
    this.hasGround = false;
    this.cursorCell = { gx: -1, gz: -1 };

    this._painting = false;
    this._paintErase = false;
    this._lastPaintCell = null;
    this._downPos = { x: 0, y: 0 };
    this._downTime = 0;
    this._hoverTimer = 0;

    this._buildCursorVisuals();

    this.park.buildStarterPaths();
    this._seedStarterScenery();

    this.ui = new UI(this);
    this._bindPointer(canvas);

    // R rotates the item being placed; otherwise it tilts the camera.
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyR' && (this.tool.mode === 'build' || this.tool.mode === 'move')) {
        e.preventDefault();
        this.rotateTool();
      }
    });

    this.running = false;
    this.fps = 60;
    this._lastTime = performance.now();
    this._fpsAccum = 0;
    this._fpsFrames = 0;

    // Autosave to the rolling 'auto' slot, and again if the tab goes away.
    this.autosaveEnabled = true;
    this.autosaveInterval = 120;
    this._autosaveTimer = this.autosaveInterval;
    window.addEventListener('beforeunload', () => this.autosave(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.autosave(true);
    });

    this.engine.onAutoQuality = (q) => {
      this.ui.toast('⚙️', 'Graphics adjusted', `Switched to ${q} quality to keep the frame rate smooth.`, 'info');
    };
  }

  /* ================================================================== *
   * Setup
   * ================================================================== */

  _buildCursorVisuals() {
    // Footprint pad under the ghost.
    const g = new THREE.Group();
    this.footprint = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x3ddc97, transparent: true, opacity: 0.28, depthWrite: false,
      }),
    );
    this.footprint.rotation.x = -Math.PI / 2;
    this.footprint.position.y = 0.16;
    g.add(this.footprint);

    this.footprintEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x3ddc97, transparent: true, opacity: 0.9 }),
    );
    g.add(this.footprintEdge);

    g.visible = false;
    this.cursorGroup = g;
    this.engine.scene.add(g);

    // Selection ring.
    const ringGeo = new THREE.RingGeometry(0.92, 1.0, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.selRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xffc23c, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.selRing.visible = false;
    this.selRing.position.y = 0.2;
    this.engine.scene.add(this.selRing);
  }

  /** A handful of trees and lamps at the gate so day one isn't a bare field. */
  _seedStarterScenery() {
    const grid = this.park.grid;
    const e = grid.entrance;
    const put = (id, gx, gz) => {
      this.park.place(id, gx, gz, Math.random() * Math.PI * 2, { free: true });
    };
    for (let i = 0; i < 7; i++) {
      const z = e.gz - 2 - i * 3;
      put('oakTree', e.gx - 4, z);
      put('oakTree', e.gx + 3, z);
    }
    for (let i = 0; i < 5; i++) {
      const z = e.gz - 3 - i * 5;
      put('lampPost', e.gx - 2, z);
      put('lampPost', e.gx + 2, z);
    }
    put('flowerBed', e.gx - 5, e.gz - 4);
    put('flowerBed', e.gx + 4, e.gz - 4);
    put('trashBin', e.gx + 2, e.gz - 8);
    put('trashBin', e.gx - 2, e.gz - 14);
  }

  /* ================================================================== *
   * Tools
   * ================================================================== */

  setTool(mode, opts = {}) {
    if (this.moveTarget && mode !== 'move') this.cancelMove();
    this.tool.mode = mode;
    if (opts.defId !== undefined) this.tool.defId = opts.defId;
    if (opts.pathStyle !== undefined) this.tool.pathStyle = opts.pathStyle;
    if (mode !== 'build') this._clearGhost();
    else this._makeGhost(this.tool.defId);
    if (mode === 'select') this.cursorGroup.visible = false;
    this.ui?.refreshCardStates();
    this.audio.click();
  }

  _clearGhost() {
    if (this.ghost) {
      this.engine.scene.remove(this.ghost);
      this.ghost.traverse((o) => { if (o.isMesh || o.isPoints) o.geometry?.dispose?.(); });
      this.ghost = null;
      this.ghostDefId = null;
    }
  }

  _makeGhost(defId) {
    if (this.ghostDefId === defId && this.ghost) return;
    this._clearGhost();
    const def = CATALOG[defId];
    if (!def) return;
    const model = def.build({ w: def.w, h: def.h, seed: 3, fx: null, level: 1 });
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0x8fe8c0, transparent: true, opacity: 0.42, depthWrite: false,
    });
    model.root.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) {
        o.material = ghostMat;
        o.castShadow = false;
        o.receiveShadow = false;
      }
      if (o.isPoints || o.isSprite) o.visible = false;
      if (o.isLight) o.intensity = 0;
    });
    this.ghostMat = ghostMat;
    this.ghost = model.root;
    this.ghostDefId = defId;
    this.engine.scene.add(this.ghost);
  }

  /* ================================================================== *
   * Pointer input
   * ================================================================== */

  _bindPointer(canvas) {
    canvas.addEventListener('pointermove', (e) => {
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      if (this._painting) this._paintAtCursor();
    });

    canvas.addEventListener('pointerdown', (e) => {
      this.audio.init();
      this.audio.resume();
      if (e.button !== 0) return;
      this._downPos.x = e.clientX; this._downPos.y = e.clientY;
      this._downTime = performance.now();
      const t = this.tool.mode;
      if (t === 'path' || t === 'erasePath') {
        this._painting = true;
        this._paintErase = t === 'erasePath';
        this._lastPaintCell = null;
        this._paintAtCursor();
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;
      const moved = Math.hypot(e.clientX - this._downPos.x, e.clientY - this._downPos.y);
      const wasPainting = this._painting;
      this._painting = false;
      this._lastPaintCell = null;
      if (wasPainting || moved > 6) return;
      // Treat as a click.
      const overUI = e.target !== this.engine.canvas;
      if (overUI) return;
      this._handleClick();
    });
  }

  _handleClick() {
    const t = this.tool.mode;
    if (t === 'build') { this._placeAtCursor(); return; }
    if (t === 'move') { this.confirmMove(); return; }
    if (t === 'demolish') {
      const hit = this._pickAttraction();
      if (hit) this.demolish(hit);
      else this.audio.error();
      return;
    }
    // Select mode: attraction first, then staff, then guest.
    const att = this._pickAttraction();
    if (att) { this.select(att); return; }
    if (this.hasGround) {
      const st = this.park.staff.pickStaff(this.groundPoint, 1.6);
      if (st) { this.select(st); return; }
      const g = this.park.guests.pickGuest(this.groundPoint, 1.6);
      if (g) { this.select(g); return; }
    }
    this.select(null);
  }

  _pickAttraction() {
    this.raycaster.setFromCamera(this.pointer, this.engine.camera);
    const roots = this.park.attractions.map((a) => a.root);
    const hits = this.raycaster.intersectObjects(roots, true);
    for (const h of hits) {
      let o = h.object;
      while (o) {
        if (o.userData.attraction) return o.userData.attraction;
        o = o.parent;
      }
    }
    return null;
  }

  _updateCursor() {
    this.raycaster.setFromCamera(this.pointer, this.engine.camera);
    const hit = this.raycaster.intersectObject(this.terrain.pickPlane, false)[0];
    this.hasGround = !!hit;
    if (!hit) { this.cursorGroup.visible = false; return; }
    this.groundPoint.copy(hit.point);

    const grid = this.park.grid;
    const t = this.tool.mode;

    if (t === 'build' || t === 'move') {
      const def = CATALOG[this.tool.defId];
      if (!def) { this.cursorGroup.visible = false; return; }
      // The footprint turns with the model, so preview the rotated one.
      const fp = rotatedFootprint(def, this.tool.rotation);
      // Centre the footprint on the cursor.
      const gx = grid.gridX(hit.point.x) - ((fp.w - 1) >> 1);
      const gz = grid.gridZ(hit.point.z) - ((fp.h - 1) >> 1);
      this.cursorCell = { gx, gz };
      const check = t === 'move'
        ? this.park.canRelocate(this.moveTarget, gx, gz, this.tool.rotation)
        : this.park.canPlace(this.tool.defId, gx, gz, { rotation: this.tool.rotation });
      const needsPath = def.cat !== 'scenery' && def.cat !== 'garden';
      const touching = grid.touchesPath(gx, gz, fp.w, fp.h);
      const ok = check.ok;
      const warn = ok && needsPath && !touching;

      const c = grid.footprintCenter(gx, gz, fp.w, fp.h);
      const w = fp.w * TILE, d = fp.h * TILE;
      this.cursorGroup.visible = true;
      this.cursorGroup.position.set(c.x, 0, c.z);
      this.footprint.scale.set(w, d, 1);
      this.footprintEdge.scale.set(w, 0.6, d);
      this.footprintEdge.position.y = 0.3;
      const col = !ok ? 0xff5d6c : warn ? 0xffc23c : 0x3ddc97;
      this.footprint.material.color.setHex(col);
      this.footprintEdge.material.color.setHex(col);

      if (this.ghost) {
        this.ghost.visible = true;
        this.ghost.position.set(c.x, 0, c.z);
        this.ghost.rotation.y = this.tool.rotation;
        if (this.ghostMat) this.ghostMat.color.setHex(ok ? 0x8fe8c0 : 0xff9aa4);
      }
      this._placeOk = ok;
      this._placeWarn = warn;
      this._placeReason = check.reason;
      this._placePaved = ok ? (check.pavedOver || 0) : 0;
      return;
    }

    this._placePaved = 0;

    if (t === 'path' || t === 'erasePath') {
      const gx = grid.gridX(hit.point.x);
      const gz = grid.gridZ(hit.point.z);
      this.cursorCell = { gx, gz };
      this.cursorGroup.visible = grid.inBounds(gx, gz);
      this.cursorGroup.position.set(grid.worldX(gx), 0, grid.worldZ(gz));
      this.footprint.scale.set(TILE, TILE, 1);
      this.footprintEdge.scale.set(TILE, 0.3, TILE);
      this.footprintEdge.position.y = 0.15;
      const col = t === 'erasePath' ? 0xff5d6c : 0x54d4f0;
      this.footprint.material.color.setHex(col);
      this.footprintEdge.material.color.setHex(col);
      return;
    }

    if (t === 'demolish') {
      this._hoverTimer -= 0.016;
      if (this._hoverTimer <= 0) {
        this._hoverTimer = 0.06;
        this.hovered = this._pickAttraction();
      }
      if (this.hovered) {
        const a = this.hovered;
        this.cursorGroup.visible = true;
        this.cursorGroup.position.copy(a.center);
        this.footprint.scale.set(a.w * TILE, a.h * TILE, 1);
        this.footprintEdge.scale.set(a.w * TILE, 1.2, a.h * TILE);
        this.footprintEdge.position.y = 0.6;
        this.footprint.material.color.setHex(0xff5d6c);
        this.footprintEdge.material.color.setHex(0xff5d6c);
      } else {
        this.cursorGroup.visible = false;
      }
      return;
    }

    this.cursorGroup.visible = false;
  }

  _placeAtCursor() {
    const { gx, gz } = this.cursorCell;
    const defId = this.tool.defId;
    const def = CATALOG[defId];
    if (!def) return;
    const res = this.park.place(defId, gx, gz, this.tool.rotation);
    if (!res.ok) {
      this.audio.error();
      this.ui.toast('🚫', 'Cannot build here', res.reason, 'bad', 2600);
      return;
    }
    this.audio.build();
    if (res.pavedOver) {
      this.ui.toast('🧱', 'Paths paved over',
        `${res.pavedOver} path tile${res.pavedOver === 1 ? '' : 's'} removed to make room.`,
        'info', 2800);
    }
    const a = res.attraction;
    if (!a.connected && !a.isScenery) {
      this.ui.toast('🚧', 'Not connected', `${def.name} needs a path next to it before guests can reach it.`, 'warn');
    }
    // Keep the tool active for rapid placement unless funds ran out.
    if (!this.park.economy.canAfford(def.cost)) {
      this.ui.toast('💸', 'Out of credits', `You can no longer afford another ${def.name}.`, 'warn');
      this.setTool('select');
    }
  }

  _paintAtCursor() {
    this._updateCursor();
    if (!this.hasGround) return;
    const { gx, gz } = this.cursorCell;
    const grid = this.park.grid;
    if (!grid.inBounds(gx, gz)) return;

    // Fill the gap between samples so fast drags don't leave holes.
    const cells = [];
    if (this._lastPaintCell) {
      const { gx: lx, gz: lz } = this._lastPaintCell;
      const steps = Math.max(Math.abs(gx - lx), Math.abs(gz - lz));
      for (let i = 1; i <= steps; i++) {
        cells.push({
          gx: Math.round(lx + ((gx - lx) * i) / steps),
          gz: Math.round(lz + ((gz - lz) * i) / steps),
        });
      }
    } else {
      cells.push({ gx, gz });
    }

    let changed = false;
    for (const c of cells) {
      if (this._paintErase) changed = this.park.removePath(c.gx, c.gz) || changed;
      else changed = this.park.placePath(c.gx, c.gz, this.tool.pathStyle) || changed;
    }
    this._lastPaintCell = { gx, gz };
    if (changed) this.audio.click();
  }

  /* ================================================================== *
   * Saving
   * ================================================================== */

  /** @param {boolean} [quiet] Skip the toast (used for unload autosaves). */
  autosave(quiet = false) {
    if (!this.autosaveEnabled || !Save.canStore) return null;
    // Nothing worth saving before the player has built anything.
    if (this.park.attractions.length === 0 && this.park.day === 1) return null;
    const res = Save.saveTo('auto', this, `Autosave — day ${this.park.day}`);
    if (!res.ok && !quiet) {
      this.ui.toast('⚠️', 'Autosave failed', res.error, 'bad');
    } else if (res.ok && !quiet) {
      this.ui.toast('💾', 'Autosaved', `Day ${this.park.day} stored in the autosave slot.`, 'info', 2200);
    }
    return res;
  }

  saveGame(slot, name) {
    const res = Save.saveTo(slot, this, name);
    if (res.ok) {
      this.audio.chime();
      this.ui.toast('💾', 'Game saved', `${res.data.name} — day ${this.park.day}.`, 'good');
    } else {
      this.audio.error();
      this.ui.toast('⚠️', 'Could not save', res.error, 'bad', 6000);
    }
    return res;
  }

  loadGame(slot) {
    const res = Save.loadFrom(slot, this);
    if (res.ok) {
      this.audio.chime();
      this._autosaveTimer = this.autosaveInterval;
      this.rig.goTo(
        { x: this.park.grid.worldX(this.park.grid.entrance.gx), z: 30 }, 80,
      );
      const skipped = res.skipped?.length
        ? ` (${res.skipped.length} item${res.skipped.length === 1 ? '' : 's'} could not be restored)` : '';
      this.ui.toast('📂', 'Game loaded', `Day ${this.park.day}, ${this.park.rides.length} rides${skipped}.`, 'good');
      this.park.log(`Loaded save: day ${this.park.day}`, 'info', '📂');
    } else {
      this.audio.error();
      this.ui.toast('⚠️', 'Could not load', res.error, 'bad', 6000);
    }
    return res;
  }

  /* ================================================================== *
   * Relocating
   * ================================================================== */

  /**
   * Pick an attraction up. The real object is hidden and replaced by the
   * usual build ghost, so moving looks and feels exactly like placing.
   */
  beginMove(att) {
    if (!att) return;
    this.moveTarget = att;
    this.moveOrigin = { gx: att.gx, gz: att.gz, rotation: att.rotation };
    this.tool.mode = 'move';
    this.tool.defId = att.def.id;
    this.tool.rotation = att.rotation;
    att.root.visible = false;
    this._makeGhost(att.def.id);
    this.ui.refreshCardStates();
    this.audio.click();
    this.ui.toast('📦', `Moving ${att.def.name}`,
      `Click to place · R rotates · Esc cancels. Relocating costs ${formatMoneyFull(att.moveCost)}.`,
      'info', 5200);
  }

  cancelMove() {
    const att = this.moveTarget;
    this.moveTarget = null;
    this.moveOrigin = null;
    this._clearGhost();
    if (att) att.root.visible = true;
  }

  confirmMove() {
    const att = this.moveTarget;
    if (!att) return;
    const { gx, gz } = this.cursorCell;
    const res = this.park.relocate(att, gx, gz, this.tool.rotation);
    if (!res.ok) {
      this.audio.error();
      this.ui.toast('🚫', 'Cannot move there', res.reason, 'bad', 2600);
      return;
    }
    att.root.visible = true;
    this.moveTarget = null;
    this.moveOrigin = null;
    this._clearGhost();
    this.tool.mode = 'select';
    this.audio.build();
    if (!res.unchanged) {
      this.ui.toast('📦', 'Relocated', `${att.def.name} moved for ${formatMoneyFull(res.cost)} credits.`, 'good');
    }
    if (!att.connected && !att.isScenery) {
      this.ui.toast('🚧', 'Not connected', `${att.def.name} needs a path beside it.`, 'warn');
    }
    this.select(att);
  }

  /* ================================================================== *
   * Player actions
   * ================================================================== */

  select(obj) {
    if (this.moveTarget && obj !== this.moveTarget) this.cancelMove();
    this.selected = obj;
    this.followTarget = null;
    this.ui.setSelection(obj);
    if (obj) this.audio.select();
    if (obj && obj.center) {
      this.selRing.visible = true;
      this.selRing.position.set(obj.center.x, 0.2, obj.center.z);
      const r = Math.max(obj.w, obj.h) * TILE * 0.62;
      this.selRing.scale.setScalar(r);
    } else {
      this.selRing.visible = false;
    }
  }

  repair(a) {
    const cost = a.instantRepairCost();
    if (!this.park.economy.canAfford(cost)) {
      this.audio.error();
      this.ui.toast('💸', 'Not enough credits', `Repairing ${a.def.name} costs ${formatMoneyFull(cost)}.`, 'bad');
      return;
    }
    this.park.economy.spend(cost, 'repairs');
    a.repairAmount(1);
    a.condition = 1;
    this.fx.sparks(a.center.clone().setY(2));
    this.audio.chime();
    this.ui.toast('🔧', 'Repaired', `${a.def.name} is back to perfect condition.`, 'good');
  }

  upgrade(a) {
    const cost = a.nextUpgradeCost;
    if (!a.canUpgrade) return;
    if (!this.park.economy.canAfford(cost)) {
      this.audio.error();
      this.ui.toast('💸', 'Not enough credits', `That upgrade costs ${formatMoneyFull(cost)}.`, 'bad');
      return;
    }
    this.park.economy.spend(cost, 'construction');
    a.upgrade();
    this.fx.confetti(a.center.clone().setY(3), 70);
    this.audio.chime();
    this.ui.toast('⬆️', `${a.def.name} upgraded`, `Now ${a.tier.name}: more capacity, more excitement, better reliability.`, 'good');
    this.park.checkObjectives();
  }

  demolish(a) {
    const refund = this.park.remove(a);
    this.audio.demolish();
    if (this.selected === a) this.select(null);
    this.ui.toast('🧨', 'Demolished', `${a.def.name} removed, ${formatMoneyFull(refund)} credits recovered.`, 'warn');
  }

  hireStaff(type) {
    const def = STAFF_TYPES[type];
    if (!this.park.economy.canAfford(def.hire)) {
      this.audio.error();
      this.ui.toast('💸', 'Not enough credits', `Hiring a ${def.name} costs ${formatMoneyFull(def.hire)}.`, 'bad');
      return;
    }
    this.park.economy.spend(def.hire, 'staff');
    const s = this.park.staff.hire(type);
    if (s) {
      this.audio.cash();
      this.ui.toast(def.emoji, `${def.name} hired`, `${def.blurb} Wage ${def.wage}/min.`, 'good');
      this.park.checkObjectives();
    }
  }

  fireStaff(type) {
    const m = this.park.staff.fireOne(type);
    if (m) {
      this.audio.click();
      this.ui.toast('👋', 'Staff dismissed', `A ${m.def.name} has left the park.`, 'warn');
    }
  }

  enterRideCam(a) {
    if (this.rig.enterRideCam(a)) {
      this.audio.select();
      this.ui.toast('🎥', 'Ride camera', 'Riding along. Press Esc to return.', 'info', 3000);
    }
  }

  exitRideCam() { this.rig.exitRideCam(); }

  followGuest(g) {
    this.followTarget = g;
    this.ui.toast('🎥', 'Following guest', `Camera is tracking ${g.name}.`, 'info', 2600);
  }

  setSpeed(v) {
    if (v === 0) { this.park.paused = true; }
    else { this.park.paused = false; this.park.timeScale = v; }
    this.audio.click();
  }

  togglePause() {
    this.park.paused = !this.park.paused;
    this.audio.click();
  }

  /* ================================================================== *
   * Loop
   * ================================================================== */

  start() {
    this.running = true;
    this._lastTime = performance.now();
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      this.frame();
    };
    requestAnimationFrame(loop);

    this.ui.toast('👋', 'Welcome to WonderPark', 'Open a build category below and start with a ride next to the main path.', 'info', 9000);
    this.park.log('Park opened for business', 'good', '🎉');
  }

  frame() {
    const now = performance.now();
    const realDt = Math.min(0.5, (now - this._lastTime) / 1000);
    this._lastTime = now;
    // Simulation dt is capped so a stall can't teleport the world, but the
    // frame-rate readout and quality scaler must see the real elapsed time.
    const dt = Math.min(0.05, realDt);
    this.engine.sampleFrame(realDt);

    this._fpsAccum += realDt; this._fpsFrames++;
    if (this._fpsAccum > 0.5) {
      this.fps = this._fpsFrames / this._fpsAccum;
      this._fpsAccum = 0; this._fpsFrames = 0;
    }

    // While placing, R belongs to the build tool rather than the camera.
    if (this.tool.mode === 'build' || this.tool.mode === 'move') this.rig.keys.delete('KeyR');

    // Camera follow.
    if (this.followTarget) {
      if (!this.followTarget.active) this.followTarget = null;
      else this.rig.goTo(this.followTarget.pos, Math.min(this.rig.targetDistance, 22));
    }
    this.rig.update(dt);

    // Simulation.
    this.park.update(dt, this.sky);

    // Sky + lighting follow the game clock, not real time.
    this.sky.update(this.park.dayFraction, dt, this.rig.focus);
    // One place decides how bright every bulb in the park is.
    M.setBulbNight(this.sky.nightAmount);
    this.terrain.update(dt, this.sky);
    this.fx.update(dt, this.engine.camera, this.sky);

    // Tools.
    if (!this._painting) this._updateCursor();
    if (this.selected?.center) {
      this.selRing.position.set(this.selected.center.x, 0.2, this.selected.center.z);
      this.selRing.material.opacity = 0.55 + Math.sin(performance.now() * 0.004) * 0.3;
    } else if (this.selected?.pos) {
      this.selRing.visible = true;
      this.selRing.scale.setScalar(0.8);
      this.selRing.position.set(this.selected.pos.x, 0.2, this.selected.pos.z);
    }

    // Autosave on a wall-clock timer, never mid-drag.
    if (this.autosaveEnabled && !this._painting && !this.moveTarget) {
      this._autosaveTimer -= realDt;
      if (this._autosaveTimer <= 0) {
        this._autosaveTimer = this.autosaveInterval;
        this.autosave();
      }
    }

    // Audio ambience tracks the crowd.
    this._audioTimer = (this._audioTimer || 0) - dt;
    if (this._audioTimer <= 0) {
      this._audioTimer = 1.0;
      this.audio.setAmbience(this.park.guests.count, this.sky.nightAmount);
    }

    this.ui.update(dt, this.engine.camera);
    this.engine.render();
  }

  /* --- keyboard rotate hook, called from main --- */
  rotateTool() {
    this.tool.rotation += Math.PI / 2;
    if (this.tool.rotation >= Math.PI * 2) this.tool.rotation = 0;
  }
}
