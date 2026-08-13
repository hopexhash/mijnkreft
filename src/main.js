// KREFT — entry point. Boots the renderer, UI and menu flow, and owns the
// per-world Game lifecycle and the main loop.

import * as THREE from 'three';
import { buildAtlas, getAtlasTexture } from './gfx/TextureAtlas.js';
import { Settings } from './core/Settings.js';
import { SaveManager } from './save/SaveManager.js';
import { AudioManager } from './audio/AudioManager.js';
import { Input } from './player/Input.js';
import { UIManager } from './ui/UIManager.js';
import { Game } from './core/Game.js';
import { setMeshOptions } from './world/Mesher.js';

class App {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    buildAtlas();

    this.settings = new Settings();
    this.saveManager = new SaveManager();
    this.audio = new AudioManager(this.settings);
    this.input = new Input();
    this.ui = new UIManager(this.settings, this.saveManager, this.audio, this.input);
    this.game = null;
    this.lastTime = performance.now();
    this.frameAccumulator = 0;

    this.applyRendererSettings();
    this.wireSettings();
    this.wireHooks();

    window.addEventListener('resize', () => this.onResize());
    this.onResize();

    this.ui.showMainMenu();
    requestAnimationFrame((t) => this.loop(t));
  }

  applyRendererSettings() {
    const scale = this.settings.get('resolutionScale');
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * scale);
    this.renderer.setSize(innerWidth, innerHeight);
  }

  wireSettings() {
    const s = this.settings;
    s.onChange('resolutionScale', () => this.applyRendererSettings());
    s.onChange('volume', v => this.audio.setVolume(v));
    s.onChange('fullscreen', v => {
      if (v) document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) document.exitFullscreen?.();
    });
    s.onChange('textureQuality', q => {
      const tex = getAtlasTexture();
      if (!tex) return;
      tex.magFilter = q === 'smooth' ? THREE.LinearFilter : THREE.NearestFilter;
      tex.needsUpdate = true;
    });
    const remeshAll = () => this.game?.chunkManager.markAllDirty();
    s.onChange('ambientOcclusion', v => { setMeshOptions({ ao: v }); remeshAll(); });
    s.onChange('shadows', v => { setMeshOptions({ directionalShade: v }); remeshAll(); });
    setMeshOptions({ ao: s.get('ambientOcclusion'), directionalShade: s.get('shadows') !== false });
  }

  wireHooks() {
    this.ui.setHooks({
      createWorld: (name, seed, mode) => {
        const id = this.saveManager.createWorldEntry(name, seed, mode);
        this.startGame(id);
      },
      loadWorld: (id) => this.startGame(id),
      exitToMenu: () => this.exitToMenu()
    });
  }

  startGame(worldId) {
    if (this.game) {
      this.game.dispose();
      this.game = null;
    }
    const entry = this.saveManager.getWorldEntry(worldId);
    if (!entry) {
      this.ui.showMainMenu();
      return;
    }
    const worldData = this.saveManager.loadWorld(worldId);
    this.game = new Game({
      renderer: this.renderer,
      input: this.input,
      settings: this.settings,
      audio: this.audio,
      ui: this.ui,
      saveManager: this.saveManager,
      worldId,
      worldData,
      // seed stays a raw string end-to-end; WorldGenerator hashes it
      entry: { seed: String(entry.seed), mode: entry.mode }
    });
    this.ui.attachGame(this.game);
    // expose for debugging / automated smoke tests
    window.KREFT = { game: this.game, app: this };
  }

  exitToMenu() {
    if (this.game) {
      this.game.dispose();
      this.game = null;
    }
    window.KREFT = { game: null, app: this };
    this.ui.showMainMenu();
  }

  onResize() {
    this.applyRendererSettings();
    this.game?.resize();
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = (now - this.lastTime) / 1000;

    // frame cap
    const cap = this.settings.get('frameCap');
    if (cap > 0) {
      this.frameAccumulator += dt * 1000;
      if (this.frameAccumulator < 1000 / cap) {
        // not yet time for the next frame — but keep lastTime so dt accumulates
        this.lastTime = now;
        return;
      }
      dt = Math.min(this.frameAccumulator / 1000, 0.1);
      this.frameAccumulator = 0;
    }

    this.lastTime = now;
    if (dt > 0.1) dt = 0.1;

    if (this.game) {
      try {
        this.game.update(dt);
        this.game.render();
      } catch (err) {
        console.error('Game loop error:', err);
      }
    }
  }
}

new App();
