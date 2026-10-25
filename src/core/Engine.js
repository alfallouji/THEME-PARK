/**
 * Renderer, scene graph root and post-processing stack.
 *
 * Pipeline: RenderPass -> UnrealBloom (HDR, pre-tonemap) -> OutputPass
 * (tonemap + sRGB) -> SMAA. Quality auto-scales from the measured frame time
 * so the park stays smooth on integrated GPUs.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

export const QUALITY = {
  low: { shadowMap: 1024, bloom: false, smaa: false, pixelRatio: 1.0, shadowDistance: 70 },
  medium: { shadowMap: 1536, bloom: true, smaa: false, pixelRatio: 1.25, shadowDistance: 90 },
  high: { shadowMap: 2048, bloom: true, smaa: true, pixelRatio: 1.5, shadowDistance: 110 },
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // SMAA pass handles this
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xbcd6ef, 0.0042);

    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.5, 2000);
    this.camera.position.set(52, 44, 52);

    /* ---- Lighting rig ---- */
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a5138, 0.85);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
    this.sun.position.set(60, 90, 40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 420;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Cool fill from the opposite side keeps shadowed faces from going flat black.
    this.fill = new THREE.DirectionalLight(0x93b6ff, 0.5);
    this.fill.position.set(-50, 40, -30);
    this.scene.add(this.fill);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.22);
    this.scene.add(this.ambient);

    /* ---- Post stack ---- */
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // Kept deliberately gentle: Sky raises the strength after dusk, and the
    // threshold stays high enough that lit surfaces never bloom — only actual
    // bulbs and neon do.
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.24, // strength
      0.28, // radius — tight halos, not glowing orbs
      0.92, // threshold
    );
    this.composer.addPass(this.bloomPass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
    this.composer.addPass(this.smaaPass);

    this.quality = 'high';
    this.setQuality(this._autoDetect());

    /* ---- Adaptive quality sampling ---- */
    this._frameTimes = [];
    this._lastAdapt = 0;
    this._autoQuality = true;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  _autoDetect() {
    const mem = navigator.deviceMemory || 8;
    const cores = navigator.hardwareConcurrency || 8;
    if (mem <= 4 || cores <= 4) return 'medium';
    return 'high';
  }

  setQuality(name) {
    if (!QUALITY[name]) return;
    this.quality = name;
    const q = QUALITY[name];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.bloomPass.enabled = q.bloom;
    this.smaaPass.enabled = q.smaa;
    this.resize();
    this.onQualityChange?.(name);
  }

  /** Size the sun's orthographic shadow frustum to the current quality tier. */
  configureShadowFrustum() {
    const d = QUALITY[this.quality].shadowDistance;
    const c = this.sun.shadow.camera;
    c.left = -d; c.right = d; c.top = d; c.bottom = -d;
    c.updateProjectionMatrix();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.setSize(w, h);
    this.configureShadowFrustum();
  }

  /**
   * Keep the shadow camera centred on the view target so the limited shadow
   * frustum always covers what the player is looking at.
   */
  followShadow(target) {
    const dir = new THREE.Vector3(0.55, 0.92, 0.42).normalize();
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
    const dist = 170;
    // Preserve the sun's azimuth (set by the day/night cycle) but re-anchor it.
    const cur = this.sun.position.clone().normalize();
    this.sun.position.copy(target).addScaledVector(cur.lengthSq() > 0.01 ? cur : dir, dist);
  }

  /** Track frame time and drop quality if we're consistently below ~45fps. */
  sampleFrame(dt) {
    if (!this._autoQuality) return;
    this._frameTimes.push(dt);
    if (this._frameTimes.length < 120) return;
    const avg = this._frameTimes.reduce((a, b) => a + b, 0) / this._frameTimes.length;
    this._frameTimes.length = 0;
    const now = performance.now();
    if (now - this._lastAdapt < 8000) return;
    if (avg > 0.0222 && this.quality === 'high') {
      this._lastAdapt = now;
      this.setQuality('medium');
      this.onAutoQuality?.('medium');
    } else if (avg > 0.033 && this.quality === 'medium') {
      this._lastAdapt = now;
      this.setQuality('low');
      this.onAutoQuality?.('low');
    }
  }

  /**
   * Always renders through the composer. Even with bloom and SMAA disabled,
   * OutputPass is what applies tone mapping and the sRGB transfer — going
   * direct to the canvas on low quality would light the park differently.
   */
  render() {
    this.composer.render();
  }
}
