// UIManager: menus (main / worlds / create / settings / pause / death),
// HUD (hotbar, health, hunger, air, clock), pointer lock, tooltips,
// and gameplay key/mouse wiring.

import { GameMode, MAX_HEALTH, MAX_HUNGER, HOTBAR_SIZE } from '../core/constants.js';
import { getItem, itemTileKey } from '../world/ItemRegistry.js';
import { tileDataURL } from '../gfx/TextureAtlas.js';
import { InventoryUI } from './InventoryUI.js';
import { hashSeed } from '../core/rng.js';

export class UIManager {
  constructor(settings, saveManager, audio, input) {
    this.settings = settings;
    this.saveManager = saveManager;
    this.audio = audio;
    this.input = input;
    this.game = null;
    this.hooks = {};

    this.menuRoot = document.getElementById('menu-root');
    this.hud = document.getElementById('hud');
    this.tooltip = document.getElementById('tooltip');
    this.canvas = document.getElementById('game-canvas');

    this.inventoryUI = new InventoryUI(this);
    this.pauseOpen = false;
    this.deathOpen = false;
    // When pointer lock is unavailable (e.g. sandboxed iframes), fall back
    // to free mouse-look: raw mousemove deltas steer the camera.
    this.lockFallback = false;
    this.debugOpen = false;
    this.heldLabelTimer = 0;
    this.fps = 0;
    this.fpsCounter = 0;
    this.fpsTimer = 0;

    this.buildHUDBars();
    this.wireGlobalInput();
  }

  setHooks(hooks) {
    this.hooks = hooks;
  }

  // ---------- Input wiring ----------

  wireGlobalInput() {
    const input = this.input;

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas || this.fallbackLookActive()) {
        input.mouseDX += e.movementX;
        input.mouseDY += e.movementY;
      }
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFallback = true;
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.game || this.anyModalOpen() || this.pauseOpen || this.deathOpen) return;
      if (document.pointerLockElement !== this.canvas && !this.lockFallback) return;
      if (e.target !== this.canvas && e.target !== document.body && !this.hud.contains(e.target) && document.pointerLockElement !== this.canvas) return;
      if (e.button === 0) input.leftDown = true;
      if (e.button === 2) {
        input.rightDown = true;
        this.game.interaction.interact();
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) input.leftDown = false;
      if (e.button === 2) input.rightDown = false;
    });
    document.addEventListener('contextmenu', (e) => {
      if (this.game) e.preventDefault();
    });

    document.addEventListener('wheel', (e) => {
      if (!this.game || this.anyModalOpen() || this.pauseOpen) return;
      const inv = this.game.inventory;
      inv.selected = (inv.selected + (e.deltaY > 0 ? 1 : -1) + HOTBAR_SIZE) % HOTBAR_SIZE;
      this.refreshHotbar();
      this.showHeldLabel();
    }, { passive: true });

    this.canvas.addEventListener('click', () => {
      if (this.game && !this.anyModalOpen() && !this.pauseOpen && !this.deathOpen) {
        this.lockPointer();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.canvas && this.game && !this.lockFallback &&
          !this.anyModalOpen() && !this.deathOpen && !this.pauseOpen) {
        this.openPause();
      }
    });

    // gameplay keys
    for (let i = 1; i <= 9; i++) {
      input.onPress('Digit' + i, () => {
        if (!this.game || this.pauseOpen || this.deathOpen) return;
        this.game.inventory.selected = i - 1;
        this.refreshHotbar();
        this.showHeldLabel();
      });
    }
    input.onPress('KeyE', () => {
      if (!this.game || this.pauseOpen || this.deathOpen) return;
      if (this.inventoryUI.isOpen) {
        this.closeModal();
      } else {
        this.inventoryUI.open('inventory');
        document.exitPointerLock?.();
      }
    });
    input.onPress('KeyQ', () => {
      if (!this.game || this.anyModalOpen() || this.pauseOpen || this.deathOpen) return;
      this.game.interaction.dropSelected();
    });
    input.onPress('F3', (e) => {
      e.preventDefault?.();
      this.debugOpen = !this.debugOpen;
      document.getElementById('debug-info').textContent = '';
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (!this.game) return;
        if (this.inventoryUI.isOpen) {
          this.closeModal();
        } else if (this.pauseOpen) {
          this.closePause();
        } else if (this.lockFallback && !this.deathOpen) {
          // no pointer lock to release, so Esc pauses directly
          this.openPause();
        }
        // with pointer lock, Esc triggers pause via pointerlockchange
      }
      if (e.code === 'F3') e.preventDefault();
    });
  }

  fallbackLookActive() {
    return this.lockFallback && this.game && !this.anyModalOpen() && !this.pauseOpen && !this.deathOpen;
  }

  lockPointer() {
    this.canvas.requestPointerLock?.();
    this.audio.resume();
  }

  // ---------- Game lifecycle ----------

  attachGame(game) {
    this.game = game;
    this.hud.classList.remove('hidden');
    this.menuRoot.innerHTML = '';
    this.pauseOpen = false;
    this.deathOpen = false;
    this.refreshHotbar();
    this.lockPointer();
  }

  detachGame() {
    this.game = null;
    this.hud.classList.add('hidden');
    this.inventoryUI.close();
    this.pauseOpen = false;
    this.deathOpen = false;
    document.exitPointerLock?.();
  }

  anyModalOpen() {
    return this.inventoryUI.isOpen;
  }

  closeModal() {
    this.inventoryUI.close();
    this.hideTooltip();
    if (this.game && !this.pauseOpen && !this.deathOpen) this.lockPointer();
  }

  openBlockInterface(kind, x, y, z) {
    const game = this.game;
    if (kind === 'craft') {
      this.inventoryUI.open('bench');
    } else if (kind === 'chest') {
      const container = game.world.getContainer(x, y, z, 'chest');
      this.inventoryUI.open('chest', { x, y, z, container });
    } else if (kind === 'furnace') {
      const container = game.world.getContainer(x, y, z, 'furnace');
      this.inventoryUI.open('furnace', { x, y, z, container });
    }
    document.exitPointerLock?.();
  }

  refreshOpenContainer() {
    this.inventoryUI.refreshFurnaceIndicators();
    if (this.inventoryUI.isOpen && this.inventoryUI.openKind === 'furnace') {
      // slots may have changed from smelting — repaint
      this.inventoryUI.render();
    }
  }

  // ---------- HUD ----------

  buildHUDBars() {
    const health = document.getElementById('health-bar');
    for (let i = 0; i < MAX_HEALTH / 2; i++) {
      const h = document.createElement('div');
      h.className = 'heart';
      health.appendChild(h);
    }
    const hunger = document.getElementById('hunger-bar');
    for (let i = 0; i < MAX_HUNGER / 2; i++) {
      const f = document.createElement('div');
      f.className = 'food';
      hunger.appendChild(f);
    }
    const hotbar = document.getElementById('hotbar');
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.index = i;
      hotbar.appendChild(slot);
    }
  }

  refreshHotbar() {
    if (!this.game) return;
    const inv = this.game.inventory;
    const slots = document.querySelectorAll('#hotbar .slot');
    slots.forEach((el, i) => {
      el.classList.toggle('selected', i === inv.selected);
      const stack = inv.slots[i];
      el.innerHTML = '';
      if (stack) {
        const img = document.createElement('img');
        img.src = tileDataURL(itemTileKey(stack.name));
        el.appendChild(img);
        if (stack.count > 1) {
          const c = document.createElement('div');
          c.className = 'count';
          c.textContent = stack.count;
          el.appendChild(c);
        }
        const item = getItem(stack.name);
        if (stack.durability !== undefined && item?.tool && stack.durability < item.tool.durability) {
          const bar = document.createElement('div');
          bar.className = 'durability';
          const fill = document.createElement('div');
          fill.style.width = Math.round((stack.durability / item.tool.durability) * 100) + '%';
          bar.appendChild(fill);
          el.appendChild(bar);
        }
      }
    });
  }

  showHeldLabel() {
    const label = document.getElementById('held-label');
    const stack = this.game?.inventory.selectedStack;
    label.textContent = stack ? (getItem(stack.name)?.label || stack.name) : '';
    label.style.opacity = 1;
    this.heldLabelTimer = 1.6;
  }

  updateHUD(dt) {
    const game = this.game;
    if (!game) return;
    const stats = game.stats;

    // hearts / hunger — hidden in creative
    const survival = game.mode === GameMode.SURVIVAL;
    document.getElementById('stats-row').style.visibility = survival ? 'visible' : 'hidden';
    if (survival) {
      const hearts = document.querySelectorAll('#health-bar .heart');
      hearts.forEach((el, i) => {
        const v = stats.health - i * 2;
        el.className = 'heart' + (v >= 2 ? ' full' : v >= 1 ? ' half' : '');
      });
      const foods = document.querySelectorAll('#hunger-bar .food');
      foods.forEach((el, i) => {
        const v = stats.hunger - i * 2;
        el.className = 'food' + (v >= 2 ? ' full' : v >= 1 ? ' half' : '');
      });
      // air bubbles only while diving
      const airBar = document.getElementById('air-bar');
      airBar.innerHTML = '';
      if (game.player.headInWater || stats.air < 10) {
        const bubbles = Math.ceil(stats.air);
        for (let i = 0; i < bubbles; i++) {
          const b = document.createElement('div');
          b.className = 'bubble';
          airBar.appendChild(b);
        }
      }
    }

    // clock
    document.getElementById('clock').textContent = game.sky.clockString();

    // water overlay
    document.getElementById('water-overlay').style.opacity = game.player.headInWater ? 1 : 0;

    // held label fade
    if (this.heldLabelTimer > 0) {
      this.heldLabelTimer -= dt;
      if (this.heldLabelTimer <= 0) document.getElementById('held-label').style.opacity = 0;
    }

    // fps + debug
    this.fpsCounter++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.fpsCounter / this.fpsTimer);
      this.fpsCounter = 0;
      this.fpsTimer = 0;
      if (this.debugOpen) {
        const p = game.player.position;
        const biome = game.world.generator.biomeAt(Math.floor(p.x), Math.floor(p.z));
        const biomeName = ['Green Meadows', 'Dense Woodland', 'Drylands', 'Frozen Peaks', 'Rocky Highlands', 'Coastal Shores', 'Deep Ocean', 'Snowfields'][biome];
        document.getElementById('debug-info').textContent =
          `${this.fps} fps\n` +
          `xyz ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}\n` +
          `chunks ${game.chunkManager.loadedCount}\n` +
          `${biomeName}\n` +
          `entities ${game.entities.creatures.length} / drops ${game.entities.drops.length}`;
      } else {
        document.getElementById('debug-info').textContent = '';
      }
    }
  }

  damageFlash() {
    const el = document.getElementById('damage-flash');
    el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 130);
  }

  shake() {
    this.canvas.classList.remove('shaking');
    void this.canvas.offsetWidth;
    this.canvas.classList.add('shaking');
  }

  // ---------- Tooltip ----------

  showTooltip(x, y, name, sub) {
    this.tooltip.classList.remove('hidden');
    this.tooltip.innerHTML = `<div class="t-name">${name}</div>` + (sub ? `<div class="t-sub">${sub}</div>` : '');
    const pad = 14;
    this.tooltip.style.left = Math.min(x + pad, innerWidth - 250) + 'px';
    this.tooltip.style.top = Math.min(y + pad, innerHeight - 60) + 'px';
  }

  hideTooltip() {
    this.tooltip.classList.add('hidden');
  }

  // ---------- Screens ----------

  clearMenus() {
    this.menuRoot.innerHTML = '';
  }

  screen(overlay = false) {
    const div = document.createElement('div');
    div.className = 'screen' + (overlay ? ' overlay' : '');
    return div;
  }

  button(label, cls, onClick) {
    const b = document.createElement('button');
    b.className = 'btn ' + (cls || '');
    b.textContent = label;
    b.addEventListener('click', () => {
      this.audio.play('click');
      onClick();
    });
    return b;
  }

  showMainMenu() {
    this.detachGame();
    this.clearMenus();
    const s = this.screen();
    const title = document.createElement('div');
    title.className = 'game-title';
    title.textContent = 'KREFT';
    const sub = document.createElement('div');
    sub.className = 'game-subtitle';
    sub.textContent = 'A Voxel Survival Saga';
    s.appendChild(title);
    s.appendChild(sub);
    s.appendChild(this.button('Play', 'primary', () => this.showWorldList()));
    s.appendChild(this.button('Create World', '', () => this.showCreateWorld()));
    s.appendChild(this.button('Settings', '', () => this.showSettings(() => this.showMainMenu())));
    s.appendChild(this.button('Quit', '', () => {
      window.close();
      // browsers usually block window.close for non-popup tabs
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'You can close this browser tab to quit.';
      s.appendChild(hint);
    }));
    this.menuRoot.appendChild(s);
  }

  showWorldList() {
    this.clearMenus();
    const s = this.screen();
    const h = document.createElement('h2');
    h.textContent = 'Select World';
    s.appendChild(h);

    const worlds = this.saveManager.listWorlds();
    const list = document.createElement('div');
    list.className = 'world-list';
    if (!worlds.length) {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.textContent = 'No worlds yet — create your first one!';
      list.appendChild(empty);
    }
    for (const w of worlds) {
      const entry = document.createElement('div');
      entry.className = 'world-entry';
      const info = document.createElement('div');
      info.innerHTML = `<div class="w-name">${escapeHTML(w.name)}</div>` +
        `<div class="w-meta">${w.mode === 'creative' ? 'Creative' : 'Survival'} · seed ${escapeHTML(String(w.seed))} · ` +
        `${new Date(w.lastPlayed).toLocaleDateString()}</div>`;
      entry.appendChild(info);
      const del = document.createElement('button');
      del.className = 'w-del';
      del.textContent = '✕';
      del.title = 'Delete world';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete world "${w.name}" forever?`)) {
          this.saveManager.deleteWorld(w.id);
          this.showWorldList();
        }
      });
      entry.appendChild(del);
      entry.addEventListener('click', () => {
        this.audio.play('click');
        this.hooks.loadWorld(w.id);
      });
      list.appendChild(entry);
    }
    s.appendChild(list);
    s.appendChild(this.button('Create New World', 'primary', () => this.showCreateWorld()));
    s.appendChild(this.button('Back', '', () => this.showMainMenu()));
    this.menuRoot.appendChild(s);
  }

  showCreateWorld() {
    this.clearMenus();
    const s = this.screen();
    const h = document.createElement('h2');
    h.textContent = 'Create World';
    s.appendChild(h);

    const nameField = document.createElement('div');
    nameField.className = 'field';
    nameField.innerHTML = '<label>WORLD NAME</label>';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 32;
    nameInput.value = 'New World';
    nameField.appendChild(nameInput);
    s.appendChild(nameField);

    const modeField = document.createElement('div');
    modeField.className = 'field';
    modeField.innerHTML = '<label>GAME MODE</label>';
    const modeSelect = document.createElement('select');
    modeSelect.innerHTML = '<option value="survival">Survival — gather, craft, fight, endure</option>' +
      '<option value="creative">Creative — unlimited blocks & flight</option>';
    modeField.appendChild(modeSelect);
    s.appendChild(modeField);

    const seedField = document.createElement('div');
    seedField.className = 'field';
    seedField.innerHTML = '<label>WORLD SEED</label>';
    const seedRow = document.createElement('div');
    seedRow.className = 'seed-row';
    const seedInput = document.createElement('input');
    seedInput.type = 'text';
    seedInput.placeholder = 'Leave empty for random';
    seedRow.appendChild(seedInput);
    const randBtn = this.button('🎲', 'small', () => {
      seedInput.value = String((Math.random() * 999999999) | 0);
    });
    seedRow.appendChild(randBtn);
    seedField.appendChild(seedRow);
    s.appendChild(seedField);

    s.appendChild(this.button('Create', 'primary', () => {
      const name = nameInput.value.trim() || 'New World';
      let seed = seedInput.value.trim();
      if (!seed) seed = String((Math.random() * 999999999) | 0);
      this.hooks.createWorld(name, seed, modeSelect.value);
    }));
    s.appendChild(this.button('Cancel', '', () => this.showMainMenu()));
    this.menuRoot.appendChild(s);
    setTimeout(() => nameInput.select(), 0);
  }

  showSettings(onBack) {
    this.clearMenus();
    const s = this.screen(this.game != null);
    const h = document.createElement('h2');
    h.textContent = 'Settings';
    s.appendChild(h);

    const grid = document.createElement('div');
    grid.className = 'settings-grid';

    const slider = (label, key, min, max, step, fmt = v => v) => {
      const lab = document.createElement('label');
      lab.textContent = label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = min; input.max = max; input.step = step;
      input.value = this.settings.get(key);
      const val = document.createElement('div');
      val.className = 'value';
      val.textContent = fmt(this.settings.get(key));
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        this.settings.set(key, v);
        val.textContent = fmt(v);
      });
      grid.appendChild(lab); grid.appendChild(input); grid.appendChild(val);
    };

    const checkbox = (label, key) => {
      const lab = document.createElement('label');
      lab.textContent = label;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!this.settings.get(key);
      const val = document.createElement('div');
      val.className = 'value';
      val.textContent = input.checked ? 'On' : 'Off';
      input.addEventListener('change', () => {
        this.settings.set(key, input.checked);
        val.textContent = input.checked ? 'On' : 'Off';
      });
      grid.appendChild(lab); grid.appendChild(input); grid.appendChild(val);
    };

    const select = (label, key, options) => {
      const lab = document.createElement('label');
      lab.textContent = label;
      const sel = document.createElement('select');
      for (const [v, text] of options) {
        const o = document.createElement('option');
        o.value = v; o.textContent = text;
        sel.appendChild(o);
      }
      sel.value = String(this.settings.get(key));
      const val = document.createElement('div');
      val.className = 'value';
      sel.addEventListener('change', () => {
        const raw = sel.value;
        const num = parseFloat(raw);
        this.settings.set(key, isNaN(num) ? raw : num);
      });
      grid.appendChild(lab); grid.appendChild(sel); grid.appendChild(val);
    };

    slider('Render Distance', 'renderDistance', 3, 12, 1, v => v + ' chunks');
    slider('Field of View', 'fov', 55, 105, 1, v => v + '°');
    slider('Mouse Sensitivity', 'sensitivity', 0.2, 3, 0.05, v => v.toFixed(2));
    slider('Volume', 'volume', 0, 1, 0.05, v => Math.round(v * 100) + '%');
    slider('Resolution Scale', 'resolutionScale', 0.5, 2, 0.05, v => Math.round(v * 100) + '%');
    slider('Day Length', 'dayLength', 120, 2400, 60, v => (v / 60).toFixed(0) + ' min');
    slider('Chunk Update Distance', 'chunkUpdateDistance', 4, 14, 1, v => v + ' chunks');
    select('Frame Rate Limit', 'frameCap', [['0', 'Unlimited'], ['30', '30 fps'], ['60', '60 fps'], ['120', '120 fps']]);
    select('Texture Quality', 'textureQuality', [['pixel', 'Crisp Pixel'], ['smooth', 'Smoothed']]);
    checkbox('VSync', 'vsync');
    checkbox('Camera Bobbing', 'cameraBob');
    checkbox('Ambient Occlusion', 'ambientOcclusion');
    checkbox('Directional Shading', 'shadows');
    checkbox('Fullscreen', 'fullscreen');

    s.appendChild(grid);
    s.appendChild(this.button('Done', 'primary', () => {
      this.audio.play('click');
      onBack();
    }));
    this.menuRoot.appendChild(s);
  }

  // ---------- Pause ----------

  openPause() {
    if (this.pauseOpen || !this.game) return;
    this.pauseOpen = true;
    this.game.paused = true;
    document.exitPointerLock?.();
    this.renderPause();
  }

  renderPause() {
    this.clearMenus();
    const s = this.screen(true);
    const h = document.createElement('h2');
    h.textContent = 'Paused';
    s.appendChild(h);
    s.appendChild(this.button('Resume', 'primary', () => this.closePause()));
    s.appendChild(this.button('Settings', '', () => this.showSettings(() => this.renderPause())));
    s.appendChild(this.button('Save World', '', () => {
      const ok = this.game.save();
      const note = document.createElement('div');
      note.className = 'hint';
      note.textContent = ok ? 'World saved.' : 'Save failed — storage full?';
      s.appendChild(note);
    }));
    s.appendChild(this.button('Save & Main Menu', '', () => {
      this.pauseOpen = false;
      this.hooks.exitToMenu();
    }));
    s.appendChild(this.button('Quit Game', 'danger', () => {
      this.game.save();
      this.hooks.exitToMenu();
    }));
    this.menuRoot.appendChild(s);
  }

  closePause() {
    this.pauseOpen = false;
    if (this.game) this.game.paused = false;
    this.clearMenus();
    this.lockPointer();
  }

  // ---------- Death ----------

  showDeathScreen(cause) {
    this.deathOpen = true;
    this.inventoryUI.close();
    document.exitPointerLock?.();
    this.clearMenus();
    const s = this.screen(true);
    s.style.background = 'rgba(80, 10, 10, 0.55)';
    const t = document.createElement('div');
    t.className = 'death-title';
    t.textContent = 'You Perished';
    s.appendChild(t);
    const c = document.createElement('div');
    c.className = 'death-cause';
    c.textContent = 'Cause: ' + cause;
    s.appendChild(c);
    s.appendChild(this.button('Respawn', 'primary', () => this.game.respawn()));
    s.appendChild(this.button('Main Menu', '', () => {
      this.deathOpen = false;
      this.hooks.exitToMenu();
    }));
    this.menuRoot.appendChild(s);
  }

  hideDeathScreen() {
    this.deathOpen = false;
    this.clearMenus();
    this.lockPointer();
  }
}

function escapeHTML(str) {
  return str.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
