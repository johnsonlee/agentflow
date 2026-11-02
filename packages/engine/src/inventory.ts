export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36;
export const MAX_STACK = 64;

export interface ItemStack {
  id: number;
  count: number;
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
    let left = count;
    for (const stack of this.slots) {
      if (left === 0) break;
      if (stack && stack.id === id && stack.count < MAX_STACK) {
        const n = Math.min(MAX_STACK - stack.count, left);
        stack.count += n;
        left -= n;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(MAX_STACK, left);
        this.slots[i] = { id, count: n };
        left -= n;
      }
    }
    return left;
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

  swap(a: number, b: number): void {
    const t = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = t;
  }

  toJSON(): { slots: (ItemStack | null)[]; selected: number } {
    return { slots: this.slots.map((s) => (s ? { ...s } : null)), selected: this.selected };
  }

  static fromJSON(data: { slots: (ItemStack | null)[]; selected: number }): Inventory {
    const inv = new Inventory();
    data.slots.slice(0, INVENTORY_SIZE).forEach((s, i) => inv.setSlot(i, s));
    inv.select(data.selected);
    return inv;
  }
}
