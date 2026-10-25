/**
 * Pooled GPU particle system + weather.
 *
 * One Points cloud backed by a fixed pool serves every effect in the park —
 * grill smoke, flume splashes, fireworks, confetti, coin pops and haunted-house
 * mist. Emitters just claim slots; there is no per-effect allocation, so heavy
 * moments (a fireworks finale over a busy park) don't stutter.
 */
import * as THREE from 'three';
import * as T from './Textures.js';

const POOL = 5000;

const VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;   // particle diameter in world units
  attribute float aLife;   // 1 = just born, 0 = dead
  attribute float aKind;   // 0 smoke, 1 spark, 2 droplet, 3 confetti
  uniform float uPixelScale; // framebufferHeight / (2 * tan(fov/2))
  varying vec3 vColor;
  varying float vAlpha;
  varying float vKind;
  void main() {
    vColor = aColor;
    vKind = aKind;
    float fade;
    if (aKind < 0.5)      fade = smoothstep(0.0, 0.25, aLife) * aLife * 0.55;  // smoke: slow puff
    else if (aKind < 1.5) fade = pow(aLife, 1.6);                              // spark: sharp decay
    else if (aKind < 2.5) fade = smoothstep(0.0, 0.2, aLife);                  // droplet
    else                  fade = smoothstep(0.0, 0.15, aLife);                 // confetti
    vAlpha = fade;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Smoke swells as it dissipates; sparks shrink as they burn out.
    float grow = (aKind < 0.5) ? (1.7 - aLife * 0.7) : (0.4 + aLife * 0.6);
    // Real perspective sizing: aSize is a world-space diameter, so a puff
    // keeps a believable size instead of ballooning when the camera pulls
    // back. Capped so nothing near the lens can fill the screen.
    gl_PointSize = min(aSize * grow * uPixelScale / max(-mv.z, 0.1), 260.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uSpark;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vKind;
  void main() {
    vec4 tex = (vKind > 0.5 && vKind < 1.5)
      ? texture2D(uSpark, gl_PointCoord)
      : texture2D(uMap, gl_PointCoord);
    float a = tex.a * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * tex.rgb, a);
  }
`;

export class Effects {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;

    this.pos = new Float32Array(POOL * 3);
    this.vel = new Float32Array(POOL * 3);
    this.col = new Float32Array(POOL * 3);
    this.size = new Float32Array(POOL);
    this.life = new Float32Array(POOL);
    this.maxLife = new Float32Array(POOL);
    this.kind = new Float32Array(POOL);
    this.drag = new Float32Array(POOL);
    this.grav = new Float32Array(POOL);
    this.cursor = 0;
    this.active = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    geo.setAttribute('aKind', new THREE.BufferAttribute(this.kind, 1));
    geo.setDrawRange(0, POOL);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: T.softDot() },
        uSpark: { value: T.sparkle() },
        uPixelScale: { value: 600 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.scene.add(this.points);
    this.geo = geo;

    // Small pool of lights so fireworks actually illuminate the park.
    this.flashLights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 70, 2);
      l.visible = false;
      this.scene.add(l);
      this.flashLights.push({ light: l, t: 0 });
    }

    this.weather = new Weather(engine);
  }

  /** Claim the next pool slot (oldest-wins ring buffer). */
  _slot() {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % POOL;
    return i;
  }

  _emit(x, y, z, vx, vy, vz, r, g, b, size, life, kind, drag = 0.4, grav = 0) {
    const i = this._slot();
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.size[i] = size;
    this.life[i] = 1;
    this.maxLife[i] = life;
    this.kind[i] = kind;
    this.drag[i] = drag;
    this.grav[i] = grav;
  }

  /* -------------------- public emitters -------------------- */

  /** Rising puff — grills, chimneys, steam, locomotive stacks. */
  smoke(p, scale = 1, color = 0xdddddd) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 3; i++) {
      this._emit(
        p.x + (Math.random() - 0.5) * 0.2 * scale,
        p.y + Math.random() * 0.1,
        p.z + (Math.random() - 0.5) * 0.2 * scale,
        (Math.random() - 0.5) * 0.25, 0.7 + Math.random() * 0.5, (Math.random() - 0.5) * 0.25,
        c.r, c.g, c.b,
        1.15 * scale, 1.6 + Math.random() * 0.8, 0, 0.7, 0,
      );
    }
  }

  /** Low drifting fog for the haunted mansion. */
  mist(p) {
    this._emit(
      p.x, p.y, p.z,
      (Math.random() - 0.5) * 0.4, 0.06, (Math.random() - 0.5) * 0.4,
      0.45, 0.55, 0.75,
      3.6, 3.2 + Math.random(), 0, 0.9, 0,
    );
  }

  /** Water burst — log flume drops and fountain overspill. */
  splash(p, scale = 1) {
    for (let i = 0; i < 38; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.6 + Math.random() * 3.6) * scale;
      this._emit(
        p.x + (Math.random() - 0.5) * 0.6, p.y, p.z + (Math.random() - 0.5) * 0.6,
        Math.cos(a) * sp * 0.55, 2.6 + Math.random() * 4.2, Math.sin(a) * sp * 0.55,
        0.62, 0.86, 1.0,
        0.28 + Math.random() * 0.22, 0.9 + Math.random() * 0.5, 2, 0.25, -11,
      );
    }
    // A soft white cloud of spray on top of the droplets.
    for (let i = 0; i < 10; i++) {
      this._emit(
        p.x + (Math.random() - 0.5) * 1.2, p.y + 0.3, p.z + (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 1.2, 0.8 + Math.random(), (Math.random() - 0.5) * 1.2,
        0.85, 0.94, 1.0, 1.5 * scale, 1.1, 0, 0.6, -1.2,
      );
    }
  }

  /** Full firework shell: flash, burst, trailing embers. */
  firework(p, color) {
    const hue = color !== undefined ? new THREE.Color(color) : new THREE.Color().setHSL(Math.random(), 0.85, 0.6);
    const burstY = p.y + 16 + Math.random() * 12;
    const at = new THREE.Vector3(p.x + (Math.random() - 0.5) * 8, burstY, p.z + (Math.random() - 0.5) * 8);

    // Launch streak.
    for (let i = 0; i < 12; i++) {
      const k = i / 12;
      this._emit(
        p.x + (at.x - p.x) * k, p.y + (at.y - p.y) * k, p.z + (at.z - p.z) * k,
        0, 1.5, 0, 1, 0.85, 0.5, 0.34, 0.35 + k * 0.2, 1, 0.8, 0,
      );
    }

    const shape = Math.random();
    const n = 110;
    for (let i = 0; i < n; i++) {
      let vx, vy, vz;
      const sp = 7 + Math.random() * 6;
      if (shape < 0.35) {
        // Ring burst.
        const a = (i / n) * Math.PI * 2;
        const tilt = (Math.random() - 0.5) * 0.35;
        vx = Math.cos(a) * sp; vy = tilt * sp; vz = Math.sin(a) * sp;
      } else {
        // Spherical burst.
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(1 - u * u);
        vx = Math.cos(a) * r * sp; vy = u * sp; vz = Math.sin(a) * r * sp;
      }
      const tint = hue.clone();
      if (Math.random() < 0.25) tint.offsetHSL(0.12, 0, 0.12);
      this._emit(
        at.x, at.y, at.z, vx, vy, vz,
        tint.r * 1.05, tint.g * 1.05, tint.b * 1.05,
        0.46 + Math.random() * 0.3, 1.5 + Math.random() * 1.1, 1, 0.55, -3.4,
      );
    }
    // Glitter tail.
    for (let i = 0; i < 40; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u) * (2 + Math.random() * 3);
      this._emit(
        at.x, at.y, at.z, Math.cos(a) * r, u * 3, Math.sin(a) * r,
        0.95, 0.9, 0.72, 0.3, 2.4 + Math.random(), 1, 0.4, -2.2,
      );
    }
    this._flash(at, hue);
  }

  _flash(p, color) {
    const slot = this.flashLights.find((f) => f.t <= 0) || this.flashLights[0];
    slot.light.position.copy(p);
    slot.light.color.copy(color);
    slot.light.visible = true;
    slot.t = 0.85;
    slot.max = 0.85;
  }

  /** Celebration burst — objectives completed, new ride opened. */
  confetti(p, count = 60) {
    for (let i = 0; i < count; i++) {
      const c = new THREE.Color().setHSL(Math.random(), 0.9, 0.62);
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 4;
      this._emit(
        p.x, p.y, p.z,
        Math.cos(a) * sp, 4 + Math.random() * 5, Math.sin(a) * sp,
        c.r, c.g, c.b, 0.34 + Math.random() * 0.2, 2.2 + Math.random() * 1.4, 3, 0.5, -6,
      );
    }
  }

  /** Small golden pop when money is collected. */
  coin(p) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      this._emit(
        p.x, p.y, p.z,
        Math.cos(a) * 1.1, 2.2 + Math.random() * 1.5, Math.sin(a) * 1.1,
        1.8, 1.4, 0.4, 0.4, 0.75, 1, 0.5, -4,
      );
    }
  }

  /** Repair sparks from a mechanic's spanner. */
  sparks(p) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3;
      this._emit(
        p.x, p.y, p.z,
        Math.cos(a) * sp, 1.5 + Math.random() * 2.5, Math.sin(a) * sp,
        2.0, 1.3, 0.35, 0.24, 0.5 + Math.random() * 0.3, 1, 0.35, -9,
      );
    }
  }

  /** Puff of dust when something is demolished. */
  dust(p, scale = 1) {
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3;
      this._emit(
        p.x, p.y + 0.3, p.z,
        Math.cos(a) * sp, 0.8 + Math.random() * 1.6, Math.sin(a) * sp,
        0.72, 0.68, 0.6, 1.25 * scale, 1.2 + Math.random(), 0, 0.7, -1.5,
      );
    }
  }

  /** Green sparkle when a janitor cleans a tile. */
  clean(p) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      this._emit(
        p.x + (Math.random() - 0.5) * 1.5, p.y + 0.2, p.z + (Math.random() - 0.5) * 1.5,
        Math.cos(a) * 0.5, 1.2 + Math.random(), Math.sin(a) * 0.5,
        0.5, 1.6, 0.9, 0.32, 0.8, 1, 0.5, -1.5,
      );
    }
  }

  update(dt, camera, sky) {
    // gl_PointSize is in framebuffer pixels, so the scale factor depends on
    // both the drawing buffer height and the current field of view.
    const h = this.engine.renderer.domElement.height;
    this.material.uniforms.uPixelScale.value =
      h / (2 * Math.tan((camera.fov * Math.PI) / 360));

    const pos = this.pos, vel = this.vel, life = this.life;
    let live = 0;
    for (let i = 0; i < POOL; i++) {
      if (life[i] <= 0) continue;
      const i3 = i * 3;
      life[i] -= dt / this.maxLife[i];
      if (life[i] <= 0) { life[i] = 0; this.size[i] = 0; continue; }
      live++;
      const d = 1 - this.drag[i] * dt;
      vel[i3] *= d;
      vel[i3 + 1] = vel[i3 + 1] * d + this.grav[i] * dt;
      vel[i3 + 2] *= d;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      // Particles that hit the ground stop rather than sinking through it.
      if (pos[i3 + 1] < 0.05 && this.kind[i] !== 0) {
        pos[i3 + 1] = 0.05;
        vel[i3 + 1] = 0;
        vel[i3] *= 0.8; vel[i3 + 2] *= 0.8;
        life[i] = Math.min(life[i], 0.25);
      }
    }
    this.active = live;

    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aLife.needsUpdate = true;
    this.geo.attributes.aKind.needsUpdate = true;

    for (const f of this.flashLights) {
      if (f.t > 0) {
        f.t -= dt;
        const k = Math.max(0, f.t / f.max);
        f.light.intensity = k * k * 260;
        if (f.t <= 0) f.light.visible = false;
      }
    }

    this.weather.update(dt, camera, sky);
  }
}

/* ================================================================== *
 * Weather
 * ================================================================== */
export class Weather {
  constructor(engine) {
    this.engine = engine;
    this.mode = 'clear'; // clear | cloudy | rain | storm | snow
    this.intensity = 0;
    this.target = 0;
    this.box = 90;

    const N = 4200;
    this.count = N;
    this.pos = new Float32Array(N * 3);
    this.vel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * this.box * 2;
      this.pos[i * 3 + 1] = Math.random() * 55;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.box * 2;
      this.vel[i] = 0.7 + Math.random() * 0.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    this.mat = new THREE.PointsMaterial({
      map: T.rainDrop(),
      color: 0xcfe4ff,
      size: 0.5,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    engine.scene.add(this.points);
    this.geo = geo;
  }

  set(mode) {
    this.mode = mode;
    this.target = mode === 'rain' ? 0.7 : mode === 'storm' ? 1.0 : mode === 'snow' ? 0.55 : 0;
    if (mode === 'snow') {
      this.mat.map = T.softDot();
      this.mat.size = 0.42;
      this.mat.color.setHex(0xffffff);
    } else {
      this.mat.map = T.rainDrop();
      this.mat.size = 0.55;
      this.mat.color.setHex(0xcfe4ff);
    }
    this.mat.needsUpdate = true;
  }

  update(dt, camera, sky) {
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * 0.4);
    this.points.visible = this.intensity > 0.01;
    if (!this.points.visible) return;

    this.mat.opacity = this.intensity * (this.mode === 'snow' ? 0.85 : 0.55);
    const cx = camera.position.x, cz = camera.position.z;
    const snow = this.mode === 'snow';
    const fall = snow ? 2.6 : 42;
    const sway = snow ? 1.4 : 0.25;
    const t = performance.now() * 0.001;

    const p = this.pos;
    const n = Math.floor(this.count * Math.min(1, this.intensity + 0.15));
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      p[i3 + 1] -= fall * this.vel[i] * dt;
      p[i3] += Math.sin(t * 1.3 + i) * sway * dt;
      p[i3 + 2] += Math.cos(t * 1.1 + i * 0.7) * sway * dt;
      if (p[i3 + 1] < 0) {
        p[i3 + 1] = 48 + Math.random() * 10;
        p[i3] = cx + (Math.random() - 0.5) * this.box * 2;
        p[i3 + 2] = cz + (Math.random() - 0.5) * this.box * 2;
      }
      // Recycle anything that drifts outside the camera's column.
      if (Math.abs(p[i3] - cx) > this.box) p[i3] = cx - Math.sign(p[i3] - cx) * this.box;
      if (Math.abs(p[i3 + 2] - cz) > this.box) p[i3 + 2] = cz - Math.sign(p[i3 + 2] - cz) * this.box;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
  }
}
