/* Shadow Self — procedural audio engine (no external assets) */
(function () {
  "use strict";

  const Sound = {
    ctx: null,
    master: null,
    ambientGain: null,
    enabled: true,
    ambientStarted: false,
    _noiseBuf: null,

    init() {
      if (this.ctx) {
        if (this.ctx.state === "suspended") this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 6;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      // pre-render 1s of white noise
      const len = this.ctx.sampleRate;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      this._startAmbient();
    },

    setEnabled(on) {
      this.enabled = on;
      if (this.master) this.master.gain.value = on ? 0.8 : 0;
    },

    toggle() {
      this.setEnabled(!this.enabled);
      return this.enabled;
    },

    /* ---- low-level helpers ---- */
    _env(gainNode, t0, peak, attack, decay) {
      const g = gainNode.gain;
      g.setValueAtTime(0.0001, t0);
      g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
      g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    },

    _osc(type, freq0, freq1, t0, dur, peak, dest) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq0, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(freq1, 1), t0 + dur);
      this._env(g, t0, peak, 0.005, dur);
      o.connect(g);
      g.connect(dest || this.master);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
      return o;
    },

    _noise(t0, dur, peak, filterType, filterFreq, dest, sweepTo) {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuf;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.setValueAtTime(filterFreq, t0);
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(sweepTo, 1), t0 + dur);
      f.Q.value = 1;
      const g = this.ctx.createGain();
      this._env(g, t0, peak, 0.004, dur);
      src.connect(f);
      f.connect(g);
      g.connect(dest || this.master);
      src.start(t0);
      src.stop(t0 + dur + 0.05);
    },

    _tone(freq, dur, peak, type, t0) {
      const now = t0 !== undefined ? t0 : this.ctx.currentTime;
      this._osc(type, freq, freq, now, dur, peak);
    },

    /* ---- SFX ---- */
    jump() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._osc("sine", 340, 620, t, 0.14, 0.22);
      this._osc("triangle", 220, 460, t, 0.12, 0.1);
    },

    land() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._osc("triangle", 150, 70, t, 0.09, 0.28);
      this._noise(t, 0.06, 0.12, "lowpass", 900, null, 300);
    },

    step() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._noise(t, 0.03, 0.045, "bandpass", 2200, null, 1400);
    },

    switchOn() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._osc("square", 760, 980, t, 0.06, 0.14);
      this._osc("sine", 1500, 1800, t + 0.02, 0.1, 0.08);
    },

    switchOff() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._osc("square", 980, 700, t, 0.06, 0.1);
    },

    doorOpen() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._noise(t, 0.35, 0.16, "bandpass", 600, null, 2400);
      this._osc("sine", 300, 700, t, 0.3, 0.08);
    },

    doorClose() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._noise(t, 0.25, 0.14, "lowpass", 900, null, 300);
      this._osc("sine", 260, 120, t, 0.25, 0.09);
    },

    gateActive() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._tone(880, 0.18, 0.1, "sine", t);
      this._tone(1320, 0.22, 0.08, "sine", t + 0.04);
    },

    crack() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._noise(t, 0.1, 0.2, "highpass", 1500, null, 4000);
    },

    shatter() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._noise(t, 0.3, 0.34, "bandpass", 800, null, 300);
      this._osc("triangle", 300, 90, t, 0.25, 0.24);
      this._noise(t + 0.03, 0.2, 0.18, "highpass", 2000, null, 6000);
    },

    enemyTurn() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._osc("square", 400, 320, t, 0.08, 0.08);
    },

    stomp() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._osc("triangle", 260, 60, t, 0.16, 0.32);
      this._noise(t, 0.14, 0.2, "lowpass", 1000, null, 300);
      this._tone(520, 0.12, 0.1, "square", t + 0.02);
    },

    shoot() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._osc("sawtooth", 220, 90, t, 0.14, 0.1);
      this._osc("sine", 900, 1400, t, 0.1, 0.06);
    },

    projectileAbsorb() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._osc("sine", 700, 1800, t, 0.16, 0.14);
      this._noise(t, 0.1, 0.08, "highpass", 3000, null, 6000);
    },

    death() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._osc("sawtooth", 500, 70, t, 0.45, 0.3);
      this._osc("sine", 240, 60, t, 0.45, 0.2);
      this._noise(t, 0.4, 0.22, "lowpass", 2500, null, 400);
    },

    checkpoint() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._tone(660, 0.14, 0.16, "sine", t);
      this._tone(990, 0.2, 0.14, "sine", t + 0.08);
    },

    keyPickup() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._tone(880, 0.1, 0.14, "square", t);
      this._tone(1320, 0.16, 0.12, "square", t + 0.06);
    },

    lockOpen() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._noise(t, 0.3, 0.16, "lowpass", 700, null, 200);
      this._tone(660, 0.2, 0.14, "triangle", t);
      this._tone(990, 0.26, 0.1, "triangle", t + 0.08);
    },

    springBounce() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._osc("sine", 300, 900, t, 0.16, 0.2);
      this._noise(t, 0.1, 0.14, "highpass", 2000, null, 4000);
    },

    shadowArrive() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._tone(1200, 0.5, 0.12, "sine", t);
      this._tone(1800, 0.6, 0.07, "sine", t + 0.05);
      this._tone(900, 0.5, 0.06, "sine", t + 0.1);
    },

    shadowLoop() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._tone(1400, 0.35, 0.08, "sine", t);
      this._tone(2000, 0.4, 0.05, "sine", t + 0.03);
    },

    uiClick() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._tone(700, 0.06, 0.14, "square", t);
    },

    uiHover() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this._tone(500, 0.04, 0.06, "square", t);
    },

    win() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        this._tone(f, 0.3, 0.18, "triangle", t + i * 0.11);
        this._tone(f * 2, 0.25, 0.05, "sine", t + i * 0.11);
      });
      this._tone(1318.5, 0.7, 0.14, "triangle", t + 0.45);
    },

    /* ---- ambient pad (very quiet, atmospheric) ---- */
    _startAmbient() {
      if (this.ambientStarted || !this.ctx) return;
      this.ambientStarted = true;
      const t = this.ctx.currentTime;
      const g = this.ctx.createGain();
      g.gain.value = 0.0;
      g.gain.linearRampToValueAtTime(0.035, t + 4);
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 500;
      const freqs = [55, 82.4, 110, 130.8];
      freqs.forEach((f, i) => {
        const o = this.ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f * (i % 2 ? 1.005 : 1 / 1.005);
        const og = this.ctx.createGain();
        og.gain.value = 0.4 - i * 0.08;
        o.connect(og);
        og.connect(lp);
        o.start(t);
        // slow LFO on volume
        const lfo = this.ctx.createOscillator();
        const lg = this.ctx.createGain();
        lfo.frequency.value = 0.05 + i * 0.02;
        lg.gain.value = 0.1;
        lfo.connect(lg);
        lg.connect(og.gain);
        lfo.start(t);
      });
      lp.connect(g);
      g.connect(this.master);
    },

    _ready() {
      if (!this.ctx || !this.enabled) return false;
      return this.ctx.state === "running";
    },
  };

  window.Sound = Sound;
})();
