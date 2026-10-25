/**
 * RTS-style camera: orbit + pan + zoom around a ground focus point, plus a
 * first-person "ride cam" that rides along with any attraction.
 *
 * Controls
 *   WASD / arrows ....... pan
 *   right-drag .......... orbit
 *   middle-drag ......... pan
 *   wheel ............... zoom (toward the cursor)
 *   Q / E ............... rotate
 *   R / F ............... pitch
 */
import * as THREE from 'three';
import { WORLD_HALF } from '../world/Grid.js';

const PAN_LIMIT = WORLD_HALF + 30;

export class CameraRig {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;

    this.focus = new THREE.Vector3(0, 0, 34);
    this.targetFocus = this.focus.clone();
    this.distance = 62;
    this.targetDistance = 62;
    this.azimuth = Math.PI;          // looking north from the entrance
    this.targetAzimuth = Math.PI;
    this.polar = 0.92;               // radians from vertical
    this.targetPolar = 0.92;

    this.minDistance = 10;
    this.maxDistance = 190;
    this.minPolar = 0.18;
    this.maxPolar = 1.38;

    this.panSpeed = 48;
    this.enabled = true;

    // Ride cam.
    this.rideTarget = null;
    this.rideBlend = 0;
    this.rideOffset = new THREE.Vector3(0, 0.6, -2.2);
    this._rideLookAt = new THREE.Vector3();
    this._camWorld = new THREE.Vector3();

    this.keys = new Set();
    this._dragging = null;
    this._last = { x: 0, y: 0 };
    this._shakeTime = 0;
    this._shakeMag = 0;

    this._bind();
  }

  _bind() {
    const dom = this.dom;

    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.button === 2) { this._dragging = 'orbit'; }
      else if (e.button === 1) { this._dragging = 'pan'; e.preventDefault(); }
      else return;
      this._last.x = e.clientX; this._last.y = e.clientY;
      dom.setPointerCapture?.(e.pointerId);
    });

    window.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._last.x;
      const dy = e.clientY - this._last.y;
      this._last.x = e.clientX; this._last.y = e.clientY;
      if (this._dragging === 'orbit') {
        this.targetAzimuth -= dx * 0.0055;
        this.targetPolar = THREE.MathUtils.clamp(this.targetPolar - dy * 0.0042, this.minPolar, this.maxPolar);
      } else {
        this._panScreen(-dx, -dy);
      }
    });

    window.addEventListener('pointerup', (e) => {
      this._dragging = null;
      this.dom.releasePointerCapture?.(e.pointerId);
    });

    dom.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const factor = Math.exp(e.deltaY * 0.0012);
      this.targetDistance = THREE.MathUtils.clamp(
        this.targetDistance * factor, this.minDistance, this.maxDistance,
      );
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Convert a screen-space drag into a world-space pan on the ground plane. */
  _panScreen(dx, dy) {
    const scale = this.distance * 0.0016;
    const sinA = Math.sin(this.azimuth), cosA = Math.cos(this.azimuth);
    // Screen right maps to world (cosA, -sinA); screen up maps to the forward axis.
    this.targetFocus.x += (dx * cosA - dy * sinA) * scale;
    this.targetFocus.z += (dx * sinA + dy * cosA) * scale;
    this._clampFocus();
  }

  _clampFocus() {
    this.targetFocus.x = THREE.MathUtils.clamp(this.targetFocus.x, -PAN_LIMIT, PAN_LIMIT);
    this.targetFocus.z = THREE.MathUtils.clamp(this.targetFocus.z, -PAN_LIMIT, PAN_LIMIT);
  }

  /** Smoothly move the camera to look at a world point. */
  goTo(point, distance) {
    this.targetFocus.set(point.x, 0, point.z);
    if (distance) this.targetDistance = THREE.MathUtils.clamp(distance, this.minDistance, this.maxDistance);
    this._clampFocus();
  }

  enterRideCam(attraction) {
    if (!attraction?.model?.camSeat) return false;
    this.rideTarget = attraction;
    this._savedDistance = this.targetDistance;
    return true;
  }

  exitRideCam() {
    if (!this.rideTarget) return;
    const a = this.rideTarget;
    this.rideTarget = null;
    this.targetFocus.set(a.center.x, 0, a.center.z);
    this.targetDistance = this._savedDistance || 50;
  }

  get inRideCam() { return !!this.rideTarget || this.rideBlend > 0.01; }

  shake(magnitude, duration = 0.4) {
    this._shakeMag = Math.max(this._shakeMag, magnitude);
    this._shakeTime = Math.max(this._shakeTime, duration);
  }

  update(dt) {
    // --- keyboard pan ---
    if (this.enabled && !this.rideTarget) {
      let fx = 0, fz = 0;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) fz -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) fz += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) fx -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) fx += 1;
      if (fx || fz) {
        const len = Math.hypot(fx, fz);
        fx /= len; fz /= len;
        const boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 2.4 : 1;
        const sp = this.panSpeed * boost * dt * (this.distance / 60);
        const sinA = Math.sin(this.azimuth), cosA = Math.cos(this.azimuth);
        this.targetFocus.x += (fx * cosA - fz * sinA) * sp;
        this.targetFocus.z += (fx * sinA + fz * cosA) * sp;
        this._clampFocus();
      }
      if (this.keys.has('KeyQ')) this.targetAzimuth += dt * 1.3;
      if (this.keys.has('KeyE')) this.targetAzimuth -= dt * 1.3;
      if (this.keys.has('KeyR')) this.targetPolar = Math.max(this.minPolar, this.targetPolar - dt * 0.9);
      if (this.keys.has('KeyF')) this.targetPolar = Math.min(this.maxPolar, this.targetPolar + dt * 0.9);
    }

    // --- smoothing ---
    const k = 1 - Math.pow(0.0015, dt);
    this.focus.lerp(this.targetFocus, k);
    this.distance += (this.targetDistance - this.distance) * k;
    this.azimuth += (this.targetAzimuth - this.azimuth) * k;
    this.polar += (this.targetPolar - this.polar) * k;

    // --- ride cam blend ---
    const wantRide = this.rideTarget ? 1 : 0;
    this.rideBlend += (wantRide - this.rideBlend) * Math.min(1, dt * 3.4);
    if (this.rideBlend < 0.001) this.rideBlend = 0;

    // Orbit position.
    const sp = Math.sin(this.polar), cp = Math.cos(this.polar);
    const orbit = new THREE.Vector3(
      this.focus.x + Math.sin(this.azimuth) * sp * this.distance,
      this.focus.y + cp * this.distance + 2,
      this.focus.z + Math.cos(this.azimuth) * sp * this.distance,
    );
    let lookAt = this.focus.clone();

    if (this.rideBlend > 0) {
      const seat = this.rideTarget?.model?.camSeat;
      if (seat) {
        seat.getWorldPosition(this._camWorld);
        // Sit just behind and above the seat, looking where it is heading.
        const q = new THREE.Quaternion();
        seat.getWorldQuaternion(q);
        const back = new THREE.Vector3(0, 0.75, -2.0).applyQuaternion(q);
        const fwd = new THREE.Vector3(0, 0.35, 6).applyQuaternion(q);
        const ridePos = this._camWorld.clone().add(back);
        ridePos.y = Math.max(ridePos.y, 0.6);
        this._rideLookAt.copy(this._camWorld).add(fwd);
        orbit.lerp(ridePos, this.rideBlend);
        lookAt.lerp(this._rideLookAt, this.rideBlend);
      }
    }

    // --- shake ---
    if (this._shakeTime > 0) {
      this._shakeTime -= dt;
      const m = this._shakeMag * Math.max(0, this._shakeTime);
      orbit.x += (Math.random() - 0.5) * m;
      orbit.y += (Math.random() - 0.5) * m;
      orbit.z += (Math.random() - 0.5) * m;
      if (this._shakeTime <= 0) this._shakeMag = 0;
    }

    this.camera.position.copy(orbit);
    this.camera.lookAt(lookAt);

    // Pull the near plane in when close to the ground so nothing clips.
    const desiredFov = this.rideBlend > 0.5 ? 62 : 48;
    if (Math.abs(this.camera.fov - desiredFov) > 0.1) {
      this.camera.fov += (desiredFov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
  }
}
