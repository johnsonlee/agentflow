import {registerInventoryOwner,isInventoryBusy} from './inventory-lease';
import { planMilkFill, inspectBucketOwner, type MilkFillResult } from "./buckets";
import { planBottleFill, planBottleDrink, inspectBottleOwner, type BottleFillResult, type BottleDrinkResult } from "./bottles";
import { inspectItemState } from "./item-state";
import { isSparklerId, type SparklerState, type SparklerActivationResult } from "./sparkler-state";
import { ARMOR_SLOTS, armorOf, baseStackId, isKnownId, stackId, toolOf, type ArmorSlot } from "../catalog/items";
import { cloneStack, cloneStackWithBaseId, hasCloneableBookMetadata, insertStackIntoSlots, planGlowActivation, planSparklerActivation, spaceForStackInSlots, stackLimit, stacksCompatible } from "./stack";
import { freshStack, type GlowActivationResult, type GlowStickState } from "./glow-stick-state";
import { sanitizeStack } from "../persistence/savecheck";

export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36;

export interface ItemStack {
  /** A registered block/item stack ID; extended blocks share the unsigned16-bit namespace. */
  id: number;
  count: number;
  /** Uses spent on a tool or armor (absent or 0 = new). */
  damage?: number;
  /** Book & Quill / Written Book contents. */
  book?: import("./book-state").BookData;
  /** Optional application-owned shake activation. Absence preserves legacy saves. */
  glow?: GlowStickState;
  /** Optional untimed application Sparkler activation, distinct from Glow. */
  sparkler?: SparklerState;
}

export interface InventoryData {
  slots: (ItemStack | null)[];
  selected: number;
  /** Initially bounded to Sparkler products; absent legacy saves mean empty. */
  offhand?: ItemStack | null;
  /** Optional in older saves; malformed pieces are independently discarded. */
  equipment?: Partial<Record<ArmorSlot, ItemStack | null>>;
}

/** Player inventory: slots 0-8 are the hotbar. */
export class Inventory {
  readonly slots: (ItemStack | null)[] = new Array(INVENTORY_SIZE).fill(null);
  selected = 0;
  offhand: ItemStack | null = null;
  readonly equipment: Record<ArmorSlot, ItemStack | null> = { head: null, chest: null, legs: null, feet: null };

  constructor(){registerInventoryOwner(this,this.slots);}
  get busy():boolean{return isInventoryBusy(this);}

  selectedStack(): ItemStack | null {
    return this.slots[this.selected];
  }

  select(slot: number): void {
    if(isInventoryBusy(this))return;
    this.selected = ((slot % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
  }

  scroll(delta: number): void {
    if(isInventoryBusy(this))return;
    this.select(this.selected + Math.sign(delta));
  }

  /** Adds items, filling existing stacks first. Returns the number that did not fit. */
  add(id: number, count = 1): number {
    if(isInventoryBusy(this))return count;
    return this.addStack(freshStack(id, count));
  }

  /**
   * Adds a stack, keeping its tool damage. Tools (max stack 1) never merge.
   * Returns the number of items that did not fit.
   */
  addStack(stack: ItemStack): number {
    if(isInventoryBusy(this)){const count=Object.getOwnPropertyDescriptor(stack,'count')?.value;return Number.isSafeInteger(count)&&count>0?count:1;}
    return insertStackIntoSlots(this.slots, stack);
  }

  /** One synchronous ownership commit. UI/clock/callbacks are deliberately absent. */
  activateSelectedGlow(): GlowActivationResult {
    if(isInventoryBusy(this))return{ok:false,reason:"invalid-state"};
    const plan = planGlowActivation(this.slots, this.selected);
    if (!plan.ok) return plan;
    for (let index = 0; index < this.slots.length; index++) this.slots[index] = plan.slots[index];
    return { ok: true, kind: "activated", color: plan.color };
  }

  /** Caller verifies reachable water/lifecycle; this is one whole-container ownership commit. */
  fillSelectedBottle(): BottleFillResult {
    if(isInventoryBusy(this))return{ok:false,reason:"invalid-state"};
    const plan=planBottleFill(this.slots,this.selected);
    if (!plan.ok) return plan;
    for(let index=0;index<this.slots.length;index++) this.slots[index]=plan.slots[index];
    return {ok:true};
  }

  /** Caller earns the held-use duration and verifies lifecycle; commit keeps one finite container. */
  drinkSelectedWaterBottle(): BottleDrinkResult {
    if(isInventoryBusy(this))return{ok:false,reason:"invalid-state"};
    const plan = planBottleDrink(this.slots, this.selected);
    if (!plan.ok) return plan;
    if (this.selected !== plan.index || this.slots[plan.index] !== plan.source || inspectBottleOwner(plan.source).kind === "invalid")
      return { ok: false, reason: "invalid-state" };
    this.slots[plan.index] = plan.replacement;
    return { ok: true };
  }

  /** Caller verifies a live reachable adult Cow without a pending death; no animal is consumed. */
  fillSelectedMilkBucket(): MilkFillResult {
    if(isInventoryBusy(this))return{ok:false,reason:"invalid-state"};
    const slots=this.slots, selected=this.selected;
    // Every cell is a destination in this detached-plan commit. Refuse accessors and locked
    // data cells before any write, including unrelated late cells that could otherwise throw.
    const writableDestinations=()=>Array.isArray(slots)&&slots.length===INVENTORY_SIZE&&Array.from({length:INVENTORY_SIZE},(_,index)=>{
      const descriptor=Object.getOwnPropertyDescriptor(slots,String(index));
      return !!descriptor&&"value" in descriptor&&descriptor.writable===true;
    }).every(Boolean);
    if(!writableDestinations())return {ok:false,reason:"invalid-state"};
    const plan=planMilkFill(slots,selected);
    if(!plan.ok)return plan;
    if(this.selected!==plan.index||this.slots!==slots||slots[plan.index]!==plan.source||plan.source.count!==plan.sourceCount||inspectBucketOwner(plan.source).kind==="invalid"||!writableDestinations())return {ok:false,reason:"invalid-state"};
    for(let index=0;index<slots.length;index++)slots[index]=plan.slots[index];
    return {ok:true};
  }

  /** Offhand accepts Sparklers only; refusal leaves both owners unchanged. */
  setOffhand(stack: ItemStack | null): boolean {
    if(isInventoryBusy(this))return false;
    if (stack && (!isSparklerId(stack.id) || !Number.isSafeInteger(stack.count) || stack.count < 1
      || inspectItemState(stack).kind === "invalid" || !hasCloneableBookMetadata(stack) || stack.count > stackLimit(stack))) return false;
    this.offhand = stack ? cloneStack(stack) : null;
    return true;
  }

  swapSelectedOffhand(): boolean {
    if(isInventoryBusy(this))return false;
    if (!Number.isInteger(this.selected) || this.selected < 0 || this.selected >= HOTBAR_SIZE) return false;
    const main = this.selectedStack(), off = this.offhand;
    const valid = (stack: ItemStack | null) => stack === null || isSparklerId(stack.id) && Number.isSafeInteger(stack.count)
      && stack.count >= 1 && stack.count <= stackLimit(stack) && inspectItemState(stack).kind !== "invalid" && hasCloneableBookMetadata(stack);
    if (!valid(main) || !valid(off)) return false;
    this.slots[this.selected] = off ? cloneStack(off) : null;
    this.offhand = main ? cloneStack(main) : null;
    return true;
  }

  activateSelectedSparkler(): SparklerActivationResult {
    if(isInventoryBusy(this))return{ok:false,reason:"invalid-state"};
    if (!Number.isInteger(this.selected) || this.selected < 0 || this.selected >= HOTBAR_SIZE) return { ok: false, reason: "invalid-state" };
    const plan = planSparklerActivation(this.slots, this.selectedStack(), this.selected);
    if (!plan.ok) return plan;
    for (let i = 0; i < this.slots.length; i++) this.slots[i] = i === this.selected ? plan.active : plan.slots[i];
    return { ok: true, kind: "activated", color: plan.color };
  }

  activateOffhandSparkler(): SparklerActivationResult {
    if(isInventoryBusy(this))return{ok:false,reason:"invalid-state"};
    if (!Number.isInteger(this.selected) || this.selected < 0 || this.selected >= HOTBAR_SIZE) return { ok: false, reason: "invalid-state" };
    const plan = planSparklerActivation(this.slots, this.offhand, this.selected);
    if (!plan.ok) return plan;
    // The selected main-hand owner is never debited, merged into, replaced or activated here.
    for (let i = 0; i < this.slots.length; i++) if (i !== this.selected) this.slots[i] = plan.slots[i];
    this.offhand = plan.active;
    return { ok: true, kind: "activated", color: plan.color };
  }

  /**
   * Wears the tool in the selected slot by `uses`. Returns true if it broke (and was removed).
   * Does nothing for non-tools.
   */
  damageSelected(uses = 1): boolean {
    if(isInventoryBusy(this))return false;
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
    if(isInventoryBusy(this))return{ok:false,stack:incoming};
    if (!ARMOR_SLOTS.includes(slot)) return { ok: false, stack: incoming };
    const clean = incoming === null ? null : sanitizeStack(incoming);
    if (incoming !== null && (!clean || clean.count !== 1 || armorOf(clean.id)?.slot !== slot)) return { ok: false, stack: incoming };
    const previous = this.equipment[slot];
    this.equipment[slot] = clean;
    return { ok: true, stack: previous ? { ...previous } : null };
  }

  /** Equips one inventory piece; any previous piece takes its vacated bag slot, even in a full bag. */
  equipFromSlot(index: number): boolean {
    if(isInventoryBusy(this))return false;
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
    if(isInventoryBusy(this))return false;
    if (!ARMOR_SLOTS.includes(slot)) return false;
    const piece = this.equipment[slot];
    if (!piece || this.spaceFor(piece.id) < 1) return false;
    if (this.addStack(piece) !== 0) return false;
    this.equipment[slot] = null;
    return true;
  }

  /** Removes one item from the selected hotbar slot. Returns the removed block id or null. */
  takeSelected(): number | null {
    if(isInventoryBusy(this))return null;
    const stack = this.slots[this.selected];
    if (!stack) return null;
    stack.count--;
    if (stack.count <= 0) this.slots[this.selected] = null;
    return stack.id;
  }

  /** Creative pick: puts a block in the hotbar, reusing a slot that already holds it. */
  pick(id: number, legacy = false): void {
    if(isInventoryBusy(this))return;
    if (!isKnownId(id)) return;
    id = baseStackId(id);
    // Only an explicit old placed-green block pick creates its legacy item owner.
    const desired = legacy && id === stackId("glow_stick") ? { id, count: 1 } : freshStack(id);
    const existing = this.slots.findIndex((stack, index) => index < HOTBAR_SIZE && stack !== null && stacksCompatible(stack, desired));
    if (existing >= 0) {
      this.selected = existing;
      return;
    }
    this.slots[this.selected] = desired;
  }

  /** Refusal leaves both owners unchanged. Callers must check true before debiting a cursor/source. */
  setSlot(slot: number, stack: ItemStack | null): boolean {
    if(isInventoryBusy(this))return false;
    if (!Number.isInteger(slot) || slot < 0 || slot >= INVENTORY_SIZE) return false;
    if (stack && (!isKnownId(stack.id) || !Number.isSafeInteger(stack.count) || stack.count < 1
      || inspectItemState(stack).kind === "invalid" || !hasCloneableBookMetadata(stack) || stack.count > stackLimit(stack))) return false;
    this.slots[slot] = stack ? cloneStackWithBaseId(stack) : null;
    return true;
  }

  /** Legacy ID-only capacity remains a metadata-less query. Stateful callers use spaceForStack. */
  spaceFor(id: number): number { return this.spaceForStack({ id, count: 1 }); }

  spaceForStack(stack: ItemStack): number { return spaceForStackInSlots(this.slots, stack); }

  swap(a: number, b: number): void {
    if(isInventoryBusy(this))return;
    const t = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = t;
  }

  toJSON(): InventoryData {
    return {
      slots: this.slots.map((s) => (s ? cloneStack(s) : null)), selected: this.selected,
      ...(this.offhand ? { offhand: cloneStack(this.offhand) } : {}),
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
    if (Object.prototype.hasOwnProperty.call(data, "offhand")) {
      const stack = data.offhand === null ? null : sanitizeStack(data.offhand);
      if (data.offhand === null || stack) inv.setOffhand(stack);
    }
    inv.select(Number.isInteger(data.selected) ? data.selected : 0);
    return inv;
  }
}
