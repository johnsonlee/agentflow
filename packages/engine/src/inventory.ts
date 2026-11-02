import { isKnownId, maxStackOf, toolOf } from "./items";

export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36;

export interface ItemStack {
  /** Block id, or item id (>= ITEM_ID_BASE). */
  id: number;
  count: number;
  /** Uses spent on a tool (absent or 0 = new). */
  damage?: number;
  /** Book & Quill / Written Book contents. */
  book?: { pages: string[]; title?: string; author?: string };
}

/** Player inventory: slots 0-8 are the hotbar. */
export class Inventory {
  readonly slots: (ItemStack | null)[] = new Array(INVENTORY_SIZE).fill(null);
  selected = 0;

  selectedStack(): ItemStack | null {
    return this.slots[this.selected];
  }

  select(slot: number): void {
    this.selected = ((slot % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
  }

  scroll(delta: number): void {
    this.select(this.selected + Math.sign(delta));
  }

  /** Adds items, filling existing stacks first. Returns the number that did not fit. */
  add(id: number, count = 1): number {
    return this.addStack({ id, count });
  }

  /**
   * Adds a stack, keeping its tool damage. Tools (max stack 1) never merge.
   * Returns the number of items that did not fit.
   */
  addStack(stack: ItemStack): number {
    const max = maxStackOf(stack.id);
    let left = stack.count;
    if (max > 1) {
      for (const s of this.slots) {
        if (left === 0) break;
        if (s && s.id === stack.id && s.count < max) {
          const n = Math.min(max - s.count, left);
          s.count += n;
          left -= n;
        }
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(max, left);
        const s: ItemStack = { id: stack.id, count: n };
        if (stack.damage) s.damage = stack.damage;
        if (stack.book) s.book = { ...stack.book, pages: [...stack.book.pages] };
        this.slots[i] = s;
        left -= n;
      }
    }
    return left;
  }

  /**
   * Wears the tool in the selected slot by `uses`. Returns true if it broke (and was removed).
   * Does nothing for non-tools.
   */
  damageSelected(uses = 1): boolean {
    const stack = this.slots[this.selected];
    const tool = toolOf(stack?.id);
    if (!stack || !tool) return false;
    stack.damage = (stack.damage ?? 0) + uses;
    if (stack.damage >= tool.durability) {
      this.slots[this.selected] = null;
      return true;
    }
    return false;
  }

  /** Removes one item from the selected hotbar slot. Returns the removed block id or null. */
  takeSelected(): number | null {
    const stack = this.slots[this.selected];
    if (!stack) return null;
    stack.count--;
    if (stack.count <= 0) this.slots[this.selected] = null;
    return stack.id;
  }

  /** Creative pick: puts a block in the hotbar, reusing a slot that already holds it. */
  pick(id: number): void {
    const existing = this.slots.findIndex((s, i) => i < HOTBAR_SIZE && s?.id === id);
    if (existing >= 0) {
      this.selected = existing;
      return;
    }
    this.slots[this.selected] = { id, count: 1 };
  }

  setSlot(slot: number, stack: ItemStack | null): void {
    this.slots[slot] = stack ? { ...stack } : null;
  }

  /** How many more of `id` could be added to the inventory. */
  spaceFor(id: number): number {
    const max = maxStackOf(id);
    return this.slots.reduce((n, s) => n + (!s ? max : s.id === id && max > 1 ? max - s.count : 0), 0);
  }

  swap(a: number, b: number): void {
    const t = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = t;
  }

  toJSON(): { slots: (ItemStack | null)[]; selected: number } {
    return { slots: this.slots.map((s) => (s ? { ...s } : null)), selected: this.selected };
  }

  /** Loads a saved inventory. Saves from before items existed load unchanged; unknown ids are dropped. */
  static fromJSON(data: { slots: (ItemStack | null)[]; selected: number }): Inventory {
    const inv = new Inventory();
    if (!data || !Array.isArray(data.slots)) return inv;
    data.slots.slice(0, INVENTORY_SIZE).forEach((s, i) => {
      if (!s || !isKnownId(s.id) || !(s.count > 0)) return;
      const max = maxStackOf(s.id);
      const stack: ItemStack = { id: s.id, count: Math.min(s.count, max) };
      if (toolOf(s.id) && s.damage) stack.damage = s.damage;
      if (s.book && typeof s.book === "object" && Array.isArray(s.book.pages)) {
        stack.book = { pages: s.book.pages.map(String).slice(0, 50) };
        if (typeof s.book.title === "string") stack.book.title = s.book.title;
        if (typeof s.book.author === "string") stack.book.author = s.book.author;
      }
      inv.setSlot(i, stack);
    });
    inv.select(Number.isInteger(data.selected) ? data.selected : 0);
    return inv;
  }
}
