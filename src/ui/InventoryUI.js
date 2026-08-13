// Inventory / crafting / furnace / chest / creative interfaces.
// All item manipulation (drag-free click model): left click picks up or
// places a full stack, right click places one item or splits a half stack.

import { getItem, itemTileKey, creativeItems } from '../world/ItemRegistry.js';
import { tileDataURL } from '../gfx/TextureAtlas.js';
import { HOTBAR_SIZE, GameMode } from '../core/constants.js';
import { makeStack } from '../inventory/Inventory.js';

export class InventoryUI {
  constructor(uiManager) {
    this.ui = uiManager;
    this.root = document.getElementById('modal-root');
    this.cursorEl = document.getElementById('cursor-stack');
    this.cursor = null;      // stack held on the mouse cursor
    this.openKind = null;
    this.context = null;     // { x, y, z, container } for chest/furnace
    this.searchText = '';

    document.addEventListener('mousemove', (e) => {
      if (this.cursor) {
        this.cursorEl.style.left = (e.clientX - 18) + 'px';
        this.cursorEl.style.top = (e.clientY - 18) + 'px';
      }
    });
    // prevent context menu inside modals
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get game() {
    return this.ui.game;
  }

  get isOpen() {
    return this.openKind !== null;
  }

  open(kind, ctx = null) {
    this.openKind = kind;
    this.context = ctx;
    this.root.classList.remove('hidden');
    this.render();
  }

  close() {
    if (!this.isOpen) return;
    // return cursor stack to inventory (or drop it)
    if (this.cursor && this.game) {
      const left = this.game.inventory.add(this.cursor.name, this.cursor.count, this.cursor.durability);
      if (left > 0) {
        const p = this.game.player.position;
        this.game.entities.spawnDrop(this.cursor.name, left, p.x, p.y + 1, p.z, true, this.cursor.durability);
      }
      this.cursor = null;
      this.updateCursorEl();
    }
    this.openKind = null;
    this.context = null;
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
    this.ui.refreshHotbar();
  }

  // ---------- Rendering ----------

  render() {
    const kind = this.openKind;
    if (!kind) return;
    this.root.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'panel';

    if (kind === 'inventory') {
      if (this.game.mode === GameMode.CREATIVE) {
        panel.appendChild(this.buildCreative());
      } else {
        panel.appendChild(this.buildTitle('Inventory'));
        panel.appendChild(this.buildColumns([this.buildCraftList(false)], 'Handcraft'));
      }
    } else if (kind === 'bench') {
      panel.appendChild(this.buildTitle('Workbench'));
      panel.appendChild(this.buildColumns([this.buildCraftList(true)], 'Bench crafting'));
    } else if (kind === 'chest') {
      panel.appendChild(this.buildTitle('Storage Crate'));
      panel.appendChild(this.buildChestGrid());
    } else if (kind === 'furnace') {
      panel.appendChild(this.buildTitle('Smelter'));
      panel.appendChild(this.buildFurnace());
    }

    // player inventory always at the bottom
    panel.appendChild(this.buildPlayerInventory());
    this.root.appendChild(panel);
  }

  buildTitle(text) {
    const h = document.createElement('h3');
    h.textContent = text;
    return h;
  }

  buildColumns(extras, label) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-columns';
    for (const el of extras) wrap.appendChild(el);
    return wrap;
  }

  // player inventory: main grid (27) + hotbar row (9)
  buildPlayerInventory() {
    const wrap = document.createElement('div');
    const inv = this.game.inventory;
    const main = document.createElement('div');
    main.className = 'slot-grid cols-9';
    for (let i = HOTBAR_SIZE; i < inv.slots.length; i++) {
      main.appendChild(this.buildSlot(this.invAdapter(i), i));
    }
    const bar = document.createElement('div');
    bar.className = 'slot-grid cols-9';
    bar.style.marginTop = '8px';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      bar.appendChild(this.buildSlot(this.invAdapter(i), i));
    }
    wrap.appendChild(main);
    wrap.appendChild(bar);
    return wrap;
  }

  buildChestGrid() {
    const grid = document.createElement('div');
    grid.className = 'slot-grid cols-9';
    const chest = this.context.container;
    for (let i = 0; i < chest.slots.length; i++) {
      grid.appendChild(this.buildSlot(this.chestAdapter(i), 'c' + i));
    }
    return grid;
  }

  buildFurnace() {
    const c = this.context.container;
    const layout = document.createElement('div');
    layout.className = 'furnace-layout';

    const inputSlot = this.buildSlot(this.furnaceAdapter('input'), 'f-in');
    inputSlot.style.gridColumn = '1';
    inputSlot.style.gridRow = '1';
    layout.appendChild(inputSlot);

    const flame = document.createElement('div');
    flame.className = 'furnace-flame' + (c.burnLeft > 0 ? ' lit' : '');
    flame.id = 'furnace-flame';
    flame.style.gridColumn = '1';
    flame.style.gridRow = '2';
    layout.appendChild(flame);

    const fuelSlot = this.buildSlot(this.furnaceAdapter('fuel'), 'f-fuel');
    fuelSlot.style.gridColumn = '1';
    fuelSlot.style.gridRow = '3';
    layout.appendChild(fuelSlot);

    const arrow = document.createElement('div');
    arrow.className = 'furnace-arrow';
    const fill = document.createElement('div');
    fill.id = 'furnace-progress';
    arrow.appendChild(fill);
    layout.appendChild(arrow);

    const outSlot = this.buildSlot(this.furnaceAdapter('output'), 'f-out');
    outSlot.style.gridColumn = '3';
    outSlot.style.gridRow = '2';
    layout.appendChild(outSlot);

    this.refreshFurnaceIndicators();
    return layout;
  }

  refreshFurnaceIndicators() {
    if (this.openKind !== 'furnace' || !this.context) return;
    const c = this.context.container;
    const fill = document.getElementById('furnace-progress');
    const flame = document.getElementById('furnace-flame');
    if (fill) fill.style.width = Math.round((c.progress / 5) * 100) + '%';
    if (flame) flame.classList.toggle('lit', c.burnLeft > 0);
  }

  buildCreative() {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '8px';
    const title = this.buildTitle('Creative Catalog');
    wrap.appendChild(title);
    const search = document.createElement('input');
    search.className = 'creative-search';
    search.placeholder = 'Search blocks & items…';
    search.value = this.searchText;
    search.addEventListener('input', () => {
      this.searchText = search.value;
      this.fillCreativeGrid(grid);
    });
    // don't let game keybinds fire while typing
    search.addEventListener('keydown', (e) => e.stopPropagation());
    wrap.appendChild(search);
    const grid = document.createElement('div');
    grid.className = 'creative-grid';
    this.fillCreativeGrid(grid);
    wrap.appendChild(grid);
    setTimeout(() => search.focus(), 0);
    return wrap;
  }

  fillCreativeGrid(grid) {
    grid.innerHTML = '';
    const q = this.searchText.trim().toLowerCase();
    for (const item of creativeItems()) {
      if (item.name === 'water') { /* allow water placement in creative */ }
      if (q && !item.label.toLowerCase().includes(q) && !item.name.includes(q)) continue;
      const slot = document.createElement('div');
      slot.className = 'slot clickable';
      const img = document.createElement('img');
      img.src = tileDataURL(itemTileKey(item.name));
      slot.appendChild(img);
      slot.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (this.cursor) {
          this.cursor = null; // creative: click empty-handed area to discard
        } else {
          this.cursor = makeStack(item.name, e.button === 2 ? 1 : item.stack);
        }
        this.updateCursorEl();
      });
      this.attachTooltip(slot, () => item);
      grid.appendChild(slot);
    }
  }

  buildCraftList(bench) {
    const list = document.createElement('div');
    list.className = 'craft-list';
    const recipes = this.game.crafting.availableRecipes(bench);
    const inv = this.game.inventory;
    // craftable first
    const sorted = [...recipes].sort((a, b) =>
      (this.game.crafting.canCraft(b, inv) ? 1 : 0) - (this.game.crafting.canCraft(a, inv) ? 1 : 0));
    for (const recipe of sorted) {
      const can = this.game.crafting.canCraft(recipe, inv);
      const row = document.createElement('div');
      row.className = 'recipe' + (can ? '' : ' locked');
      const img = document.createElement('img');
      img.src = tileDataURL(itemTileKey(recipe.output));
      row.appendChild(img);
      const name = document.createElement('div');
      name.className = 'r-name';
      const outItem = getItem(recipe.output);
      name.textContent = (recipe.count > 1 ? recipe.count + '× ' : '') + (outItem?.label || recipe.output);
      row.appendChild(name);
      const cost = document.createElement('div');
      cost.className = 'r-cost';
      cost.textContent = Object.entries(recipe.inputs)
        .map(([n, c]) => `${c} ${getItem(n)?.label || n}`).join(' + ');
      row.appendChild(cost);
      if (can) {
        row.addEventListener('click', () => {
          const result = this.game.crafting.craft(recipe, inv);
          if (result && result.leftover) {
            const p = this.game.player.position;
            this.game.entities.spawnDrop(recipe.output, result.leftover, p.x, p.y + 1, p.z);
          }
          this.game.audio.play('click');
          this.render();
        });
      }
      list.appendChild(row);
    }
    return list;
  }

  // ---------- Slot adapters ----------

  invAdapter(i) {
    const inv = this.game.inventory;
    return {
      get: () => inv.slots[i],
      set: (v) => { inv.slots[i] = v; inv.changed(); },
      canPlace: () => true
    };
  }

  chestAdapter(i) {
    return {
      get: () => this.context.container.slots[i],
      set: (v) => { this.context.container.slots[i] = v; },
      canPlace: () => true
    };
  }

  furnaceAdapter(field) {
    return {
      get: () => this.context.container[field],
      set: (v) => { this.context.container[field] = v; },
      canPlace: (stack) => {
        if (field === 'output') return false;
        if (field === 'fuel') return !!getItem(stack.name)?.fuel;
        if (field === 'input') return !!getItem(stack.name)?.smelt;
        return true;
      }
    };
  }

  // ---------- Slot DOM + click handling ----------

  buildSlot(adapter, key) {
    const el = document.createElement('div');
    el.className = 'slot clickable';
    this.paintSlot(el, adapter.get());
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.slotClick(adapter, e.button);
      this.paintSlot(el, adapter.get());
      this.render(); // full refresh keeps everything consistent
    });
    this.attachTooltip(el, () => {
      const s = adapter.get();
      return s ? getItem(s.name) : null;
    });
    return el;
  }

  paintSlot(el, stack) {
    el.innerHTML = '';
    if (!stack) return;
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

  slotClick(adapter, button) {
    const inSlot = adapter.get();
    const cursor = this.cursor;
    const game = this.game;

    if (!cursor) {
      if (!inSlot) return;
      if (button === 2 && inSlot.count > 1) {
        // right click: pick up half
        const half = Math.ceil(inSlot.count / 2);
        this.cursor = { ...inSlot, count: half };
        inSlot.count -= half;
        adapter.set({ ...inSlot });
      } else {
        this.cursor = inSlot;
        adapter.set(null);
      }
    } else {
      if (!adapter.canPlace(cursor)) {
        // output-style slot: only allow taking
        if (inSlot && !adapter.get()?.locked) {
          if (inSlot.name === cursor.name && cursor.count + inSlot.count <= getItem(cursor.name).stack) {
            cursor.count += inSlot.count;
            adapter.set(null);
          }
        }
        this.updateCursorEl();
        game.audio.play('click');
        return;
      }
      if (!inSlot) {
        if (button === 2) {
          adapter.set({ ...cursor, count: 1 });
          cursor.count--;
          if (cursor.count <= 0) this.cursor = null;
        } else {
          adapter.set(cursor);
          this.cursor = null;
        }
      } else if (inSlot.name === cursor.name && inSlot.durability === undefined) {
        const cap = getItem(inSlot.name).stack;
        if (button === 2) {
          if (inSlot.count < cap) {
            inSlot.count++;
            cursor.count--;
            if (cursor.count <= 0) this.cursor = null;
            adapter.set({ ...inSlot });
          }
        } else {
          const move = Math.min(cursor.count, cap - inSlot.count);
          inSlot.count += move;
          cursor.count -= move;
          if (cursor.count <= 0) this.cursor = null;
          adapter.set({ ...inSlot });
        }
      } else {
        // swap
        adapter.set(cursor);
        this.cursor = inSlot;
      }
    }
    this.updateCursorEl();
    game.audio.play('click');
  }

  updateCursorEl() {
    if (this.cursor) {
      this.cursorEl.classList.remove('hidden');
      this.cursorEl.innerHTML = '';
      const img = document.createElement('img');
      img.src = tileDataURL(itemTileKey(this.cursor.name));
      this.cursorEl.appendChild(img);
      if (this.cursor.count > 1) {
        const c = document.createElement('div');
        c.className = 'count';
        c.textContent = this.cursor.count;
        this.cursorEl.appendChild(c);
      }
    } else {
      this.cursorEl.classList.add('hidden');
      this.cursorEl.innerHTML = '';
    }
  }

  attachTooltip(el, getItemFn) {
    el.addEventListener('mousemove', (e) => {
      const item = getItemFn();
      if (!item) {
        this.ui.hideTooltip();
        return;
      }
      let sub = '';
      if (item.tool) sub = `${item.tool.class} · tier ${item.tool.tier}`;
      else if (item.food) sub = `restores ${item.food.hunger} hunger`;
      else if (item.fuel) sub = `fuel · burns ${item.fuel}s`;
      this.ui.showTooltip(e.clientX, e.clientY, item.label, sub);
    });
    el.addEventListener('mouseleave', () => this.ui.hideTooltip());
  }
}
