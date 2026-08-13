// Inventory: slot array of { name, count, durability? } | null.
// Slots 0-8 are the hotbar. Also used for chest containers.

import { getItem } from '../world/ItemRegistry.js';
import { INVENTORY_SIZE, HOTBAR_SIZE } from '../core/constants.js';

export function maxStack(name) {
  const it = getItem(name);
  return it ? it.stack : 64;
}

export function makeStack(name, count = 1) {
  const it = getItem(name);
  if (!it) return null;
  const stack = { name, count };
  if (it.tool) stack.durability = it.tool.durability;
  return stack;
}

export class Inventory {
  constructor(size = INVENTORY_SIZE) {
    this.slots = new Array(size).fill(null);
    this.selected = 0; // hotbar index
    this.onChange = null;
  }

  changed() {
    if (this.onChange) this.onChange();
  }

  get selectedStack() {
    return this.slots[this.selected];
  }

  // Add items; returns leftover count that didn't fit.
  add(name, count = 1, durability = undefined) {
    const it = getItem(name);
    if (!it) return count;
    let left = count;
    const cap = it.stack;
    // fill existing stacks first (tools never stack)
    if (cap > 1) {
      for (let i = 0; i < this.slots.length && left > 0; i++) {
        const s = this.slots[i];
        if (s && s.name === name && s.count < cap) {
          const take = Math.min(cap - s.count, left);
          s.count += take;
          left -= take;
        }
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (!this.slots[i]) {
        const stack = makeStack(name, Math.min(cap, left));
        if (durability !== undefined) stack.durability = durability;
        this.slots[i] = stack;
        left -= stack.count;
      }
    }
    if (left !== count) this.changed();
    return left;
  }

  // Remove `count` of item `name`; returns how many were actually removed.
  remove(name, count = 1) {
    let need = count;
    for (let i = 0; i < this.slots.length && need > 0; i++) {
      const s = this.slots[i];
      if (s && s.name === name) {
        const take = Math.min(s.count, need);
        s.count -= take;
        need -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    if (need !== count) this.changed();
    return count - need;
  }

  count(name) {
    let n = 0;
    for (const s of this.slots) if (s && s.name === name) n += s.count;
    return n;
  }

  // Consume 1 from a specific slot
  consumeSlot(index, count = 1) {
    const s = this.slots[index];
    if (!s) return false;
    s.count -= count;
    if (s.count <= 0) this.slots[index] = null;
    this.changed();
    return true;
  }

  // Damage the tool in a slot; returns true if it broke.
  damageTool(index, amount = 1) {
    const s = this.slots[index];
    if (!s || s.durability === undefined) return false;
    s.durability -= amount;
    if (s.durability <= 0) {
      this.slots[index] = null;
      this.changed();
      return true;
    }
    this.changed();
    return false;
  }

  // Take everything out (death drop)
  drainAll() {
    const all = [];
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i]) {
        all.push(this.slots[i]);
        this.slots[i] = null;
      }
    }
    this.changed();
    return all;
  }

  isEmpty() {
    return this.slots.every(s => !s);
  }

  serialize() {
    return { selected: this.selected, slots: this.slots.map(s => (s ? { ...s } : null)) };
  }

  deserialize(data) {
    if (!data) return;
    this.selected = data.selected ?? 0;
    const slots = data.slots || [];
    for (let i = 0; i < this.slots.length; i++) {
      const s = slots[i];
      this.slots[i] = s && getItem(s.name) ? { ...s } : null;
    }
    this.changed();
  }
}

export { HOTBAR_SIZE };
