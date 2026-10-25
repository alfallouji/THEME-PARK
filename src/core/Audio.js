/**
 * Procedural audio — every sound is synthesised with WebAudio, so the game
 * ships with no audio files and nothing to fail to load.
 *
 * The context stays suspended until the first user gesture, per browser
 * autoplay policy.
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.ready = false;
    this._ambience = null;
    this.volume = 0.5;
  }

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    this.ambBus = this.ctx.createGain();
    this.ambBus.gain.value = 0.0;
    this.ambBus.connect(this.master);

    this._startAmbience();
    this.ready = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Layered pink-ish noise + a soft pad: reads as distant crowd and machinery. */
  _startAmbience() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 620;
    filt.Q.value = 0.4;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(filt.frequency);
    lfo.start();

    src.connect(filt).connect(this.ambBus);
    src.start();
    this._ambience = { src, filt };
  }

  /** Crowd level tracks guest count; night quietens the park. */
  setAmbience(guestCount, night) {
    if (!this.ready) return;
    const target = Math.min(0.28, 0.02 + guestCount / 1400) * (1 - night * 0.55);
    this.ambBus.gain.setTargetAtTime(target, this.ctx.currentTime, 1.2);
    if (this._ambience) {
      this._ambience.filt.frequency.setTargetAtTime(
        450 + Math.min(700, guestCount * 3), this.ctx.currentTime, 2.0,
      );
    }
  }

  _env(gain, t, attack, decay, peak = 1) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _tone(freq, { type = 'sine', dur = 0.18, attack = 0.005, peak = 0.3, detune = 0, slideTo = null } = {}) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    osc.detune.value = detune;
    this._env(g, t, attack, dur, peak);
    osc.connect(g).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + attack + 0.05);
  }

  _noise(dur, { freq = 1200, q = 1, peak = 0.3, type = 'bandpass' } = {}) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    this._env(g, t, 0.004, dur, peak);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
  }

  /* ---------------- public sfx ---------------- */

  click() { this._tone(620, { type: 'triangle', dur: 0.05, peak: 0.1 }); }

  select() { this._tone(880, { type: 'sine', dur: 0.09, peak: 0.12 }); }

  build() {
    this._noise(0.22, { freq: 300, q: 0.8, peak: 0.28 });
    this._tone(180, { type: 'sine', dur: 0.2, peak: 0.24, slideTo: 90 });
    setTimeout(() => this._tone(520, { type: 'triangle', dur: 0.14, peak: 0.14 }), 70);
  }

  demolish() {
    this._noise(0.5, { freq: 180, q: 0.5, peak: 0.34, type: 'lowpass' });
    this._tone(120, { type: 'sawtooth', dur: 0.35, peak: 0.16, slideTo: 50 });
  }

  cash() {
    const notes = [1046, 1318, 1568];
    notes.forEach((f, i) => setTimeout(() => this._tone(f, {
      type: 'triangle', dur: 0.16, peak: 0.13,
    }), i * 55));
  }

  chime() {
    const notes = [784, 988, 1175, 1568];
    notes.forEach((f, i) => setTimeout(() => this._tone(f, {
      type: 'sine', dur: 0.4, peak: 0.14,
    }), i * 90));
  }

  error() { this._tone(180, { type: 'square', dur: 0.14, peak: 0.1, slideTo: 120 }); }

  alarm() {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => this._tone(440, { type: 'square', dur: 0.14, peak: 0.1, slideTo: 330 }), i * 190);
    }
  }

  firework() {
    setTimeout(() => {
      this._noise(0.7, { freq: 120, q: 0.4, peak: 0.3, type: 'lowpass' });
      this._noise(0.45, { freq: 2600, q: 0.5, peak: 0.12 });
    }, 60);
  }

  splash() { this._noise(0.4, { freq: 900, q: 0.6, peak: 0.16 }); }
}
