// Procedural audio: all sounds are synthesized with WebAudio so the game
// ships with zero external audio assets. Each generator below can later be
// swapped for a recorded sample by registering a buffer under the same name.

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.lastPlay = new Map();
  }

  ensure() {
    if (this.ctx) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.settings.get('volume');
      this.master.connect(this.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  setVolume(v) {
    if (this.master) this.master.gain.value = v;
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  // Simple rate limiting so rapid events don't stack painfully.
  play(name, opts = {}) {
    if (!this.ensure()) return;
    this.resume();
    const now = performance.now();
    const last = this.lastPlay.get(name) || 0;
    const minGap = opts.minGap ?? 50;
    if (now - last < minGap) return;
    this.lastPlay.set(name, now);
    const fn = GENERATORS[name];
    if (fn) {
      try { fn(this.ctx, this.master); } catch { /* audio failure is non-fatal */ }
    }
  }
}

// --- Sound generators ---

function envGain(ctx, dest, attack, decay, peak = 1) {
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + attack + decay);
  g.connect(dest);
  return g;
}

function noiseBuffer(ctx, seconds = 0.5) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function playNoise(ctx, dest, { attack = 0.005, decay = 0.15, peak = 0.4, filterFreq = 800, filterType = 'lowpass' }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, attack + decay + 0.1);
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  const g = envGain(ctx, dest, attack, decay, peak);
  src.connect(filter).connect(g);
  src.start();
  src.stop(ctx.currentTime + attack + decay + 0.1);
}

function playTone(ctx, dest, { freq = 440, endFreq, type = 'sine', attack = 0.005, decay = 0.15, peak = 0.3 }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + attack + decay);
  const g = envGain(ctx, dest, attack, decay, peak);
  osc.connect(g);
  osc.start();
  osc.stop(ctx.currentTime + attack + decay + 0.1);
}

const GENERATORS = {
  step: (ctx, out) => playNoise(ctx, out, { decay: 0.09, peak: 0.16, filterFreq: 500 + Math.random() * 300 }),
  dig: (ctx, out) => playNoise(ctx, out, { decay: 0.08, peak: 0.22, filterFreq: 350 + Math.random() * 250 }),
  break: (ctx, out) => {
    playNoise(ctx, out, { decay: 0.22, peak: 0.5, filterFreq: 900 });
    playTone(ctx, out, { freq: 180, endFreq: 60, type: 'triangle', decay: 0.18, peak: 0.25 });
  },
  place: (ctx, out) => {
    playNoise(ctx, out, { decay: 0.1, peak: 0.3, filterFreq: 700 });
    playTone(ctx, out, { freq: 240, endFreq: 160, type: 'square', decay: 0.08, peak: 0.12 });
  },
  pickup: (ctx, out) => playTone(ctx, out, { freq: 660, endFreq: 1180, type: 'sine', decay: 0.14, peak: 0.25 }),
  click: (ctx, out) => playTone(ctx, out, { freq: 800, endFreq: 500, type: 'square', decay: 0.05, peak: 0.12 }),
  eat: (ctx, out) => {
    playNoise(ctx, out, { decay: 0.12, peak: 0.3, filterFreq: 1200 });
    playTone(ctx, out, { freq: 300 + Math.random() * 150, endFreq: 150, type: 'triangle', decay: 0.1, peak: 0.15 });
  },
  hit: (ctx, out) => {
    playNoise(ctx, out, { decay: 0.12, peak: 0.4, filterFreq: 600 });
    playTone(ctx, out, { freq: 140, endFreq: 70, type: 'sawtooth', decay: 0.12, peak: 0.25 });
  },
  hurt: (ctx, out) => {
    playTone(ctx, out, { freq: 220, endFreq: 90, type: 'sawtooth', decay: 0.25, peak: 0.4 });
  },
  death: (ctx, out) => {
    playTone(ctx, out, { freq: 300, endFreq: 40, type: 'sawtooth', decay: 0.9, peak: 0.5 });
  },
  splash: (ctx, out) => playNoise(ctx, out, { decay: 0.35, peak: 0.4, filterFreq: 1400, filterType: 'bandpass' }),
  fuse: (ctx, out) => playNoise(ctx, out, { attack: 0.02, decay: 1.1, peak: 0.35, filterFreq: 3200, filterType: 'highpass' }),
  explosion: (ctx, out) => {
    playNoise(ctx, out, { attack: 0.01, decay: 0.9, peak: 0.9, filterFreq: 300 });
    playTone(ctx, out, { freq: 90, endFreq: 25, type: 'sine', decay: 0.8, peak: 0.7 });
  },
  furnace: (ctx, out) => playNoise(ctx, out, { decay: 0.3, peak: 0.12, filterFreq: 500 }),
  smelt_done: (ctx, out) => playTone(ctx, out, { freq: 520, endFreq: 780, type: 'sine', decay: 0.25, peak: 0.2 }),
  creature: (ctx, out) => playTone(ctx, out, { freq: 200 + Math.random() * 300, endFreq: 150, type: 'triangle', decay: 0.3, peak: 0.15 }),
  ambient_cave: (ctx, out) => playTone(ctx, out, { freq: 60 + Math.random() * 40, endFreq: 45, type: 'sine', attack: 0.6, decay: 2.4, peak: 0.1 })
};
