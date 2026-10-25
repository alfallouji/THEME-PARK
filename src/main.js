/**
 * Entry point: warm up the procedural assets behind the boot screen, then
 * hand control to the game loop.
 */
import './ui/styles.css';
import { Game } from './core/Game.js';
import { CATALOG } from './data/catalog.js';
import * as SaveGame from './sim/SaveGame.js';
import * as T from './gfx/Textures.js';

const bootEl = document.getElementById('boot');
const barEl = bootEl.querySelector('.boot-bar i');
const statusEl = document.getElementById('boot-status');

const STEPS = [
  ['Mixing paint and printing textures…', () => {
    T.grass(); T.dirt(); T.sand();
    T.paving('stone'); T.paving('asphalt'); T.paving('brick'); T.paving('wood');
  }],
  ['Milling timber and pressing steel…', () => {
    T.wood('#a8743f'); T.wood('#b5834a'); T.wood('#8a5a30');
    T.metalPlate(); T.stucco('#e8dfd0');
  }],
  ['Sewing the canopies…', () => {
    T.stripes('#e6455c', '#fff6e8', 24);
    T.stripes('#ffd76a', '#e6455c', 16);
  }],
  ['Filling the lake…', () => { T.waterNormal(); }],
  ['Loading fireworks…', () => { T.softDot(); T.sparkle(); T.cloudPuff(); T.rainDrop(); }],
  ['Landscaping the grounds…', null],   // Game construction happens here
  ['Opening the gates…', null],
];

let game = null;

function setProgress(i) {
  barEl.style.width = `${Math.round(((i + 1) / STEPS.length) * 100)}%`;
  statusEl.textContent = STEPS[Math.min(i, STEPS.length - 1)][0];
}

async function boot() {
  const canvas = document.getElementById('viewport');

  for (let i = 0; i < STEPS.length; i++) {
    setProgress(i);
    // Yield so the boot screen actually paints between steps.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const fn = STEPS[i][1];
    if (fn) fn();
    if (i === 5) game = new Game(canvas, setProgress);
  }

  // Render one frame before revealing, so the first thing seen is the park.
  game.rig.update(0.016);
  game.sky.update(game.park.dayFraction, 0.016, game.rig.focus);
  game.engine.render();

  await new Promise((r) => setTimeout(r, 120));
  bootEl.classList.add('hidden');
  game.start();

  // Expose for debugging from the console and for the screenshot tooling.
  window.__park = game;
  window.__CAT = CATALOG;
  window.__SAVE = SaveGame;
}

boot().catch((err) => {
  console.error(err);
  statusEl.innerHTML = `<span style="color:#ff8e98">Failed to start: ${err.message}</span>`;
  barEl.style.background = '#ff5d6c';
});
