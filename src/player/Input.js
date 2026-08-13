// Keyboard/mouse input state. UI layers can pause capture.

export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.leftDown = false;
    this.rightDown = false;
    this.wheelDelta = 0;
    this.enabled = true;
    this.pressHandlers = new Map(); // code -> [fn]
    this.doubleTap = new Map();     // code -> last press time

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.repeat) return;
      this.keys.add(e.code);
      const handlers = this.pressHandlers.get(e.code);
      if (handlers) for (const fn of handlers) fn(e);
      const last = this.doubleTap.get(e.code + '_t') || 0;
      const now = performance.now();
      if (now - last < 280) {
        const dblHandlers = this.pressHandlers.get('dbl:' + e.code);
        if (dblHandlers) for (const fn of dblHandlers) fn(e);
      }
      this.doubleTap.set(e.code + '_t', now);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  onPress(code, fn) {
    if (!this.pressHandlers.has(code)) this.pressHandlers.set(code, []);
    this.pressHandlers.get(code).push(fn);
  }

  onDoublePress(code, fn) {
    this.onPress('dbl:' + code, () => {});
    if (!this.pressHandlers.has('dbl:' + code)) this.pressHandlers.set('dbl:' + code, []);
    this.pressHandlers.get('dbl:' + code).push(fn);
  }

  down(code) {
    return this.enabled && this.keys.has(code);
  }

  consumeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return [dx, dy];
  }

  consumeWheel() {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }
}
