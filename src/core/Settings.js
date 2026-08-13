// Persistent game settings (graphics, audio, controls).

const DEFAULTS = {
  renderDistance: 6,     // chunks
  fov: 75,
  sensitivity: 1.0,
  cameraBob: true,
  volume: 0.7,
  vsync: true,           // uses rAF (on) vs uncapped loop hint (informational)
  frameCap: 0,           // 0 = uncapped/monitor
  shadows: false,        // reserved (voxel AO is the primary shading)
  ambientOcclusion: true,
  textureQuality: 'pixel',
  fullscreen: false,
  dayLength: 600,
  chunkUpdateDistance: 7,
  resolutionScale: 1.0
};

const KEY = 'kreft.settings.v1';

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    this.listeners = new Map();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.values, JSON.parse(raw));
    } catch { /* fresh settings */ }
  }

  get(name) {
    return this.values[name] ?? DEFAULTS[name];
  }

  set(name, value) {
    this.values[name] = value;
    this.save();
    const fns = this.listeners.get(name);
    if (fns) for (const fn of fns) fn(value);
  }

  onChange(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(fn);
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch { /* storage may be unavailable */ }
  }

  static get defaults() {
    return { ...DEFAULTS };
  }
}
