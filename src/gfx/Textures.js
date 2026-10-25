/**
 * Procedural texture factory.
 *
 * Every surface in the park is generated at runtime on a 2D canvas rather than
 * loaded from disk: it keeps the build dependency-free, avoids asset licensing,
 * and lets us tint variants (canopy stripes, ride liveries) without shipping a
 * texture per colour.
 */
import * as THREE from 'three';

const cache = new Map();

/** Memoised texture builder. */
function make(key, build) {
  if (cache.has(key)) return cache.get(key);
  const tex = build();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

function canvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function toTex(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

/* ------------------------------------------------------------------ *
 * Noise
 * ------------------------------------------------------------------ */

// Deterministic hash so a given seed always yields the same texture.
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function smooth(t) { return t * t * (3 - 2 * t); }

/** Tiling value noise — wraps cleanly at `period` so textures repeat seamlessly. */
function valueNoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const w = (n) => ((n % period) + period) % period;
  const a = hash2(w(xi), w(yi), seed);
  const b = hash2(w(xi + 1), w(yi), seed);
  const c = hash2(w(xi), w(yi + 1), seed);
  const d = hash2(w(xi + 1), w(yi + 1), seed);
  const u = smooth(xf), v = smooth(yf);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Fractal brownian motion over tiling value noise. */
export function fbm(x, y, octaves, basePeriod, seed) {
  let sum = 0, amp = 0.5, norm = 0, period = basePeriod;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * period, y * period, period, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

/** Paint an fbm field through a colour ramp. */
function noiseFill(ctx, size, opts) {
  const { octaves = 4, period = 4, seed = 1, ramp } = opts;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / size, y / size, octaves, period, seed);
      const [r, g, b] = ramp(n, x, y);
      const i = (y * size + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

/* ------------------------------------------------------------------ *
 * Ground surfaces
 * ------------------------------------------------------------------ */

export function grass() {
  return make('grass', () => {
    const size = 512;
    const [c, ctx] = canvas(size);
    noiseFill(ctx, size, {
      octaves: 5, period: 6, seed: 11,
      ramp: (n) => {
        const t = Math.min(1, Math.max(0, n * 1.35 - 0.16));
        const col = mix([40, 86, 36], [98, 152, 60], t);
        // Patchy sun-bleached areas.
        const dry = Math.max(0, n - 0.74) * 1.6;
        return mix(col, [140, 158, 78], dry);
      },
    });
    // Fine blade speckle so the ground reads as grass up close.
    for (let i = 0; i < 24000; i++) {
      const x = Math.random() * size, y = Math.random() * size;
      const dark = Math.random() < 0.5;
      ctx.fillStyle = dark ? 'rgba(30,62,26,0.5)' : 'rgba(150,196,104,0.42)';
      ctx.fillRect(x, y, 1, Math.random() < 0.7 ? 2 : 1);
    }
    return toTex(c, 26);
  });
}

export function dirt() {
  return make('dirt', () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    noiseFill(ctx, size, {
      octaves: 5, period: 5, seed: 31,
      ramp: (n) => mix([104, 79, 54], [150, 120, 86], n),
    });
    return toTex(c, 16);
  });
}

export function sand() {
  return make('sand', () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    noiseFill(ctx, size, {
      octaves: 4, period: 8, seed: 71,
      ramp: (n) => mix([206, 184, 140], [238, 222, 186], n),
    });
    return toTex(c, 14);
  });
}

/** Paving styles used by the path tool. */
export function paving(style = 'stone') {
  return make('pave-' + style, () => {
    const size = 256;
    const [c, ctx] = canvas(size);

    if (style === 'asphalt') {
      noiseFill(ctx, size, {
        octaves: 5, period: 10, seed: 5,
        ramp: (n) => mix([58, 58, 64], [92, 92, 100], n),
      });
      for (let i = 0; i < 9000; i++) {
        ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '30,30,34' : '132,132,140'},0.5)`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
      }
      return toTex(c, 1);
    }

    if (style === 'wood') {
      noiseFill(ctx, size, {
        octaves: 4, period: 3, seed: 17,
        ramp: (n) => mix([134, 94, 58], [176, 132, 84], n),
      });
      // Boardwalk planks running along one axis.
      const planks = 8, pw = size / planks;
      for (let i = 0; i < planks; i++) {
        ctx.strokeStyle = 'rgba(52,34,18,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(i * pw, 0); ctx.lineTo(i * pw, size); ctx.stroke();
        // Wood grain.
        for (let g = 0; g < 14; g++) {
          ctx.strokeStyle = `rgba(90,60,32,${0.08 + Math.random() * 0.12})`;
          ctx.lineWidth = 1;
          const gx = i * pw + 3 + Math.random() * (pw - 6);
          ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx + (Math.random() - 0.5) * 6, size); ctx.stroke();
        }
      }
      return toTex(c, 1);
    }

    if (style === 'brick') {
      ctx.fillStyle = '#8d5a46';
      ctx.fillRect(0, 0, size, size);
      const rows = 8, bh = size / rows, bw = size / 4;
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * bw * 0.5;
        for (let b = -1; b < 5; b++) {
          const x = b * bw + off, y = r * bh;
          const shade = 0.82 + Math.random() * 0.36;
          ctx.fillStyle = `rgb(${Math.min(255, 168 * shade) | 0},${Math.min(255, 94 * shade) | 0},${Math.min(255, 70 * shade) | 0})`;
          ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
        }
      }
      return toTex(c, 1);
    }

    // Default: light stone slabs.
    noiseFill(ctx, size, {
      octaves: 4, period: 8, seed: 23,
      ramp: (n) => mix([168, 163, 152], [206, 202, 192], n),
    });
    const cells = 4, cs = size / cells;
    ctx.strokeStyle = 'rgba(110,106,98,0.62)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i <= cells; i++) {
      ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cs); ctx.lineTo(size, i * cs); ctx.stroke();
    }
    return toTex(c, 1);
  });
}

/* ------------------------------------------------------------------ *
 * Building materials
 * ------------------------------------------------------------------ */

export function wood(tint = '#a8743f') {
  return make('wood-' + tint, () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    const base = new THREE.Color(tint);
    const c1 = [base.r * 200, base.g * 200, base.b * 200];
    const c2 = [base.r * 275, base.g * 275, base.b * 275];
    noiseFill(ctx, size, {
      octaves: 4, period: 2, seed: 43,
      ramp: (n, x, y) => {
        // Stretch the noise along Y to fake grain direction.
        const g = fbm(x / size * 0.25, y / size * 4, 3, 4, 43);
        return mix(c1, c2, (n * 0.4 + g * 0.6));
      },
    });
    return toTex(c, 1);
  });
}

export function metalPlate() {
  return make('metal', () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    noiseFill(ctx, size, {
      octaves: 4, period: 12, seed: 61,
      ramp: (n) => mix([148, 154, 164], [196, 202, 212], n),
    });
    // Rivet grid.
    ctx.fillStyle = 'rgba(96,102,112,0.7)';
    for (let x = 16; x < size; x += 64) {
      for (let y = 16; y < size; y += 64) {
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    return toTex(c, 1);
  });
}

/** Radial candy stripes — canopies, big tops, carousel roofs. */
export function stripes(a = '#e6455c', b = '#fff6e8', count = 16) {
  return make(`stripe-${a}-${b}-${count}`, () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = a;
    const w = size / count;
    for (let i = 0; i < count; i += 2) ctx.fillRect(i * w, 0, w, size);
    return toTex(c, 1);
  });
}

/** Lit windows for buildings; `night` turns most of them on. */
export function windows(night = false) {
  return make('win-' + night, () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    ctx.fillStyle = night ? '#101826' : '#2c3a52';
    ctx.fillRect(0, 0, size, size);
    const cols = 6, rows = 6, w = size / cols, h = size / rows;
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        const on = night && Math.random() < 0.62;
        ctx.fillStyle = on
          ? `rgba(255,${200 + Math.random() * 40 | 0},${120 + Math.random() * 60 | 0},1)`
          : 'rgba(120,150,185,0.55)';
        ctx.fillRect(x * w + w * 0.22, y * h + h * 0.18, w * 0.56, h * 0.5);
      }
    }
    return toTex(c, 1);
  });
}

/* ------------------------------------------------------------------ *
 * Sprite maps for particles
 * ------------------------------------------------------------------ */

function spriteTex(key, draw, size = 128) {
  return make(key, () => {
    const [c, ctx] = canvas(size);
    draw(ctx, size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** Soft radial blob — smoke, dust, glow. */
export function softDot() {
  return spriteTex('soft', (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

/** Four-point sparkle — fireworks, ride lights, coin pickups. */
export function sparkle() {
  return spriteTex('sparkle', (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(s / 2, 6); ctx.lineTo(s / 2, s - 6);
    ctx.moveTo(6, s / 2); ctx.lineTo(s - 6, s / 2);
    ctx.stroke();
  });
}

/** Cartoon cloud puff used for the sky layer. */
export function cloudPuff() {
  return spriteTex('cloud', (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }, 256);
}

/** Rain streak. */
export function rainDrop() {
  return spriteTex('rain', (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(190,220,255,0)');
    g.addColorStop(0.5, 'rgba(210,235,255,0.85)');
    g.addColorStop(1, 'rgba(190,220,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(s * 0.42, 0, s * 0.16, s);
  }, 64);
}

/** Water normal map — two interfering ripple fields. */
export function waterNormal() {
  const key = 'waternrm';
  if (cache.has(key)) return cache.get(key);
  const size = 256;
  const [c, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  const h = (x, y) =>
    Math.sin((x / size) * Math.PI * 8 + Math.cos((y / size) * Math.PI * 5) * 1.4) * 0.5 +
    Math.sin((y / size) * Math.PI * 11 - (x / size) * Math.PI * 3) * 0.3 +
    fbm(x / size, y / size, 3, 8, 91) * 0.7;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h((x + 1) % size, y) - h((x - 1 + size) % size, y);
      const dy = h(x, (y + 1) % size) - h(x, (y - 1 + size) % size);
      const n = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize();
      const i = (y * size + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = toTex(c, 6);
  t.colorSpace = THREE.NoColorSpace; // normal maps are linear data
  cache.set(key, t);
  return t;
}

/** Generic bumpy roughness/normal source for stucco-ish walls. */
export function stucco(tint = '#e8dfd0') {
  return make('stucco-' + tint, () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    const base = new THREE.Color(tint);
    noiseFill(ctx, size, {
      octaves: 5, period: 16, seed: 7,
      ramp: (n) => mix(
        [base.r * 205, base.g * 205, base.b * 205],
        [base.r * 262, base.g * 262, base.b * 262],
        n,
      ),
    });
    return toTex(c, 1);
  });
}

/** Text/label texture — ride signage and shop boards. */
export function signboard(text, bg = '#1d2740', fg = '#ffd76a') {
  return make(`sign-${text}-${bg}-${fg}`, () => {
    const w = 512, h = 128;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, '#0d1425');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg; ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = fg;
    ctx.font = 'bold 58px "Baloo 2", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = fg; ctx.shadowBlur = 18;
    ctx.fillText(text.slice(0, 16).toUpperCase(), w / 2, h / 2 + 3);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function disposeAll() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
