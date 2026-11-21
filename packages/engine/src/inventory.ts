import { ARMOR_SLOTS, armorOf, baseStackId, isKnownId, maxStackOf, toolOf, type ArmorSlot } from "./items";
import { cloneStack, stacksCompatible } from "./stack";
import { sanitizeStack } from "./savecheck";

export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36;

export interface ItemStack {
  /** A registered block/item stack ID; extended blocks share the unsigned16-bit namespace. */
  id: number;
  count: number;
  /** Uses spent on a tool or armor (absent or 0 = new). */
  damage?: number;
  /** Book & Quill / Written Book contents. */
  book?: { pages: string[]; title?: string; author?: string };
}

export interface InventoryData {
  slots: (ItemStack | null)[];
  selected: number;
  /** Optional in older saves; malformed pieces are independently discarded. */
  equipment?: Partial<Record<ArmorSlot, ItemStack | null>>;
}

/** Player inventory: slots 0-8 are the hotbar. */
export class Inventory {
  readonly slots: (ItemStack | null)[] = new Array(INVENTORY_SIZE).fill(null);
  selected = 0;
  readonly equipment: Record<ArmorSlot, ItemStack | null> = { head: null, chest: null, legs: null, feet: null };

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
    if (!isKnownId(stack.id)) return stack.count;
    stack = { ...cloneStack(stack), id: baseStackId(stack.id) };
    const max = maxStackOf(stack.id);
    let left = stack.count;
    if (max > 1) {
      for (const s of this.slots) {
        if (left === 0) break;
        if (s && stacksCompatible(s, stack) && s.count < max) {
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

  /** Exchanges a cursor stack with a matching equipment slot, without losing either item. */
  swapEquipment(slot: ArmorSlot, incoming: ItemStack | null): { ok: boolean; stack: ItemStack | null } {
    if (!ARMOR_SLOTS.includes(slot)) return { ok: false, stack: incoming };
    const clean = incoming === null ? null : sanitizeStack(incoming);
    if (incoming !== null && (!clean || clean.count !== 1 || armorOf(clean.id)?.slot !== slot)) return { ok: false, stack: incoming };
    const previous = this.equipment[slot];
    this.equipment[slot] = clean;
    return { ok: true, stack: previous ? { ...previous } : null };
  }

  /** Equips one inventory piece; any previous piece takes its vacated bag slot, even in a full bag. */
  equipFromSlot(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= INVENTORY_SIZE) return false;
    const stack = this.slots[index];
    const armor = armorOf(stack?.id);
    if (!stack || !armor) return false;
    const result = this.swapEquipment(armor.slot, stack);
    if (!result.ok) return false;
    this.slots[index] = result.stack;
    return true;
  }

  /** Moves a piece into the bag only if it fits; a full bag leaves equipment unchanged. */
  unequip(slot: ArmorSlot): boolean {
    if (!ARMOR_SLOTS.includes(slot)) return false;
    const piece = this.equipment[slot];
    if (!piece || this.spaceFor(piece.id) < 1) return false;
    if (this.addStack(piece) !== 0) return false;
    this.equipment[slot] = null;
    return true;
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
    if (!isKnownId(id)) return;
    id = baseStackId(id);
    const existing = this.slots.findIndex((s, i) => i < HOTBAR_SIZE && s?.id === id);
    if (existing >= 0) {
      this.selected = existing;
      return;
    }
    this.slots[this.selected] = { id, count: 1 };
  }

  setSlot(slot: number, stack: ItemStack | null): void {
    this.slots[slot] = stack ? { ...cloneStack(stack), id: baseStackId(stack.id) } : null;
  }

  /** How many more of `id` could be added to the inventory. */
  spaceFor(id: number): number {
    if (!isKnownId(id)) return 0;
    id = baseStackId(id);
    const max = maxStackOf(id);
    return this.slots.reduce((n, s) => n + (!s ? max : s.id === id && max > 1 ? max - s.count : 0), 0);
  }

  swap(a: number, b: number): void {
    const t = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = t;
  }

  toJSON(): InventoryData {
    return {
      slots: this.slots.map((s) => (s ? cloneStack(s) : null)), selected: this.selected,
      equipment: Object.fromEntries(ARMOR_SLOTS.map((slot) => [slot, this.equipment[slot] ? cloneStack(this.equipment[slot]!) : null])),
    };
  }

  /** Loads a saved inventory. Saves from before items existed load unchanged; unknown ids are dropped. */
  static fromJSON(data: InventoryData): Inventory {
    const inv = new Inventory();
    if (!data || !Array.isArray(data.slots)) return inv;
    data.slots.slice(0, INVENTORY_SIZE).forEach((s, i) => {
      // Strict: integer id/count (1..stack max) and integer tool wear (0..durability-1).
      const stack = sanitizeStack(s);
      if (!s || !stack) return;
      inv.setSlot(i, stack);
    });
    // Equipment is optional and own-property-only: prototype keys never resolve to pieces.
    const equipment = Object.prototype.hasOwnProperty.call(data, "equipment") ? data.equipment : undefined;
    if (equipment && typeof equipment === "object" && !Array.isArray(equipment) &&
      (Object.getPrototypeOf(equipment) === Object.prototype || Object.getPrototypeOf(equipment) === null)) {
      for (const slot of ARMOR_SLOTS) {
        if (Object.prototype.hasOwnProperty.call(equipment, slot)) inv.swapEquipment(slot, equipment[slot] ?? null);
      }
    }
    inv.select(Number.isInteger(data.selected) ? data.selected : 0);
    return inv;
  }
}
