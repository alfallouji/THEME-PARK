/**
 * All DOM: HUD, build dock, inspector, modals, ticker, minimap and world
 * labels. The UI reads from the Park each frame and calls back into the Game
 * for anything that mutates state.
 */
import * as THREE from 'three';
import { CATALOG, CATEGORIES, byCategory, TIER, MAX_LEVEL } from '../data/catalog.js';
import { PATH_STYLES } from '../world/Paths.js';
import { STAFF_TYPES } from '../sim/Staff.js';
import { WEATHERS } from '../sim/Park.js';
import * as Save from '../sim/SaveGame.js';
import { formatMoney, formatMoneyFull, LEDGER_KEYS } from '../sim/Economy.js';
import { GRID_W, GRID_H, CELL } from '../world/Grid.js';
import { RIDE_STATE } from '../sim/Attraction.js';

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function meter(label, value, color, text) {
  const pct = Math.round(THREE.MathUtils.clamp(value, 0, 1) * 100);
  return `<div class="meter">
    <div class="meter-top"><span class="l">${label}</span><span class="r">${text ?? pct + '%'}</span></div>
    <div class="meter-bar"><i style="width:${pct}%;background:${color}"></i></div>
  </div>`;
}

function healthColor(v) {
  if (v > 0.66) return 'linear-gradient(90deg,#3ddc97,#7ef0bd)';
  if (v > 0.33) return 'linear-gradient(90deg,#ffc23c,#ffe066)';
  return 'linear-gradient(90deg,#ff5d6c,#ff8e98)';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function stars(n) {
  const full = Math.round(n);
  return '★'.repeat(Math.max(0, Math.min(5, full))) + '☆'.repeat(Math.max(0, 5 - full));
}

export class UI {
  constructor(game) {
    this.game = game;
    this.park = game.park;
    this.rootEl = document.getElementById('ui');
    this.selected = null;
    this.openTab = null;
    this.toasts = [];
    this.floaters = [];
    this._labelPool = [];
    this._lastCash = this.park.economy.cash;

    this._buildTopbar();
    this._buildDock();
    this._buildInspector();
    this._buildToasts();
    this._buildTicker();
    this._buildMinimap();
    this._buildHint();
    this._buildModal();
    this._buildWorldLayer();
    this._buildConsole();
    this._bindKeys();

    this.park.onMessage = (m) => this.pushTicker(m);
    this.park.onObjective = (o) => {
      this.toast(o.emoji, 'Objective complete', `${o.name} — +${formatMoneyFull(o.reward)} credits`, 'good');
    };
    this.park.onAward = (a) => {
      this.toast(a.emoji, 'Award won!', `${a.name} — +${formatMoneyFull(a.cash)} credits`, 'good');
    };
    this.park.onBreakdownEvent = (a) => {
      this.toast('⚠️', 'Breakdown', `${a.def.name} needs a mechanic.`, 'bad');
    };
    this.park.onDayEnd = (s, day) => this.showDaySummary(s, day);
    this.park.onAutoRepair = (a, cost) => {
      this.toast('🛠️', 'Auto-repaired', `${a.def.name} fixed for ${formatMoneyFull(cost)}.`, 'good', 3200);
    };
    this.park.onIncome = (a, amt) => this.floatMoney(a.center, amt);
  }

  /* ================================================================== *
   * Top bar
   * ================================================================== */
  _buildTopbar() {
    const bar = el('div', 'topbar');

    const left = el('div', 'tb-group');
    left.appendChild(el('div', 'tb-brand', '<span class="mark">🎡</span>WonderPark'));
    bar.appendChild(left);

    const stats = el('div', 'tb-group');
    const mkStat = (cls, icon, key) => {
      const s = el('div', 'stat ' + cls);
      s.innerHTML = `<span class="ico">${icon}</span><span class="col">
        <span class="k">${key}</span><span class="v">–</span></span>`;
      stats.appendChild(s);
      return s.querySelector('.v');
    };
    this.vCash = mkStat('money', '💰', 'Credits');
    this.vProfit = mkStat('', '📈', 'Per min');
    this.vGuests = mkStat('', '👥', 'Guests');
    this.vRating = mkStat('', '⭐', 'Rating');
    this.vHappy = mkStat('', '😊', 'Happy');
    this.vClock = mkStat('', '🕐', 'Day 1');
    this.clockStat = this.vClock.parentElement.parentElement;
    bar.appendChild(stats);

    bar.appendChild(el('div', 'spacer'));

    // Speed controls.
    const speed = el('div', 'tb-group');
    this.speedBtns = [];
    const speeds = [['⏸', 0, 'Pause'], ['▶', 1, 'Normal'], ['⏩', 2, 'Fast'], ['⏭', 4, 'Very fast']];
    for (const [label, val, title] of speeds) {
      const b = el('button', 'tb-btn', label);
      b.title = title;
      b.onclick = () => this.game.setSpeed(val);
      speed.appendChild(b);
      this.speedBtns.push({ b, val });
    }
    bar.appendChild(speed);

    // Panels.
    const tools = el('div', 'tb-group');
    const mkBtn = (icon, title, fn) => {
      const b = el('button', 'tb-btn', icon);
      b.title = title;
      b.onclick = fn;
      tools.appendChild(b);
      return b;
    };
    this.btnObjectives = mkBtn('🏆', 'Objectives (O)', () => this.showObjectives());
    this.btnFinance = mkBtn('📊', 'Finances (F)', () => this.showFinance());
    this.btnStaff = mkBtn('🧑‍🔧', 'Staff (T)', () => this.showStaff());
    this.btnPark = mkBtn('⚙️', 'Park settings (P)', () => this.showParkSettings());
    this.btnDemolish = mkBtn('🧨', 'Demolish tool (X)', () => this.game.setTool(
      this.game.tool.mode === 'demolish' ? 'select' : 'demolish'));
    this.btnAutoRepair = mkBtn('🛠️', 'Auto-repair service', () => {
      this.park.autoRepair = !this.park.autoRepair;
      this.toast('🛠️', `Auto-repair ${this.park.autoRepair ? 'enabled' : 'disabled'}`,
        this.park.autoRepair
          ? `Breakdowns are fixed automatically after ${this.park.autoRepairDelay}s, at a ${Math.round((this.park.autoRepairPremium - 1) * 100)}% premium.`
          : 'Broken rides now wait for a mechanic.',
        this.park.autoRepair ? 'good' : 'warn');
    });
    this.btnSave = mkBtn('💾', 'Save / load (Ctrl+S quick-saves)', () => this.showSaveLoad());
    this.btnConsole = mkBtn('⌨️', 'Command console (/)', () => this.toggleConsole());
    mkBtn('❓', 'Help (H)', () => this.showHelp());
    bar.appendChild(tools);

    this.rootEl.appendChild(bar);
  }

  /* ================================================================== *
   * Build dock
   * ================================================================== */
  _buildDock() {
    const dock = el('div', 'dock');
    const tabs = el('div', 'dock-tabs');
    this.tabButtons = {};
    for (const c of CATEGORIES) {
      const b = el('button', 'dock-tab', `<span class="em">${c.emoji}</span>${c.name}`);
      b.onclick = () => this.toggleTab(c.id);
      tabs.appendChild(b);
      this.tabButtons[c.id] = b;
    }
    dock.appendChild(tabs);

    this.dockBody = el('div', 'dock-body');
    this.cardRow = el('div', 'card-row');
    this.dockBody.appendChild(this.cardRow);
    dock.appendChild(this.dockBody);

    this.rootEl.appendChild(dock);
  }

  toggleTab(id) {
    if (this.openTab === id) {
      this.openTab = null;
      this.dockBody.classList.remove('open');
      this.game.setTool('select');
    } else {
      this.openTab = id;
      this.dockBody.classList.add('open');
      this.renderCards(id);
    }
    for (const [k, b] of Object.entries(this.tabButtons)) b.classList.toggle('on', k === this.openTab);
  }

  renderCards(catId) {
    this.cardRow.innerHTML = '';
    if (catId === 'path') {
      PATH_STYLES.forEach((s, i) => {
        const card = el('button', 'card');
        card.innerHTML = `<span class="em">🧱</span><div class="nm">${s.name}</div>
          <div class="pr">${s.cost}/tile</div>`;
        card.onclick = () => this.game.setTool('path', { pathStyle: i });
        card.dataset.path = i;
        this.cardRow.appendChild(card);
      });
      const eraser = el('button', 'card');
      eraser.innerHTML = `<span class="em">🧽</span><div class="nm">Remove Path</div><div class="pr">free</div>`;
      eraser.onclick = () => this.game.setTool('erasePath');
      eraser.dataset.path = 'erase';
      this.cardRow.appendChild(eraser);
      this.refreshCardStates();
      return;
    }

    const items = byCategory(catId).sort((a, b) => a.unlock - b.unlock || a.cost - b.cost);
    for (const d of items) {
      const card = el('button', 'card');
      const locked = !this.park.isUnlocked(d);
      card.dataset.def = d.id;
      card.innerHTML = `
        ${locked ? `<span class="lock">🔒</span>` : ''}
        <span class="em">${d.emoji}</span>
        <div class="nm">${d.name}</div>
        <div class="pr">${formatMoney(d.cost)}</div>`;
      card.title = locked
        ? `Locked — needs park rating ${d.unlock}`
        : `${d.blurb || ''}${d.excitement ? `\nExcitement ${d.excitement.toFixed(1)} · Intensity ${d.intensity.toFixed(1)}` : ''}`;
      card.onclick = () => {
        if (!this.park.isUnlocked(d)) {
          this.toast('🔒', 'Locked', `${d.name} unlocks at park rating ${d.unlock}.`, 'warn');
          return;
        }
        this.game.setTool('build', { defId: d.id });
      };
      this.cardRow.appendChild(card);
    }
    this.refreshCardStates();
  }

  refreshCardStates() {
    const t = this.game.tool;
    for (const card of this.cardRow.children) {
      const id = card.dataset.def;
      if (id) {
        const d = CATALOG[id];
        const locked = !this.park.isUnlocked(d);
        card.classList.toggle('locked', locked);
        card.classList.toggle('sel', t.mode === 'build' && t.defId === id);
        const pr = card.querySelector('.pr');
        if (pr) pr.classList.toggle('cant', !this.park.economy.canAfford(d.cost));
        const lock = card.querySelector('.lock');
        if (!locked && lock) lock.remove();
        else if (locked && !lock) card.insertAdjacentHTML('afterbegin', '<span class="lock">🔒</span>');
      } else if (card.dataset.path !== undefined) {
        const isErase = card.dataset.path === 'erase';
        card.classList.toggle('sel',
          (isErase && t.mode === 'erasePath')
          || (!isErase && t.mode === 'path' && t.pathStyle === Number(card.dataset.path)));
      }
    }
  }

  /* ================================================================== *
   * Inspector
   * ================================================================== */
  _buildInspector() {
    this.inspector = el('div', 'inspector');
    this.inspector.innerHTML = `
      <div class="insp-head">
        <span class="em">🎠</span>
        <div><h3>—</h3><div class="sub"></div></div>
        <button class="insp-close">✕</button>
      </div>
      <div class="insp-body"></div>`;
    this.inspector.querySelector('.insp-close').onclick = () => this.game.select(null);
    this.inspHead = this.inspector.querySelector('.insp-head');
    this.inspBody = this.inspector.querySelector('.insp-body');
    this.rootEl.appendChild(this.inspector);
  }

  setSelection(obj) {
    this.selected = obj;
    this.inspector.classList.toggle('open', !!obj);
    if (obj) this.renderInspector(true);
  }

  renderInspector(full = false) {
    const o = this.selected;
    if (!o) return;
    if (o.def && o.root) this._renderAttraction(o, full);
    else if (o.intensityTolerance !== undefined) this._renderGuest(o);
    else if (o.def && o.def.wage) this._renderStaff(o);
  }

  _renderAttraction(a, full) {
    const d = a.def;
    this.inspHead.querySelector('.em').textContent = d.emoji;
    this.inspHead.querySelector('h3').textContent = d.name;
    this.inspHead.querySelector('.sub').textContent =
      `${TIER[a.level - 1].name} · ${a.statusLabel}`;

    const isRideLike = a.isRide;
    const chips = [];
    if (a.broken) chips.push('<span class="chip bad">Broken down</span>');
    if (!a.connected) chips.push('<span class="chip bad">No path</span>');
    if (a.open && !a.broken) chips.push('<span class="chip good">Open</span>');
    if (!a.open) chips.push('<span class="chip">Closed</span>');
    if (a.mechanicAssigned) chips.push('<span class="chip on">Mechanic en route</span>');
    if (a.level >= 2) chips.push(`<span class="chip on">${TIER[a.level - 1].name}</span>`);

    let html = `<div class="chiprow">${chips.join('')}</div>`;

    html += meter('Condition', a.condition, healthColor(a.condition));
    if (isRideLike) {
      html += meter('Popularity', Math.min(1, a.popularity * 1.4), 'linear-gradient(90deg,#a06cf0,#d0a8ff)');
    }

    html += `<div class="sec-title">Performance</div>`;
    if (isRideLike) {
      html += `<div class="kv"><span class="k">Rating</span><span class="v stars">${stars(a.stars)}</span></div>`;
      html += `<div class="kv"><span class="k">Excitement</span><span class="v">${a.excitement.toFixed(1)}</span></div>`;
      html += `<div class="kv"><span class="k">Intensity</span><span class="v">${a.intensity.toFixed(1)}</span></div>`;
      html += `<div class="kv"><span class="k">Capacity</span><span class="v">${a.capacity} / cycle</span></div>`;
      html += `<div class="kv"><span class="k">Queue</span><span class="v ${a.queue.length > a.capacity * 2 ? 'bad' : ''}">${a.queue.length} waiting</span></div>`;
    }
    html += `<div class="kv"><span class="k">Total customers</span><span class="v">${a.totalGuests.toLocaleString()}</span></div>`;
    html += `<div class="kv"><span class="k">Total income</span><span class="v good">${formatMoneyFull(a.totalIncome)}</span></div>`;
    html += `<div class="kv"><span class="k">Running cost</span><span class="v bad">${a.upkeep.toFixed(0)}/min</span></div>`;

    if (!a.isScenery) {
      html += `<div class="sec-title">${isRideLike ? 'Ticket price' : 'Price'}</div>`;
      html += `<div class="btn-row">
        <button class="btn" data-act="price-down">−</button>
        <button class="btn" style="flex:2" data-act="price-reset">
          <b style="font-size:15px">${a.price === 0 ? 'Free' : formatMoneyFull(a.price)}</b></button>
        <button class="btn" data-act="price-up">+</button>
      </div>
      <div style="font-size:11px;color:var(--dim);margin:-2px 0 8px">Suggested: ${formatMoneyFull(a.suggestedPrice)}</div>`;
    }

    html += `<div class="sec-title">Actions</div>`;
    if (a.broken) {
      html += `<button class="btn primary" data-act="repair">🔧 Emergency repair
        <span class="cost">${formatMoneyFull(a.instantRepairCost())}</span></button>`;
    } else if (a.condition < 0.95 && !a.isScenery) {
      html += `<button class="btn" data-act="repair">🔧 Service now
        <span class="cost">${formatMoneyFull(a.instantRepairCost())}</span></button>`;
    }
    if (a.canUpgrade) {
      const nt = TIER[a.level];
      html += `<button class="btn mint" data-act="upgrade">⬆ Upgrade to ${nt.name}
        <span class="cost">${formatMoneyFull(a.nextUpgradeCost)}</span></button>
        <div style="font-size:11px;color:var(--muted);margin:-2px 0 9px;line-height:1.5">
          +${Math.round((nt.capacity / a.tier.capacity - 1) * 100)}% capacity ·
          +${Math.round((nt.excitement / a.tier.excitement - 1) * 100)}% excitement ·
          better reliability</div>`;
    } else if (!a.isScenery) {
      html += `<div style="font-size:11.5px;color:var(--mint);margin-bottom:9px">★ Fully upgraded</div>`;
    }
    if (!a.isScenery) {
      html += `<button class="btn" data-act="toggle">${a.open ? '⏸ Close to guests' : '▶ Open to guests'}</button>`;
    }
    html += `<button class="btn" data-act="move">📦 Move / rotate
      <span class="cost">${formatMoneyFull(a.moveCost)}</span></button>`;
    if (a.model?.camSeat) {
      html += `<button class="btn sky" data-act="ridecam">🎥 Ride camera</button>`;
    }
    html += `<button class="btn" data-act="focus">🔍 Focus camera</button>`;
    html += `<button class="btn danger" data-act="demolish">🧨 Demolish
      <span class="cost" style="color:inherit">+${formatMoneyFull(a.salvage)}</span></button>`;

    if (d.blurb) {
      html += `<div style="font-size:11.5px;color:var(--muted);margin-top:10px;line-height:1.55">${d.blurb}</div>`;
    }

    this.inspBody.innerHTML = html;
    this.inspBody.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = () => this._attractionAction(a, b.dataset.act);
    });
  }

  _attractionAction(a, act) {
    const g = this.game;
    switch (act) {
      case 'price-up': a.price = Math.min(99, a.price + 1); break;
      case 'price-down': a.price = Math.max(0, a.price - 1); break;
      case 'price-reset': a.price = a.suggestedPrice; break;
      case 'repair': g.repair(a); break;
      case 'upgrade': g.upgrade(a); break;
      case 'toggle': a.open = !a.open; break;
      case 'focus': g.rig.goTo(a.center, Math.max(26, a.radius * 4)); break;
      case 'ridecam': g.enterRideCam(a); break;
      case 'move': g.beginMove(a); return;
      case 'demolish': g.demolish(a); return;
    }
    this.renderInspector();
  }

  _renderGuest(gst) {
    this.inspHead.querySelector('.em').textContent = gst.scale < 0.75 ? '🧒' : '🧑';
    this.inspHead.querySelector('h3').textContent = gst.name;
    this.inspHead.querySelector('.sub').textContent =
      `Guest · ${Math.floor(gst.timeInPark / 60)}m in the park`;

    const mood = gst.happiness > 0.7 ? '😄' : gst.happiness > 0.45 ? '🙂' : gst.happiness > 0.25 ? '😕' : '😠';
    let html = `<div class="chiprow">
      <span class="chip ${gst.happiness > 0.6 ? 'good' : gst.happiness < 0.3 ? 'bad' : ''}">${mood} ${Math.round(gst.happiness * 100)}% happy</span>
      <span class="chip">${gst.state}</span></div>`;

    html += meter('Happiness', gst.happiness, healthColor(gst.happiness));
    html += meter('Hunger', 1 - Math.min(1, gst.hunger), healthColor(1 - Math.min(1, gst.hunger)));
    html += meter('Thirst', 1 - Math.min(1, gst.thirst), healthColor(1 - Math.min(1, gst.thirst)));
    html += meter('Restroom', 1 - Math.min(1, gst.toilet), healthColor(1 - Math.min(1, gst.toilet)));
    html += meter('Energy', gst.energy, healthColor(gst.energy));
    if (gst.nausea > 0.05) html += meter('Nausea', gst.nausea, 'linear-gradient(90deg,#9ede4a,#4caf50)');

    html += `<div class="sec-title">Wallet</div>`;
    html += `<div class="kv"><span class="k">Cash left</span><span class="v ${gst.money < 8 ? 'bad' : 'good'}">${formatMoneyFull(gst.money)}</span></div>`;
    html += `<div class="kv"><span class="k">Spent here</span><span class="v">${formatMoneyFull(gst.spent)}</span></div>`;
    html += `<div class="kv"><span class="k">Rides taken</span><span class="v">${gst.ridden.size}</span></div>`;
    html += `<div class="kv"><span class="k">Thrill appetite</span><span class="v">${gst.intensityTolerance.toFixed(1)}</span></div>`;

    if (gst.thought) {
      html += `<div class="sec-title">Thinking</div>
        <div style="font-size:12px;line-height:1.5;color:var(--text);background:rgba(255,255,255,.05);
        padding:9px 11px;border-radius:10px;border:1px solid var(--stroke)">“${gst.thought}”</div>`;
    }
    const needs = gst.needsSummary;
    if (needs.length) {
      html += `<div class="sec-title">Needs</div><div class="chiprow">${
        needs.map((n) => `<span class="chip bad">${n}</span>`).join('')}</div>`;
    }
    html += `<div class="sec-title">Actions</div>
      <button class="btn" data-act="follow">🎥 Follow this guest</button>`;

    this.inspBody.innerHTML = html;
    const f = this.inspBody.querySelector('[data-act="follow"]');
    if (f) f.onclick = () => this.game.followGuest(gst);
  }

  _renderStaff(s) {
    this.inspHead.querySelector('.em').textContent = s.def.emoji;
    this.inspHead.querySelector('h3').textContent = s.name;
    this.inspHead.querySelector('.sub').textContent = `${s.def.name} · ${s.task}`;
    let html = `<div class="chiprow"><span class="chip on">${s.def.wage}/min wage</span>
      <span class="chip">${s.lifetimeWork} jobs done</span></div>`;
    html += `<div style="font-size:12px;color:var(--muted);line-height:1.55;margin-bottom:10px">${s.def.blurb}</div>`;
    if (s.targetAttraction) {
      html += `<div class="kv"><span class="k">Heading to</span><span class="v">${s.targetAttraction.def.name}</span></div>`;
    }
    html += `<div class="sec-title">Actions</div>
      <button class="btn" data-act="focus">🔍 Focus camera</button>
      <button class="btn danger" data-act="fire">👋 Dismiss</button>`;
    this.inspBody.innerHTML = html;
    this.inspBody.querySelector('[data-act="focus"]').onclick =
      () => this.game.rig.goTo(s.pos, 24);
    this.inspBody.querySelector('[data-act="fire"]').onclick = () => {
      this.park.staff.fire(s);
      this.game.select(null);
      this.toast('👋', 'Staff dismissed', `${s.name} has left the park.`, 'warn');
    };
  }

  /* ================================================================== *
   * Toasts, ticker, floaters
   * ================================================================== */
  _buildToasts() {
    this.toastWrap = el('div', 'toasts');
    this.rootEl.appendChild(this.toastWrap);
  }

  toast(emoji, title, body, kind = 'info', ms = 4800) {
    const t = el('div', 'toast ' + kind);
    t.innerHTML = `<span class="em">${emoji}</span><span class="tx"><b>${title}</b><span>${body}</span></span>`;
    this.toastWrap.appendChild(t);
    const entry = { el: t, until: performance.now() + ms };
    this.toasts.push(entry);
    if (this.toasts.length > 5) this._killToast(this.toasts[0]);
  }

  _killToast(entry) {
    const i = this.toasts.indexOf(entry);
    if (i >= 0) this.toasts.splice(i, 1);
    entry.el.classList.add('out');
    setTimeout(() => entry.el.remove(), 320);
  }

  _buildTicker() {
    const w = el('div', 'ticker');
    const h = el('div', 'ticker-h', '<span>Park log</span>');
    const clear = el('button', '', 'clear');
    clear.onclick = () => { this.tickerBody.innerHTML = ''; };
    h.appendChild(clear);
    w.appendChild(h);
    this.tickerBody = el('div', 'ticker-b');
    w.appendChild(this.tickerBody);
    this.rootEl.appendChild(w);
  }

  pushTicker(m) {
    const row = el('div', 'tick ' + (m.kind || ''));
    row.innerHTML = `<span class="t">${m.clock}</span><span>${m.emoji} ${m.text}</span>`;
    this.tickerBody.appendChild(row);
    while (this.tickerBody.children.length > 40) this.tickerBody.firstChild.remove();
    this.tickerBody.scrollTop = this.tickerBody.scrollHeight;
  }

  _buildWorldLayer() {
    this.worldLayer = el('div', 'worldlabels');
    this.rootEl.appendChild(this.worldLayer);
    this.vignette = el('div', 'vignette');
    this.rootEl.appendChild(this.vignette);

    this.rideCamBar = el('div', 'ridecam');
    this.rideCamBar.innerHTML = `<div class="lab">🎥 Ride camera</div>`;
    const exit = el('button', 'btn', 'Exit (Esc)');
    exit.style.width = '160px';
    exit.onclick = () => this.game.exitRideCam();
    this.rideCamBar.appendChild(exit);
    this.rootEl.appendChild(this.rideCamBar);
  }

  floatMoney(worldPos, amount) {
    if (this.floaters.length > 22) return;
    const f = el('div', 'floater');
    f.textContent = `+${Math.round(amount)}`;
    f.style.color = '#ffd76a';
    this.worldLayer.appendChild(f);
    this.floaters.push({
      el: f,
      pos: new THREE.Vector3(worldPos.x, worldPos.y + 3.2, worldPos.z),
      until: performance.now() + 1500,
    });
  }

  /* ================================================================== *
   * Minimap
   * ================================================================== */
  _buildMinimap() {
    const wrap = el('div', 'minimap');
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = 176;
    this.mapCanvas.height = 176;
    this.mapCanvas.style.width = '176px';
    this.mapCanvas.style.height = '176px';
    wrap.appendChild(this.mapCanvas);
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.mapCanvas.onclick = (e) => {
      const r = this.mapCanvas.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fz = (e.clientY - r.top) / r.height;
      const gx = fx * GRID_W, gz = fz * GRID_H;
      this.game.rig.goTo(new THREE.Vector3(
        this.park.grid.worldX(gx), 0, this.park.grid.worldZ(gz),
      ));
    };
    this.rootEl.appendChild(wrap);
    this._mapTimer = 0;
  }

  drawMinimap() {
    const ctx = this.mapCtx;
    const S = this.mapCanvas.width;
    const cell = S / GRID_W;
    const grid = this.park.grid;

    ctx.fillStyle = '#2f5a34';
    ctx.fillRect(0, 0, S, S);

    // Paths.
    for (let i = 0; i < grid.kind.length; i++) {
      const k = grid.kind[i];
      if (k !== CELL.PATH) continue;
      const x = (i % GRID_W) * cell, z = ((i / GRID_W) | 0) * cell;
      const lit = grid.litter[i];
      ctx.fillStyle = lit > 0.4 ? '#8a7a4a' : '#b9b2a4';
      ctx.fillRect(x, z, cell + 0.6, cell + 0.6);
    }

    // Buildings.
    for (const a of this.park.attractions) {
      const x = a.gx * cell, z = a.gz * cell;
      ctx.fillStyle = a.broken ? '#ff5d6c'
        : a.isRide ? '#ffc23c'
        : a.isShop || a.isFacility ? '#54d4f0'
        : '#5ea64f';
      ctx.fillRect(x, z, a.w * cell, a.h * cell);
    }

    // Guests.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const g of this.park.guests.activeList) {
      const gx = grid.gridX(g.pos.x), gz = grid.gridZ(g.pos.z);
      if (gx < 0 || gz < 0 || gx >= GRID_W || gz >= GRID_H) continue;
      ctx.fillRect(gx * cell, gz * cell, 1.6, 1.6);
    }

    // Camera focus marker.
    const f = this.game.rig.focus;
    const fx = grid.gridX(f.x) * cell, fz = grid.gridZ(f.z) * cell;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    const r = Math.max(8, this.game.rig.distance * cell * 0.09);
    ctx.strokeRect(fx - r, fz - r * 0.75, r * 2, r * 1.5);

    // Border.
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
  }

  /* ================================================================== *
   * Hint bar
   * ================================================================== */
  _buildHint() {
    this.hint = el('div', 'hint');
    this.rootEl.appendChild(this.hint);
  }

  updateHint() {
    const t = this.game.tool;
    let html = '';
    if (t.mode === 'build') {
      const d = CATALOG[t.defId];
      const paved = this.game._placePaved || 0;
      html = `Placing <b>${d.name}</b> — ${formatMoneyFull(d.cost)} credits
        ${paved ? `<span class="sep"></span><span style="color:var(--sky)">🧱 replaces ${paved} path tile${paved === 1 ? '' : 's'}</span>` : ''}
        <span class="sep"></span><kbd>Click</kbd> place
        <span class="sep"></span><kbd>R</kbd> rotate
        <span class="sep"></span><kbd>Esc</kbd> cancel`;
    } else if (t.mode === 'path') {
      html = `Drawing <b>${PATH_STYLES[t.pathStyle].name}</b>
        <span class="sep"></span><kbd>Drag</kbd> to paint
        <span class="sep"></span><kbd>Esc</kbd> done`;
    } else if (t.mode === 'erasePath') {
      html = `<b>Removing paths</b> <span class="sep"></span><kbd>Drag</kbd> to erase
        <span class="sep"></span><kbd>Esc</kbd> done`;
    } else if (t.mode === 'move') {
      const a = this.game.moveTarget;
      html = `Moving <b>${a ? a.def.name : ''}</b> — ${a ? formatMoneyFull(a.moveCost) : 0} credits
        <span class="sep"></span><kbd>Click</kbd> place here
        <span class="sep"></span><kbd>R</kbd> rotate
        <span class="sep"></span><kbd>Esc</kbd> cancel`;
    } else if (t.mode === 'demolish') {
      html = `<b>Demolish</b> — click any ride, shop or decoration
        <span class="sep"></span><kbd>Esc</kbd> done`;
    }
    this.hint.innerHTML = html;
    this.hint.classList.toggle('open', !!html);
  }

  /* ================================================================== *
   * Modals
   * ================================================================== */
  _buildModal() {
    this.modalBg = el('div', 'modal-bg');
    this.modal = el('div', 'modal');
    this.modalBg.appendChild(this.modal);
    this.modalBg.onclick = (e) => { if (e.target === this.modalBg) this.closeModal(); };
    this.rootEl.appendChild(this.modalBg);
  }

  openModal(emoji, title, bodyHtml) {
    this.modal.innerHTML = `
      <div class="modal-head"><span class="em">${emoji}</span><h2>${title}</h2>
        <button class="insp-close" style="margin-left:auto">✕</button></div>
      <div class="modal-body">${bodyHtml}</div>`;
    this.modal.querySelector('.insp-close').onclick = () => this.closeModal();
    this.modalBg.classList.add('open');
    return this.modal.querySelector('.modal-body');
  }

  closeModal() { this.modalBg.classList.remove('open'); }

  get modalOpen() { return this.modalBg.classList.contains('open'); }

  showObjectives() {
    const p = this.park;
    let html = `<p>Complete objectives to earn bonus credits and prove your park is worth visiting.</p><div class="objlist">`;
    for (const o of p.objectives) {
      const v = Math.min(o.value, o.goal);
      const pct = Math.round((v / o.goal) * 100);
      html += `<div class="obj ${o.done ? 'done' : ''}">
        <span class="em">${o.done ? '✅' : o.emoji}</span>
        <span class="tx"><b>${o.name}</b><span>${o.desc}</span></span>
        <span class="pg">${meter('', v / o.goal, o.done ? 'linear-gradient(90deg,#3ddc97,#7ef0bd)' : 'linear-gradient(90deg,#ffc23c,#ff8a3d)',
        `${Math.round(v).toLocaleString()} / ${o.goal.toLocaleString()}`)}</span>
        <span class="rw">+${formatMoney(o.reward)}</span>
      </div>`;
    }
    html += `</div>`;
    if (p.awards.length) {
      html += `<div class="sec-title" style="margin-top:18px">Awards won</div><div class="chiprow">`;
      for (const a of p.awards) html += `<span class="chip good">${a.emoji} ${a.name}</span>`;
      html += `</div>`;
    }
    this.openModal('🏆', 'Objectives', html);
  }

  showFinance() {
    const e = this.park.economy;
    const labels = {
      entry: 'Park entry', rides: 'Ride tickets', shops: 'Shop sales',
      construction: 'Construction', staff: 'Wages', upkeep: 'Ride upkeep',
      marketing: 'Marketing', repairs: 'Repairs',
    };
    const income = ['entry', 'rides', 'shops'];
    const expense = ['staff', 'upkeep', 'marketing', 'repairs'];

    let html = `<div class="grid2" style="margin-bottom:16px">
      <div class="tile"><div class="k">Cash on hand</div><div class="v gold">${formatMoneyFull(e.cash)}</div></div>
      <div class="tile"><div class="k">Operating profit</div>
        <div class="v ${e.profitRate >= 0 ? 'good' : 'bad'}">${e.profitRate >= 0 ? '+' : ''}${Math.round(e.profitRate)}</div>
        <div class="n">${Math.round(e.incomeRate)} in · ${Math.round(e.expenseRate)} out, per minute</div></div>
    </div>`;

    html += `<div class="sec-title">Income (per minute / lifetime)</div>`;
    for (const k of income) {
      html += `<div class="kv"><span class="k">${labels[k]}</span>
        <span class="v good">${Math.round(e.rate[k])} &nbsp;·&nbsp; ${formatMoneyFull(e.total[k])}</span></div>`;
    }
    html += `<div class="sec-title">Running costs (per minute / lifetime)</div>`;
    for (const k of expense) {
      html += `<div class="kv"><span class="k">${labels[k]}</span>
        <span class="v bad">${Math.round(Math.max(0, e.rate[k]))} &nbsp;·&nbsp; ${formatMoneyFull(e.total[k])}</span></div>`;
    }
    html += `<div class="sec-title">Capital</div>
      <div class="kv"><span class="k">Built so far</span>
        <span class="v">${formatMoneyFull(e.total.construction)}</span></div>
      <div style="font-size:10.5px;color:var(--dim);margin-top:4px">
        Construction is a one-off purchase, so it is kept out of the per-minute figure.</div>`;

    if (e.history.length) {
      html += `<div class="sec-title">Last ${e.history.length} days</div>`;
      const max = Math.max(...e.history.map((h) => Math.max(h.income, h.expense)), 1);
      html += `<div style="display:flex;gap:3px;align-items:flex-end;height:74px;
        background:rgba(255,255,255,.03);border-radius:10px;padding:8px;border:1px solid var(--stroke)">`;
      for (const h of e.history.slice(-28)) {
        const ih = Math.max(2, (h.income / max) * 56);
        const eh = Math.max(2, (h.expense / max) * 56);
        html += `<div title="Day ${h.day}: +${Math.round(h.income)} / -${Math.round(h.expense)}"
          style="flex:1;display:flex;gap:1px;align-items:flex-end;min-width:4px">
          <div style="flex:1;height:${ih}px;background:#3ddc97;border-radius:2px"></div>
          <div style="flex:1;height:${eh}px;background:#ff5d6c;border-radius:2px"></div></div>`;
      }
      html += `</div>`;
    }

    html += `<div class="sec-title">Marketing</div>
      <p style="margin-bottom:9px">Campaigns temporarily raise how many guests arrive at the gate.</p>`;
    const camps = [
      ['Local flyers', 900, 180, 0.45],
      ['Radio spot', 2400, 300, 1.0],
      ['National TV', 6500, 480, 2.1],
    ];
    for (const [name, cost, secs, power] of camps) {
      html += `<button class="btn" data-camp="${cost}|${secs}|${power}"
        ${e.canAfford(cost) ? '' : 'disabled'}>📣 ${name}
        <span style="font-size:11px;color:var(--muted);margin-left:6px">+${Math.round(power * 100)}% arrivals · ${Math.round(secs / 60)} min</span>
        <span class="cost">${formatMoneyFull(cost)}</span></button>`;
    }

    const body = this.openModal('📊', 'Park Finances', html);
    body.querySelectorAll('[data-camp]').forEach((b) => {
      b.onclick = () => {
        const [cost, secs, power] = b.dataset.camp.split('|').map(Number);
        if (this.park.startMarketing(cost, secs, power)) {
          this.toast('📣', 'Campaign started', 'Guests are on their way.', 'good');
          this.showFinance();
        }
      };
    });
  }

  showStaff() {
    const sm = this.park.staff;
    let html = `<p>Staff work automatically. Mechanics fix breakdowns, janitors clean litter,
      entertainers cheer up queues, and security stops guests dropping rubbish.</p>`;
    html += `<div class="grid2" style="margin-bottom:14px">
      <div class="tile"><div class="k">Team size</div><div class="v">${sm.count}</div></div>
      <div class="tile"><div class="k">Wage bill</div><div class="v bad">${sm.totalWage()}/min</div></div>
    </div>`;

    for (const t of Object.values(STAFF_TYPES)) {
      const n = sm.countOf(t.id);
      html += `<div class="obj" style="margin-bottom:8px">
        <span class="em">${t.emoji}</span>
        <span class="tx"><b>${t.name} × ${n}</b><span>${t.blurb}</span></span>
        <span style="display:flex;gap:6px">
          <button class="btn" style="width:auto;margin:0;padding:7px 11px" data-fire="${t.id}" ${n ? '' : 'disabled'}>−</button>
          <button class="btn primary" style="width:auto;margin:0;padding:7px 11px" data-hire="${t.id}"
            ${this.park.economy.canAfford(t.hire) ? '' : 'disabled'}>+ ${formatMoney(t.hire)}</button>
        </span></div>`;
    }

    const suggestion = this._staffAdvice();
    if (suggestion) html += `<div style="margin-top:12px;font-size:12px;color:var(--accent)">💡 ${suggestion}</div>`;

    const body = this.openModal('🧑‍🔧', 'Staff', html);
    body.querySelectorAll('[data-hire]').forEach((b) => {
      b.onclick = () => { this.game.hireStaff(b.dataset.hire); this.showStaff(); };
    });
    body.querySelectorAll('[data-fire]').forEach((b) => {
      b.onclick = () => { this.game.fireStaff(b.dataset.fire); this.showStaff(); };
    });
  }

  _staffAdvice() {
    const p = this.park, sm = p.staff;
    if (p.rides.length >= 2 && sm.countOf('mechanic') === 0) return 'You have rides but no mechanic — breakdowns will stay broken.';
    if (p.grid.averageLitter() > 0.28 && sm.countOf('janitor') < 2) return 'Your paths are getting filthy. Hire another janitor.';
    if (p.guests.count > 90 && sm.countOf('entertainer') === 0) return 'With queues this long, an entertainer would keep guests happy.';
    if (p.rides.length > 7 && sm.countOf('mechanic') < 2) return 'One mechanic cannot cover this many rides.';
    return null;
  }

  showParkSettings() {
    const p = this.park;
    let html = `<div class="grid2" style="margin-bottom:16px">
      <div class="tile"><div class="k">Park rating</div><div class="v gold">${Math.round(p.rating)}</div>
        <div class="n">out of 1000</div></div>
      <div class="tile"><div class="k">Guests today</div><div class="v">${p.guests.stats.arrived}</div>
        <div class="n">${p.guests.count} in the park now</div></div>
    </div>`;

    html += `<div class="sec-title">What the rating is made of</div>`;
    const parts = p.ratingParts || {};
    const rows = [
      ['Ride variety', parts.variety, 'More different rides, not more of the same'],
      ['Excitement', parts.excitement, 'Total thrill on offer'],
      ['Guest happiness', parts.happiness, 'How your visitors actually feel'],
      ['Cleanliness', parts.cleanliness, 'Litter on the paths'],
      ['Scenery', parts.beauty, 'Trees, gardens and landmarks along the paths'],
      ['Facilities', parts.facilities, 'Toilets, food and drink per guest'],
    ];
    for (const [name, v, note] of rows) {
      html += meter(name, v || 0, healthColor(v || 0));
      html += `<div style="font-size:10.5px;color:var(--dim);margin:-8px 0 10px">${note}</div>`;
    }

    html += `<div class="sec-title">Entry fee</div>
      <p style="margin-bottom:8px">Higher fees earn more per guest but fewer guests come.
      Guests judge the fee against your park rating.</p>
      <div class="btn-row">
        <button class="btn" data-fee="-2">−2</button>
        <button class="btn" data-fee="-1">−1</button>
        <button class="btn" style="flex:2"><b style="font-size:15px">${p.entryFee === 0 ? 'Free entry' : formatMoneyFull(p.entryFee)}</b></button>
        <button class="btn" data-fee="1">+1</button>
        <button class="btn" data-fee="2">+2</button>
      </div>
      <div style="font-size:11px;color:var(--muted)">Guests currently think a fair price is about
        <b style="color:var(--accent)">${Math.round(p.fairEntryFee())}</b> credits.</div>`;

    html += `<div class="sec-title">Maintenance</div>
      <button class="btn ${p.autoRepair ? 'mint' : ''}" data-autorepair="1">
        ${p.autoRepair ? '✅' : '⬜'} Auto-repair service contract</button>
      <div style="font-size:11px;color:var(--muted);line-height:1.55;margin-bottom:10px">
        Broken rides are fixed automatically after ${p.autoRepairDelay} seconds if no mechanic
        gets there first, charged at a ${Math.round((p.autoRepairPremium - 1) * 100)}% premium over
        a manual repair. Mechanics are still cheaper — this is insurance against downtime.</div>`;

    html += `<div class="sec-title">Graphics quality</div><div class="btn-row">`;
    for (const q of ['low', 'medium', 'high']) {
      html += `<button class="btn ${this.game.engine.quality === q ? 'primary' : ''}" data-q="${q}">${q}</button>`;
    }
    html += `</div>`;

    const body = this.openModal('⚙️', 'Park Management', html);
    body.querySelectorAll('[data-fee]').forEach((b) => {
      b.onclick = () => {
        p.entryFee = Math.max(0, Math.min(60, p.entryFee + Number(b.dataset.fee)));
        this.showParkSettings();
      };
    });
    const ar = body.querySelector('[data-autorepair]');
    if (ar) ar.onclick = () => { p.autoRepair = !p.autoRepair; this.showParkSettings(); };
    body.querySelectorAll('[data-q]').forEach((b) => {
      b.onclick = () => {
        this.game.engine._autoQuality = false;
        this.game.engine.setQuality(b.dataset.q);
        this.showParkSettings();
      };
    });
  }

  showDaySummary(s, day) {
    if (this.modalOpen) return;
    const good = s.profit >= 0;
    const html = `
      <div class="grid2" style="margin-bottom:14px">
        <div class="tile"><div class="k">Income</div><div class="v good">${formatMoneyFull(s.income)}</div></div>
        <div class="tile"><div class="k">Expenses</div><div class="v bad">${formatMoneyFull(s.expense)}</div></div>
        <div class="tile"><div class="k">Profit</div>
          <div class="v ${good ? 'good' : 'bad'}">${good ? '+' : ''}${formatMoneyFull(s.profit)}</div></div>
        <div class="tile"><div class="k">Park rating</div><div class="v gold">${Math.round(this.park.rating)}</div></div>
      </div>
      <div class="sec-title">Where the money went</div>
      ${LEDGER_KEYS.filter((k) => s.breakdown[k] > 0.5).map((k) =>
        `<div class="kv"><span class="k">${k}</span><span class="v">${formatMoneyFull(s.breakdown[k])}</span></div>`).join('')}
      <div style="margin-top:14px">
        <button class="btn primary" id="daynext">Continue to day ${day}</button>
      </div>`;
    const body = this.openModal('📅', `End of day ${day - 1}`, html);
    body.querySelector('#daynext').onclick = () => this.closeModal();
  }

  showSaveLoad() {
    const g = this.game;
    const slots = Save.listSaves();
    const fmtWhen = (t) => {
      if (!t) return '';
      const d = new Date(t);
      const mins = Math.round((Date.now() - t) / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins} min ago`;
      return d.toLocaleString();
    };

    let html = '';
    if (!Save.canStore) {
      html += `<p style="color:var(--danger)">This browser is blocking local storage, so saves
        cannot be kept between sessions. You can still export a save to a file.</p>`;
    } else {
      html += `<p>Progress is kept in this browser. The autosave slot is rewritten every
        ${Math.round(g.autosaveInterval / 60)} minutes and whenever you leave the page.</p>`;
    }

    html += '<div class="objlist">';
    for (const s of slots) {
      const isAuto = s.slot === 'auto';
      const title = isAuto ? 'Autosave' : `Slot ${s.slot.replace('slot', '')}`;
      html += `<div class="obj ${s.empty ? '' : 'done'}">
        <span class="em">${isAuto ? '🔄' : '💾'}</span>
        <span class="tx">
          <b>${title}${s.empty || isAuto ? '' : ` — ${escapeHtml(s.name || 'Untitled')}`}</b>
          <span>${s.empty ? 'Empty'
            : s.stale ? 'Saved by a different version — cannot be loaded'
            : `Day ${s.meta?.day ?? '?'} · ${formatMoneyFull(s.meta?.cash ?? 0)} credits · rating ${s.meta?.rating ?? 0} · ${s.meta?.rides ?? 0} rides · ${fmtWhen(s.savedAt)}`}</span>
        </span>
        <span style="display:flex;gap:6px">
          ${isAuto ? '' : `<button class="btn primary" style="width:auto;margin:0;padding:7px 11px"
              data-save="${s.slot}">Save</button>`}
          <button class="btn" style="width:auto;margin:0;padding:7px 11px"
            data-load="${s.slot}" ${s.empty || s.stale ? 'disabled' : ''}>Load</button>
          <button class="btn danger" style="width:auto;margin:0;padding:7px 11px"
            data-del="${s.slot}" ${s.empty ? 'disabled' : ''}>✕</button>
        </span></div>`;
    }
    html += '</div>';

    html += `<div class="sec-title">Backup</div>
      <div class="btn-row">
        <button class="btn" data-export="1">⬇ Export to file</button>
        <button class="btn" data-import="1">⬆ Import from file</button>
      </div>
      <button class="btn ${g.autosaveEnabled ? 'mint' : ''}" data-autosave="1">
        ${g.autosaveEnabled ? '✅' : '⬜'} Autosave</button>`;

    const body = this.openModal('💾', 'Save & Load', html);

    body.querySelectorAll('[data-save]').forEach((b) => {
      b.onclick = () => {
        const slot = b.dataset.save;
        const existing = slots.find((s) => s.slot === slot);
        if (!existing.empty && !confirm(`Overwrite "${existing.name || 'Untitled'}"?`)) return;
        g.saveGame(slot);
        this.showSaveLoad();
      };
    });
    body.querySelectorAll('[data-load]').forEach((b) => {
      b.onclick = () => {
        if (!confirm('Load this save? Any unsaved progress will be lost.')) return;
        if (g.loadGame(b.dataset.load).ok) this.closeModal();
        else this.showSaveLoad();
      };
    });
    body.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = () => {
        if (!confirm('Delete this save permanently?')) return;
        Save.deleteSave(b.dataset.del);
        this.showSaveLoad();
      };
    });
    body.querySelector('[data-export]').onclick = () => {
      Save.exportFile(g);
      this.toast('⬇', 'Exported', 'Save written to your downloads folder.', 'good');
    };
    body.querySelector('[data-import]').onclick = async () => {
      try {
        const data = await Save.importFile();
        if (!confirm('Load this file? Any unsaved progress will be lost.')) return;
        Save.applySave(g, data);
        this.closeModal();
        this.toast('⬆', 'Imported', `Day ${g.park.day}, ${g.park.rides.length} rides.`, 'good');
      } catch (err) {
        this.toast('⚠️', 'Import failed', err.message, 'bad', 6000);
      }
    };
    body.querySelector('[data-autosave]').onclick = () => {
      g.autosaveEnabled = !g.autosaveEnabled;
      this.showSaveLoad();
    };
  }

  showHelp() {
    this.openModal('❓', 'How to play', `
      <p>Build paths from the entrance, line them with rides and shops, keep everything clean
      and repaired, and the credits follow.</p>
      <div class="sec-title">Camera</div>
      <table class="keytable">
        <tr><td><kbd>W A S D</kbd></td><td>Pan around the park</td></tr>
        <tr><td><kbd>Right-drag</kbd></td><td>Orbit the camera</td></tr>
        <tr><td><kbd>Middle-drag</kbd></td><td>Pan</td></tr>
        <tr><td><kbd>Wheel</kbd></td><td>Zoom in and out</td></tr>
        <tr><td><kbd>Q</kbd> <kbd>E</kbd></td><td>Rotate</td></tr>
        <tr><td><kbd>R</kbd> <kbd>F</kbd></td><td>Tilt up and down</td></tr>
      </table>
      <div class="sec-title">Building</div>
      <table class="keytable">
        <tr><td><kbd>1</kbd>–<kbd>8</kbd></td><td>Open a build category</td></tr>
        <tr><td><kbd>R</kbd></td><td>Rotate the item you are placing</td></tr>
        <tr><td><kbd>X</kbd></td><td>Demolish tool</td></tr>
        <tr><td><kbd>📦 Move / rotate</kbd></td>
          <td>In a ride's panel — pick it up and set it down anywhere for 20% of its
            build cost. <kbd>R</kbd> turns it while you carry it, and a quarter turn
            really does swap the ground it covers. Everything it has earned, its
            upgrade tier and its condition all move with it.</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Cancel the current tool / exit ride cam</td></tr>
        <tr><td><kbd>Click</kbd></td><td>Select a ride, guest or staff member</td></tr>
      </table>
      <div class="sec-title">Game</div>
      <table class="keytable">
        <tr><td><kbd>Space</kbd></td><td>Pause and resume</td></tr>
        <tr><td><kbd>1</kbd>… with <kbd>Ctrl</kbd></td><td>Game speed</td></tr>
        <tr><td><kbd>O</kbd> <kbd>G</kbd> <kbd>T</kbd> <kbd>P</kbd> <kbd>H</kbd></td>
          <td>Objectives · Finances · Staff · Park · Help</td></tr>
        <tr><td><kbd>/</kbd></td><td>Command console (cheats: <code>money</code>, <code>rating</code>,
          <code>unlock</code>, <code>god</code>…)</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Quick-save to slot 1</td></tr>
        <tr><td><kbd>💾</kbd></td><td>Save / load screen. The game also autosaves every two
          minutes and when you close the tab.</td></tr>
      </table>
      <div class="sec-title">Tips that actually matter</div>
      <p style="line-height:1.7">
      • Every ride must touch a path or guests cannot reach it.<br>
      • Rides wear out. One mechanic per 4–5 rides keeps breakdowns rare.<br>
      • Litter tanks your rating faster than anything else — hire janitors early and place bins.<br>
      • Scenery near paths raises happiness, which raises the rating, which brings more guests.<br>
      • Raise ticket prices on rides with permanent long queues; lower them on empty ones.<br>
      • Toilets, food and drink scale with guest count. Keep adding them as you grow.</p>
    `);
  }

  /* ================================================================== *
   * Command console
   * ================================================================== */
  _buildConsole() {
    this.consoleEl = el('div', 'console');
    this.consoleOut = el('div', 'console-out');
    const row = el('div', 'console-in', '<span>/</span>');
    this.consoleInput = el('input');
    this.consoleInput.type = 'text';
    this.consoleInput.spellcheck = false;
    this.consoleInput.autocomplete = 'off';
    this.consoleInput.placeholder = 'type a command, or "help"';
    row.appendChild(this.consoleInput);
    this.consoleEl.append(this.consoleOut, row);
    this.rootEl.appendChild(this.consoleEl);

    this.cmdHistory = [];
    this.cmdIndex = -1;

    this.consoleInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const raw = this.consoleInput.value.trim();
        this.consoleInput.value = '';
        if (!raw) return;
        this.cmdHistory.push(raw);
        this.cmdIndex = this.cmdHistory.length;
        this.cmdPrint(`<span class="echo">&gt; ${escapeHtml(raw)}</span>`);
        try {
          this.runCommand(raw);
        } catch (err) {
          this.cmdPrint(`<span class="err">${escapeHtml(err.message)}</span>`);
        }
      } else if (e.key === 'Escape') {
        this.toggleConsole(false);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.cmdIndex > 0) this.consoleInput.value = this.cmdHistory[--this.cmdIndex] ?? '';
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.cmdIndex < this.cmdHistory.length - 1) {
          this.consoleInput.value = this.cmdHistory[++this.cmdIndex] ?? '';
        } else { this.cmdIndex = this.cmdHistory.length; this.consoleInput.value = ''; }
      }
    });
  }

  cmdPrint(html) {
    const line = el('div', '', html);
    this.consoleOut.appendChild(line);
    while (this.consoleOut.children.length > 120) this.consoleOut.firstChild.remove();
    this.consoleOut.scrollTop = this.consoleOut.scrollHeight;
  }

  toggleConsole(force) {
    const open = force ?? !this.consoleEl.classList.contains('open');
    this.consoleEl.classList.toggle('open', open);
    if (open) {
      if (!this.consoleOut.children.length) {
        this.cmdPrint('<span class="dim">Console ready. <code>help</code> lists commands.</span>');
      }
      this.consoleInput.focus();
    } else {
      this.consoleInput.blur();
    }
  }

  /**
   * Cheat / debug commands. Deliberately forgiving about syntax: a leading
   * slash is optional and most commands accept a bare number.
   */
  runCommand(raw) {
    const p = this.park;
    const g = this.game;
    const parts = raw.replace(/^\//, '').trim().split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();
    const arg = parts[1];
    const num = (fallback) => {
      const n = Number(arg);
      return Number.isFinite(n) ? n : fallback;
    };
    const ok = (msg) => this.cmdPrint(`<span class="ok">${msg}</span>`);
    const err = (msg) => this.cmdPrint(`<span class="err">${msg}</span>`);

    switch (cmd) {
      case 'help': case '?':
        this.cmdPrint(`<span class="dim">
<code>money 50000</code> add credits &nbsp; <code>rating 800</code> set park rating<br>
<code>unlock</code> unlock every item &nbsp; <code>repair</code> fix everything<br>
<code>autorepair on|off</code> &nbsp; <code>clean</code> clear all litter<br>
<code>guests 50</code> spawn guests &nbsp; <code>weather sunny|rain|storm|snow|clear|cloudy</code><br>
<code>time 21.5</code> set hour &nbsp; <code>speed 0..4</code> &nbsp; <code>fee 12</code> entry fee<br>
<code>staff mechanic 3</code> hire &nbsp; <code>open</code>/<code>close</code> all rides<br>
<code>firework</code> &nbsp; <code>god</code> money + rating + unlock<br>
<code>save slot1</code> &nbsp; <code>load slot1</code> &nbsp; <code>saves</code> &nbsp; <code>clear</code>
</span>`);
        break;

      case 'money': case 'credits': case 'cash': {
        const n = num(50000);
        p.economy.cash += n;
        ok(`${n >= 0 ? 'Added' : 'Removed'} ${formatMoneyFull(Math.abs(n))} credits — balance ${formatMoneyFull(p.economy.cash)}.`);
        g.audio.cash();
        break;
      }

      case 'rating': {
        const n = THREE.MathUtils.clamp(num(1000), 0, 1000);
        p.rating = n;
        p._ratingTarget = n;
        ok(`Park rating set to ${Math.round(n)}. (It will drift back toward what the park earns.)`);
        break;
      }

      case 'unlock': case 'unlockall': {
        p.unlockAll = arg !== 'off';
        ok(p.unlockAll ? 'Every catalogue item unlocked.' : 'Unlock override disabled.');
        if (this.openTab) this.renderCards(this.openTab);
        break;
      }

      case 'repair': case 'fix': {
        let n = 0;
        for (const a of p.attractions) {
          if (a.condition < 1 || a.broken) { a.repairAmount(1); a.condition = 1; n++; }
        }
        ok(`Repaired ${n} structure${n === 1 ? '' : 's'}.`);
        break;
      }

      case 'autorepair': {
        p.autoRepair = arg !== 'off' && arg !== 'false' && arg !== '0';
        ok(`Auto-repair ${p.autoRepair ? 'enabled' : 'disabled'}.`);
        break;
      }

      case 'clean': {
        p.grid.litter.fill(0);
        p.paths.refreshLitter();
        ok('All litter removed.');
        break;
      }

      case 'guests': {
        const n = Math.min(400, Math.max(1, num(25)));
        let made = 0;
        for (let i = 0; i < n; i++) if (p.guests.spawnGuest(p)) made++;
        ok(`Spawned ${made} guests at the gate.`);
        break;
      }

      case 'weather': {
        const w = WEATHERS[arg];
        if (!w) { err(`Unknown weather "${arg ?? ''}". Try: ${Object.keys(WEATHERS).join(', ')}`); break; }
        p.weather = w;
        p.weatherTimer = 300;
        g.fx.weather.set(w.mode);
        ok(`Weather set to ${w.name} ${w.emoji}.`);
        break;
      }

      case 'time': case 'hour': {
        const h = num(12);
        p.dayFraction = ((h / 24) % 1 + 1) % 1;
        ok(`Clock set to ${g.sky.clockString()}.`);
        break;
      }

      case 'speed': {
        const n = num(1);
        g.setSpeed(n);
        ok(n === 0 ? 'Paused.' : `Speed ${n}x.`);
        break;
      }

      case 'fee': case 'entry': {
        p.entryFee = Math.max(0, Math.round(num(8)));
        ok(`Entry fee set to ${p.entryFee}. Guests think ${Math.round(p.fairEntryFee())} is fair.`);
        break;
      }

      case 'staff': {
        const type = arg;
        if (!STAFF_TYPES[type]) {
          err(`Unknown staff type. Try: ${Object.keys(STAFF_TYPES).join(', ')}`);
          break;
        }
        const n = Math.max(1, Math.min(20, Number(parts[2]) || 1));
        for (let i = 0; i < n; i++) p.staff.hire(type);
        ok(`Hired ${n} × ${STAFF_TYPES[type].name} (free).`);
        break;
      }

      case 'open': case 'close': {
        const want = cmd === 'open';
        let n = 0;
        for (const a of p.attractions) if (!a.isScenery) { a.open = want; n++; }
        ok(`${want ? 'Opened' : 'Closed'} ${n} attractions.`);
        break;
      }

      case 'firework': case 'fireworks': {
        const n = Math.min(12, Math.max(1, num(5)));
        const c = g.rig.focus;
        for (let i = 0; i < n; i++) {
          setTimeout(() => g.fx.firework({
            x: c.x + (Math.random() - 0.5) * 40, y: 2, z: c.z + (Math.random() - 0.5) * 40,
          }), i * 320);
        }
        ok(`Launching ${n} fireworks.`);
        break;
      }

      case 'god': case 'cheat': {
        p.economy.cash += 1_000_000;
        p.rating = 1000;
        p._ratingTarget = 1000;
        p.unlockAll = true;
        p.autoRepair = true;
        if (this.openTab) this.renderCards(this.openTab);
        ok('God mode: 1,000,000 credits, rating 1000, everything unlocked, auto-repair on.');
        g.audio.chime();
        break;
      }

      case 'save': {
        const slot = arg && Save.SLOTS.includes(arg) ? arg : 'slot1';
        const r = g.saveGame(slot);
        if (r.ok) ok(`Saved to ${slot}.`); else err(r.error);
        break;
      }

      case 'load': {
        const slot = arg && Save.SLOTS.includes(arg) ? arg : 'slot1';
        const r = g.loadGame(slot);
        if (r.ok) ok(`Loaded ${slot}.`); else err(r.error);
        break;
      }

      case 'saves': {
        for (const sl of Save.listSaves()) {
          this.cmdPrint(sl.empty
            ? `<span class="dim"><code>${sl.slot}</code> empty</span>`
            : `<span class="dim"><code>${sl.slot}</code> day ${sl.meta?.day} · ${formatMoneyFull(sl.meta?.cash ?? 0)} · rating ${sl.meta?.rating}</span>`);
        }
        break;
      }

      case 'clear': this.consoleOut.innerHTML = ''; break;

      default:
        err(`Unknown command "${cmd}". Type "help".`);
    }
  }

  /* ================================================================== *
   * Keyboard
   * ================================================================== */
  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const g = this.game;
      if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.game.saveGame('slot1');
        return;
      }
      if (e.code === 'Slash' || e.code === 'Backquote') {
        e.preventDefault();
        this.toggleConsole(true);
        return;
      }
      if (e.code === 'Escape') {
        if (this.consoleEl.classList.contains('open')) { this.toggleConsole(false); return; }
        if (this.modalOpen) this.closeModal();
        else if (g.rig.inRideCam) g.exitRideCam();
        else if (g.tool.mode !== 'select') g.setTool('select');
        else g.select(null);
        return;
      }
      if (e.code === 'Space') { e.preventDefault(); g.togglePause(); return; }
      if (e.ctrlKey) {
        const map = { Digit1: 1, Digit2: 2, Digit3: 4 };
        if (map[e.code]) { g.setSpeed(map[e.code]); return; }
      }
      if (e.code === 'KeyX') { g.setTool(g.tool.mode === 'demolish' ? 'select' : 'demolish'); return; }
      if (e.code === 'KeyO') { this.modalOpen ? this.closeModal() : this.showObjectives(); return; }
      if (e.code === 'KeyT') { this.modalOpen ? this.closeModal() : this.showStaff(); return; }
      if (e.code === 'KeyP') { this.modalOpen ? this.closeModal() : this.showParkSettings(); return; }
      if (e.code === 'KeyH') { this.modalOpen ? this.closeModal() : this.showHelp(); return; }
      if (e.code === 'KeyG' && !this.game.tool.mode.startsWith('build')) {
        this.modalOpen ? this.closeModal() : this.showFinance(); return;
      }
      const digit = /^Digit([1-8])$/.exec(e.code);
      if (digit && !e.ctrlKey) {
        const cat = CATEGORIES[Number(digit[1]) - 1];
        if (cat) this.toggleTab(cat.id);
      }
    });
  }

  /* ================================================================== *
   * Frame update
   * ================================================================== */
  update(dt, camera) {
    const p = this.park;
    const e = p.economy;

    // --- top bar numbers ---
    this.vCash.textContent = formatMoneyFull(e.cash);
    this.vCash.parentElement.parentElement.classList.toggle('neg', e.cash < 0);
    const pr = e.profitRate;
    this.vProfit.textContent = `${pr >= 0 ? '+' : ''}${Math.round(pr)}`;
    this.vProfit.style.color = pr >= 0 ? 'var(--mint)' : 'var(--danger)';
    this.vGuests.textContent = p.guests.count;
    this.vRating.textContent = Math.round(p.rating);
    const hp = p.guests.stats.avgHappiness;
    this.vHappy.textContent = `${Math.round(hp * 100)}%`;
    this.vHappy.style.color = hp > 0.6 ? 'var(--mint)' : hp > 0.35 ? 'var(--accent)' : 'var(--danger)';
    this.vClock.textContent = `${this.game.sky.clockString()} ${p.weather.emoji}`;
    this.clockStat.querySelector('.k').textContent = `Day ${p.day}`;

    for (const { b, val } of this.speedBtns) {
      const active = p.paused ? val === 0 : val === p.timeScale;
      b.classList.toggle('on', active);
    }
    this.btnDemolish.classList.toggle('on', this.game.tool.mode === 'demolish');
    this.btnAutoRepair.classList.toggle('on', p.autoRepair);
    this.btnConsole.classList.toggle('on', this.consoleEl.classList.contains('open'));

    // --- toasts ---
    const now = performance.now();
    for (const t of [...this.toasts]) if (now > t.until) this._killToast(t);

    // --- floaters ---
    for (const f of [...this.floaters]) {
      if (now > f.until) {
        f.el.remove();
        this.floaters.splice(this.floaters.indexOf(f), 1);
        continue;
      }
      this._project(f.pos, camera, f.el);
    }

    // --- world labels ---
    this._updateWorldLabels(camera);

    // --- inspector refresh ---
    this._inspTimer = (this._inspTimer || 0) - dt;
    if (this._inspTimer <= 0 && this.selected) {
      this._inspTimer = 0.4;
      this.renderInspector();
    }

    // --- minimap ---
    this._mapTimer -= dt;
    if (this._mapTimer <= 0) { this._mapTimer = 0.25; this.drawMinimap(); }

    // --- card affordability ---
    this._cardTimer = (this._cardTimer || 0) - dt;
    if (this._cardTimer <= 0) {
      this._cardTimer = 0.5;
      if (this.openTab) this.refreshCardStates();
    }

    this.updateHint();
    this.rideCamBar.classList.toggle('open', this.game.rig.inRideCam);
    this.vignette.classList.toggle('open', this.game.rig.inRideCam);
  }

  _project(pos, camera, element) {
    const v = pos.clone().project(camera);
    if (v.z > 1) { element.style.display = 'none'; return false; }
    element.style.display = '';
    element.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    element.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
    return true;
  }

  /** Floating markers over broken rides and very dirty areas. */
  _updateWorldLabels(camera) {
    const wanted = [];
    for (const a of this.park.attractions) {
      if (a.broken) wanted.push({ key: 'b' + a.id, pos: a.center, y: 4.5, cls: 'alert', text: '⚠️ Broken' });
      else if (!a.connected && !a.isScenery) {
        wanted.push({ key: 'c' + a.id, pos: a.center, y: 4.0, cls: 'dirty', text: '🚧 No path' });
      } else if (a.isRide && a.queue.length > a.capacity * 2.2) {
        wanted.push({ key: 'q' + a.id, pos: a.center, y: 4.0, cls: 'dirty', text: `⏳ ${a.queue.length}` });
      }
    }

    // Reuse pooled DOM nodes to avoid churn.
    while (this._labelPool.length < wanted.length) {
      const d = el('div', 'wl');
      this.worldLayer.appendChild(d);
      this._labelPool.push(d);
    }
    for (let i = 0; i < this._labelPool.length; i++) {
      const node = this._labelPool[i];
      const w = wanted[i];
      if (!w) { node.style.display = 'none'; continue; }
      node.className = 'wl ' + w.cls;
      node.textContent = w.text;
      const p = new THREE.Vector3(w.pos.x, w.y, w.pos.z);
      this._project(p, camera, node);
    }
  }
}
