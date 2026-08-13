// Automatic recipe detection + crafting against an inventory.

import { RECIPES } from './recipes.js';
import { getItem } from '../world/ItemRegistry.js';

export class CraftingSystem {
  // Recipes visible in a context ('hand' | 'bench'). Bench shows everything.
  availableRecipes(bench) {
    return RECIPES.filter(r => bench || !r.bench);
  }

  canCraft(recipe, inventory) {
    for (const [name, count] of Object.entries(recipe.inputs)) {
      if (inventory.count(name) < count) return false;
    }
    return true;
  }

  // How many times the recipe could be crafted with current materials.
  craftableCount(recipe, inventory) {
    let n = Infinity;
    for (const [name, count] of Object.entries(recipe.inputs)) {
      n = Math.min(n, Math.floor(inventory.count(name) / count));
    }
    return n === Infinity ? 0 : n;
  }

  // Craft once. Returns true on success.
  craft(recipe, inventory) {
    if (!this.canCraft(recipe, inventory)) return false;
    if (!getItem(recipe.output)) return false;
    for (const [name, count] of Object.entries(recipe.inputs)) {
      inventory.remove(name, count);
    }
    const left = inventory.add(recipe.output, recipe.count);
    if (left > 0) {
      // inventory full — refund what didn't fit is dropped by caller
      return { leftover: left };
    }
    return true;
  }
}
