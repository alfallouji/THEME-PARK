/**
 * Sky dome, celestial bodies and the day/night lighting cycle.
 *
 * `update(dayFraction)` is the single source of truth for the park's mood: it
 * drives sun position, light colours and intensity, fog, star opacity and the
 * bloom strength that makes the night-time neon pop.
 */
import * as THREE from 'three';
import * as T from './Textures.js';

const SKY_VERT = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(wp.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunTint;
  uniform float uSunIntensity;
  uniform float uStarFade;
  varying vec3 vWorldDir;

  // Cheap hash-based starfield sampled in direction space.
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float stars(vec3 dir) {
    vec3 s = dir * 180.0;
    vec3 c = floor(s);
    float h = hash(c);
    if (h < 0.991) return 0.0;
    vec3 f = fract(s) - 0.5;
    float d = length(f);
    float tw = 0.55 + 0.45 * sin(h * 120.0);
    return smoothstep(0.42, 0.0, d) * tw;
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float h = dir.y;

    // Vertical gradient: ground haze -> horizon -> zenith.
    float up = clamp(h, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(up, 0.42));
    col = mix(col, uGround, smoothstep(0.0, -0.22, h));

    // Sun disc + surrounding glow. Kept modest on purpose: the bloom pass
    // multiplies anything bright here, and an over-hot disc smears into a
    // white blob across half the screen whenever it enters frame.
    float sd = max(dot(dir, uSunDir), 0.0);
    col += uSunTint * pow(sd, 48.0) * 0.22 * uSunIntensity;
    col += uSunTint * pow(sd, 2600.0) * 1.5 * uSunIntensity;
    // Warm scatter band near the horizon on the sun's side.
    col += uSunTint * pow(sd, 4.0) * 0.10 * uSunIntensity * (1.0 - up);

    // Stars fade in after dusk, masked below the horizon.
    float st = stars(dir) * uStarFade * smoothstep(-0.02, 0.18, h);
    col += vec3(st);

    gl_FragColor = vec4(col, 1.0);
  }
`;

const C = (hex) => new THREE.Color(hex);

/** Keyframed sky/light palette across the 24h cycle. */
const KEYS = [
  { t: 0.00, zen: C(0x080c1a), hor: C(0x131c33), gnd: C(0x080b14), sun: C(0x2a3a66), amb: 0.20, sunI: 0.06, hemi: 0.52, fog: C(0x0e1526), exp: 1.18 },
  { t: 0.20, zen: C(0x16233f), hor: C(0x3a3352), gnd: C(0x161a28), sun: C(0x6a5a86), amb: 0.22, sunI: 0.22, hemi: 0.60, fog: C(0x232a44), exp: 1.16 },
  { t: 0.26, zen: C(0x2f5a94), hor: C(0xf09a62), gnd: C(0x3a3040), sun: C(0xffb072), amb: 0.20, sunI: 1.70, hemi: 0.62, fog: C(0xdba784), exp: 1.10 },
  { t: 0.33, zen: C(0x4e93d8), hor: C(0xbdd8f0), gnd: C(0x5a6a70), sun: C(0xffe0b4), amb: 0.22, sunI: 2.70, hemi: 0.82, fog: C(0xc4d9ee), exp: 1.05 },
  { t: 0.50, zen: C(0x3f86e0), hor: C(0xc9e2f7), gnd: C(0x6b7a80), sun: C(0xfff4e0), amb: 0.24, sunI: 3.30, hemi: 0.95, fog: C(0xbcd6ef), exp: 1.00 },
  { t: 0.68, zen: C(0x4a8fd6), hor: C(0xd6dcea), gnd: C(0x67717c), sun: C(0xffeccb), amb: 0.23, sunI: 2.90, hemi: 0.88, fog: C(0xc3d4e8), exp: 1.03 },
  { t: 0.76, zen: C(0x2d5a96), hor: C(0xf2834e), gnd: C(0x40323c), sun: C(0xff9a54), amb: 0.20, sunI: 1.90, hemi: 0.62, fog: C(0xdb9a76), exp: 1.10 },
  { t: 0.82, zen: C(0x1a2a52), hor: C(0x6b4a6e), gnd: C(0x1c1e2c), sun: C(0x8a6a94), amb: 0.15, sunI: 0.40, hemi: 0.40, fog: C(0x36304a), exp: 1.16 },
  { t: 1.00, zen: C(0x080c1a), hor: C(0x131c33), gnd: C(0x080b14), sun: C(0x2a3a66), amb: 0.20, sunI: 0.06, hemi: 0.52, fog: C(0x0e1526), exp: 1.18 },
];

function sample(t) {
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (t >= KEYS[i].t && t <= KEYS[i + 1].t) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const span = Math.max(1e-5, b.t - a.t);
  const k = (t - a.t) / span;
  return {
    zen: a.zen.clone().lerp(b.zen, k),
    hor: a.hor.clone().lerp(b.hor, k),
    gnd: a.gnd.clone().lerp(b.gnd, k),
    sun: a.sun.clone().lerp(b.sun, k),
    fog: a.fog.clone().lerp(b.fog, k),
    amb: a.amb + (b.amb - a.amb) * k,
    sunI: a.sunI + (b.sunI - a.sunI) * k,
    hemi: a.hemi + (b.hemi - a.hemi) * k,
    exp: a.exp + (b.exp - a.exp) * k,
  };
}

export class Sky {
  constructor(engine) {
    this.engine = engine;
    this.dayFraction = 0.36; // start mid-morning
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.nightAmount = 0;

    const geo = new THREE.SphereGeometry(900, 40, 24);
    this.uniforms = {
      uZenith: { value: C(0x3f86e0) },
      uHorizon: { value: C(0xc9e2f7) },
      uGround: { value: C(0x6b7a80) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunTint: { value: C(0xfff4e0) },
      uSunIntensity: { value: 1 },
      uStarFade: { value: 0 },
    };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    engine.scene.add(this.mesh);

    this._buildClouds();
    this._buildMoon();
    this._buildEnvironment();
  }

  /**
   * Image-based lighting from the sky itself.
   *
   * Without an environment map every metal surface in the park — coaster
   * track, wheel spokes, railings — renders almost black, because metals have
   * no diffuse response and nothing to reflect. A small PMREM cubemap baked
   * from a sky-only scene fixes that for a few ms, refreshed only when the
   * sky has actually changed.
   */
  _buildEnvironment() {
    this.pmrem = new THREE.PMREMGenerator(this.engine.renderer);
    this.pmrem.compileEquirectangularShader();

    // A second dome sharing the same material, so it tracks the sky uniforms.
    this.envScene = new THREE.Scene();
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(100, 24, 16), this.mesh.material);
    this.envScene.add(envDome);

    this.envTarget = null;
    this._envKey = -99;
    this._refreshEnvironment();
    this.engine.scene.environmentIntensity = 0.75;
  }

  _refreshEnvironment() {
    const prev = this.envTarget;
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 500);
    this.engine.scene.environment = this.envTarget.texture;
    prev?.dispose();
  }

  _buildClouds() {
    const tex = T.cloudPuff();
    const count = 46;
    this.clouds = new THREE.Group();
    this.clouds.renderOrder = -900;
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.55, depthWrite: false, fog: false,
    });
    this.cloudMat = mat;
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(mat.clone());
      const ang = Math.random() * Math.PI * 2;
      const rad = 300 + Math.random() * 420;
      // A sprite is centred on its position, so a 120-unit puff reaches 60
      // units below its anchor. Keep them high enough that the bottom edge
      // never dips into the park.
      const sc = 70 + Math.random() * 110;
      const h = sc * (0.4 + Math.random() * 0.2);
      s.position.set(Math.cos(ang) * rad, 220 + Math.random() * 150 + h * 0.5, Math.sin(ang) * rad);
      s.scale.set(sc, h, 1);
      s.material.opacity = 0.14 + Math.random() * 0.2;
      s.userData.baseOpacity = s.material.opacity;
      this.clouds.add(s);
    }
    this.engine.scene.add(this.clouds);
  }

  _buildMoon() {
    const mat = new THREE.SpriteMaterial({
      map: T.softDot(), color: 0xdfe8ff, transparent: true,
      opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    });
    this.moon = new THREE.Sprite(mat);
    this.moon.scale.setScalar(70);
    this.moon.renderOrder = -950;
    this.engine.scene.add(this.moon);
  }

  /** @param {number} f day fraction in [0,1): 0 = midnight, 0.5 = noon. */
  update(f, dt, cameraTarget) {
    this.dayFraction = f;
    const s = sample(f);

    // Sun arcs east -> zenith -> west; tilted so shadows are never perfectly axial.
    const ang = (f - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(ang) * 0.86, Math.sin(ang), 0.34).normalize();

    const elev = this.sunDir.y;
    this.nightAmount = THREE.MathUtils.clamp(1 - (elev + 0.16) / 0.34, 0, 1);

    // --- Sky dome ---
    this.uniforms.uZenith.value.copy(s.zen);
    this.uniforms.uHorizon.value.copy(s.hor);
    this.uniforms.uGround.value.copy(s.gnd);
    this.uniforms.uSunTint.value.copy(s.sun);
    this.uniforms.uSunDir.value.copy(this.sunDir);
    this.uniforms.uSunIntensity.value = THREE.MathUtils.clamp(elev * 2.2 + 0.25, 0, 1.6);
    this.uniforms.uStarFade.value = this.nightAmount;

    // --- Scene lighting ---
    const e = this.engine;
    e.sun.color.copy(s.sun);
    e.sun.intensity = s.sunI;
    e.hemi.intensity = s.hemi;
    e.hemi.color.copy(s.zen).lerp(new THREE.Color(0xffffff), 0.45);
    e.ambient.intensity = s.amb;
    e.fill.intensity = 0.16 + (1 - this.nightAmount) * 0.38;
    e.renderer.toneMappingExposure = s.exp;

    // Sun casts from its sky direction, anchored near the camera focus so the
    // shadow frustum always covers the visible park.
    const anchor = cameraTarget || new THREE.Vector3();
    e.sun.position.copy(anchor).addScaledVector(this.sunDir, 190);
    e.sun.target.position.copy(anchor);
    e.sun.target.updateMatrixWorld();
    // Below the horizon the directional light would light the underside of
    // everything, so shut it off and let hemisphere + ambient carry the night.
    e.sun.visible = elev > -0.04;

    // --- Fog ---
    // Light enough to give depth without draining colour from the park.
    e.scene.fog.color.copy(s.fog);
    e.scene.fog.density = 0.0018 + this.nightAmount * 0.0014;

    // --- Bloom: neon glow after dusk, barely there in daylight ---
    // Strength and threshold are both kept conservative: dozens of bulbs are
    // visible at once, and their halos accumulate.
    e.bloomPass.strength = 0.2 + this.nightAmount * 0.18;
    e.bloomPass.threshold = 0.98 - this.nightAmount * 0.2;

    // --- Clouds ---
    this.clouds.rotation.y += dt * 0.004;
    const cloudTint = s.hor.clone().lerp(new THREE.Color(0xffffff), 0.55);
    for (const c of this.clouds.children) {
      c.material.color.copy(cloudTint);
      c.material.opacity = c.userData.baseOpacity * (1 - this.nightAmount * 0.55);
    }
    if (cameraTarget) this.clouds.position.set(cameraTarget.x, 0, cameraTarget.z);

    // --- Moon opposite the sun ---
    const md = this.sunDir.clone().negate();
    this.moon.position.copy(anchor).addScaledVector(md, 700);
    this.moon.material.opacity = this.nightAmount * 0.85 * Math.max(0, md.y + 0.1);

    // --- Re-bake the reflection probe when the sky has moved enough ---
    // Quantising the time of day keeps this to roughly one bake per in-game
    // half hour rather than one per frame.
    const key = Math.round(f * 48);
    if (key !== this._envKey) {
      this._envKey = key;
      this._refreshEnvironment();
    }
    this.engine.scene.environmentIntensity = 0.85 - this.nightAmount * 0.45;
  }

  /** Human-readable clock for the HUD. */
  clockString() {
    const total = this.dayFraction * 24;
    let h = Math.floor(total);
    const m = Math.floor((total - h) * 60);
    const ampm = h < 12 ? 'AM' : 'PM';
    let hh = h % 12; if (hh === 0) hh = 12;
    return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  isNight() { return this.nightAmount > 0.45; }
}
