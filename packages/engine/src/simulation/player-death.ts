import { isSparklerId } from "../ownership/sparkler-state";
import { AIR } from "../catalog/blocks";
import { INVENTORY_SIZE, type Inventory, type ItemStack } from "../ownership/inventory";
import { ARMOR_SLOTS, armorOf, durabilityOf } from "../catalog/items";
import { WORLD_BORDER, type Vec3 } from "../core/math";
import { sanitizeStack } from "../persistence/savecheck";
import { cloneStack } from "../ownership/stack";
import type { DropSink } from "../ownership/world-drops";

export const MAX_PLAYER_HEALTH = 20;
/** The original inventory/pending slots own a refused transfer; this state never duplicates stacks. */
export interface PlayerDeathState { phase: "pending" | "complete"; position: Vec3; keepInventory: boolean }
export interface PlayerStateData { health: number; death?: PlayerDeathState }
export interface SanitizedPlayerState { data: PlayerStateData; invalid: number; present: boolean }
const plain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const own = (value: Record<string, unknown>, key: string): unknown => Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const vector = (value: unknown): value is Vec3 => plain(value) && finite(own(value, "x")) && finite(own(value, "y")) && finite(own(value, "z")) && Math.abs(value.x as number) <= WORLD_BORDER && Math.abs(value.z as number) <= WORLD_BORDER && Math.abs(value.y as number) <= 1024;

/** Absent legacy data is alive/full health. Invalid present data must gate save overwrite in its caller. */
export function sanitizePlayerState(raw: unknown): SanitizedPlayerState {
  const present = raw !== undefined, fallback = { data: { health: MAX_PLAYER_HEALTH }, invalid: present ? 1 : 0, present };
  if (!present) return fallback;
  try {
    if (!plain(raw)) return fallback;
    const health = own(raw, "health"), death = own(raw, "death");
    if (!finite(health) || health < 0 || health > MAX_PLAYER_HEALTH) return fallback;
    if (death === undefined) return health > 0 ? { data: { health }, invalid: 0, present } : fallback;
    if (health !== 0 || !plain(death)) return fallback;
    const phase = own(death, "phase"), position = own(death, "position"), keepInventory = own(death, "keepInventory");
    if ((phase !== "pending" && phase !== "complete") || !vector(position) || typeof keepInventory !== "boolean") return fallback;
    return { data: { health, death: { phase, position: { ...position }, keepInventory } }, invalid: 0, present };
  } catch { return fallback; }
}

/** Validate without repairing/truncating owned metadata; a rejected stack remains at its source. */
function ownedStack(raw: unknown): ItemStack | null {
  if (!plain(raw) || Object.keys(raw).some(key => !["id", "count", "damage", "book", "glow", "sparkler"].includes(key))) return null;
  const id = own(raw, "id"), count = own(raw, "count"), damage = own(raw, "damage"), book = own(raw, "book");
  const clean = sanitizeStack(raw);
  if (!clean || id === AIR || clean.id !== id || clean.count !== count) return null;
  if (damage !== undefined) {
    const durability = durabilityOf(clean.id);
    if (!Number.isInteger(damage) || (damage as number) < 0 || durability === null || (damage as number) >= durability) return null;
  }
  if (book !== undefined && (!plain(book) || Object.keys(book).some(key => !["pages", "title", "author"].includes(key)) || !Array.isArray(own(book, "pages")) || JSON.stringify(clean.book?.pages) !== JSON.stringify(own(book, "pages")) || clean.book?.title !== own(book, "title") || clean.book?.author !== own(book, "author"))) return null;
  return cloneStack(raw as unknown as ItemStack);
}

/** Strict raw ownership read, before Inventory.fromJSON or pending-item repair can discard data. */
function deathOwnedStacks(rawInventory: unknown, rawPending: unknown): ItemStack[] | null {
  try {
    if (!plain(rawInventory)) return null;
    const slots = own(rawInventory, "slots"), equipment = own(rawInventory, "equipment");
    if (!Array.isArray(slots) || slots.length !== INVENTORY_SIZE || equipment !== undefined && (!plain(equipment) || Object.keys(equipment).some(key => !(ARMOR_SLOTS as readonly string[]).includes(key)))) return null;
    // The current pending-save loader supports ten simultaneous owned screen cells. Refuse a raw
    // suffix it would truncate rather than silently declaring that repaired world safe to overwrite.
    const pending = rawPending === undefined ? [] : rawPending;
    if (!Array.isArray(pending) || pending.length > 10) return null;
    const stacks: ItemStack[] = [];
    for (const slot of slots) {
      if (slot === null) continue;
      const clean = ownedStack(slot); if (!clean) return null; stacks.push(clean);
    }
    if (Object.prototype.hasOwnProperty.call(rawInventory, "offhand")) {
      const offhand = own(rawInventory, "offhand");
      if (offhand !== null) {
        const clean = ownedStack(offhand); if (!clean || !isSparklerId(clean.id)) return null; stacks.push(clean);
      }
    }
    if (equipment !== undefined) for (const slot of ARMOR_SLOTS) {
      const piece = own(equipment as Record<string, unknown>, slot); if (piece === undefined || piece === null) continue;
      const clean = ownedStack(piece); if (!clean || clean.count !== 1 || armorOf(clean.id)?.slot !== slot) return null; stacks.push(clean);
    }
    for (const stack of pending) { const clean = ownedStack(stack); if (!clean) return null; stacks.push(clean); }
    return stacks;
  } catch { return null; }
}

/** False means unsafe ownership, not a temporarily refusing drop receiver. Preserve raw save data. */
export function validatePlayerDeathOwnership(rawInventory: unknown, rawPending: unknown): boolean {
  return deathOwnedStacks(rawInventory, rawPending) !== null;
}

/** Single synchronous ownership transfer for one live/persisted death state.
 * clearPending must be nonthrowing synchronous assignments only, never a UI callback or bag return.
 * Callers flush draft editors and block owner mutation before entering this transaction.
 */
export class PlayerDeathTransfer {
  private transferring = false;
  tryTransfer(inventory: Inventory, pending: readonly ItemStack[], death: PlayerDeathState, sink: DropSink, clearPending: () => void): boolean {
    if (this.transferring) return false;
    if (sanitizePlayerState({ health: 0, death }).invalid) return false;
    if (death.phase === "complete") return true;
    this.transferring = true;
    try {
      const stacks = deathOwnedStacks({ slots: inventory.slots, equipment: inventory.equipment, ...(inventory.offhand ? { offhand: inventory.offhand } : {}) }, pending);
      if (!stacks) return false;
      if (death.keepInventory) { death.phase = "complete"; return true; }
      try {
        const batch = sink(stacks, { ...death.position });
        if (!batch || !batch.commit()) return false;
      } catch { return false; }
      // Reservation succeeded in full. These assignments and the caller's reset cannot return items.
      inventory.slots.fill(null);
      inventory.offhand = null;
      for (const slot of ARMOR_SLOTS) inventory.equipment[slot] = null;
      death.phase = "complete";
      clearPending();
      return true;
    } finally { this.transferring = false; }
  }
}
