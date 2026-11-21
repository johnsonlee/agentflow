import { expect, it } from "vitest";
import {
  AIR, COMMAND_HELP, Inventory, MAX_PLAYER_HEALTH, PlayerDeathTransfer, WorldDrops, blockId, parseCommand,
  parseSave, sanitizePlayerState, serializeSave, stackId, validatePlayerDeathOwnership, type ItemStack, type PlayerDeathState, type DropSink,
} from "../src";
const position = { x: 4.5, y: 70.125, z: -8.5 };
const floor = { getLoadedBlock: (_x: number, y: number, _z: number) => y === 0 ? blockId("stone") : AIR };
const stack = (name: string, count = 1): ItemStack => ({ id: stackId(name), count });
const death = (keepInventory = false): PlayerDeathState => ({ phase: "pending", position: { ...position }, keepInventory });
const base = { name: "death ownership", seed: 12, mode: "survival" as const, timeOfDay: .2,
  player: { position, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), edits: [] };
function owners() {
  const inv = new Inventory(); inv.slots[0] = { ...stack("iron_pickaxe"), damage: 37 };
  inv.slots[1] = { ...stack("written_book"), book: { pages: ["owned page", "second"], title: "My book", author: "Teacher" } };
  inv.slots[35] = stack("diamond", 64); inv.selected = 8;
  inv.equipment.head = { ...stack("iron_helmet"), damage: 9 };
  inv.equipment.feet = { ...stack("iron_boots"), damage: 4 };
  const pending = [stack("oak_planks", 17), { ...stack("book_and_quill"), book: { pages: ["draft flushed before death"] } }];
  return { inv, pending };
}

it("transfers every bag/equipment/pending owner once into real world records, including wear and book metadata", () => {
  const { inv, pending } = owners(), expected = structuredClone([...inv.slots.filter((s): s is ItemStack => s !== null), inv.equipment.head!, inv.equipment.feet!, ...pending]);
  const d = death(), resolver = new PlayerDeathTransfer(), drops = new WorldDrops(floor); let clears = 0;
  expect(resolver.tryTransfer(inv, pending, d, drops.planSpawnBatch.bind(drops), () => { pending.length = 0; clears++; })).toBe(true);
  expect(d.phase).toBe("complete"); expect(inv.slots.every(s => s === null)).toBe(true); expect(Object.values(inv.equipment).every(s => s === null)).toBe(true); expect(pending).toEqual([]); expect(inv.selected).toBe(8);
  expect(drops.records.map(r => r.stack)).toEqual(expected); expect(drops.records.every(r => r.position.y === position.y && r.position.x === position.x)).toBe(true);
  expect(resolver.tryTransfer(inv, pending, d, () => { throw Error("must not reserve again"); }, () => { clears++; })).toBe(true); expect(clears).toBe(1);
  expect(drops.records.map(r => r.stack)).toEqual(expected);
  const saved = parseSave(serializeSave({ ...base, inventory: inv.toJSON(), inventoryPending: pending, worldDrops: drops.toJSON(), playerState: { health: 0, death: d } }));
  expect(sanitizePlayerState(saved.playerState).data).toEqual({ health: 0, death: d });
  const loaded = new WorldDrops(floor, saved.worldDrops), loadedInv = Inventory.fromJSON(saved.inventory), loadedDeath = sanitizePlayerState(saved.playerState).data.death!;
  expect(new PlayerDeathTransfer().tryTransfer(loadedInv, [], loadedDeath, () => { throw Error("loaded completed death must not replay"); }, () => {})).toBe(true);
  expect(loaded.records.map(r => r.stack)).toEqual(expected);
});

it("keeps all original owners and pending phase on null/false/throw, then retries after JSON reload without partial clearing", () => {
  const { inv, pending } = owners(), before = inv.toJSON(), originalPending = structuredClone(pending), d = death(), transfer = new PlayerDeathTransfer(); let clears = 0;
  const refusals: DropSink[] = [() => null, () => ({ commit: () => false }), () => { throw Error("reservation failure"); }, () => ({ commit: () => { throw Error("commit failure"); } })];
  for (const sink of refusals) {
    expect(transfer.tryTransfer(inv, pending, d, sink, () => { clears++; })).toBe(false);
    expect(inv.toJSON()).toEqual(before); expect(pending).toEqual(originalPending); expect(d.phase).toBe("pending"); expect(clears).toBe(0);
  }
  const saved = parseSave(serializeSave({ ...base, inventory: inv.toJSON(), inventoryPending: pending, playerState: { health: 0, death: d } }));
  const loaded = Inventory.fromJSON(saved.inventory), restoredPending = saved.inventoryPending!, restored = sanitizePlayerState(saved.playerState).data.death!, drops = new WorldDrops(floor);
  expect(new PlayerDeathTransfer().tryTransfer(loaded, restoredPending, restored, drops.planSpawnBatch.bind(drops), () => { restoredPending.length = 0; })).toBe(true);
  expect(drops.records).toHaveLength(7); expect(loaded.slots.every(s => s === null)).toBe(true); expect(restored.phase).toBe("complete"); expect(restoredPending).toEqual([]);
});

it("detaches sink arguments so a refusing receiver cannot corrupt the original book, counts or death position", () => {
  const { inv, pending } = owners(), before = inv.toJSON(), p = structuredClone(pending), d = death();
  expect(new PlayerDeathTransfer().tryTransfer(inv, pending, d, (batch, at) => {
    batch[1].book!.pages[0] = "mutated"; batch[0].count = 999; batch[6].book!.pages[0] = "mutated pending"; at.y = 999;
    return null;
  }, () => { throw Error("no clearing refused owners"); })).toBe(false);
  expect(inv.toJSON()).toEqual(before); expect(pending).toEqual(p); expect(d.position).toEqual(position);
});

it("refuses a real all-batch allocation failure without deleting source slots or creating a prefix", () => {
  const { inv, pending } = owners(), before = inv.toJSON(), d = death();
  const drops = new WorldDrops(floor, { nextKey: Number.MAX_SAFE_INTEGER, records: [] });
  expect(new PlayerDeathTransfer().tryTransfer(inv, pending, d, drops.planSpawnBatch.bind(drops), () => { pending.length = 0; })).toBe(false);
  expect(drops.records).toEqual([]); expect(inv.toJSON()).toEqual(before); expect(pending).toHaveLength(2); expect(d.phase).toBe("pending");
});

it("guards receiver and finalizer reentrancy and only performs one successful batch", () => {
  const { inv, pending } = owners(), d = death(), transfer = new PlayerDeathTransfer(), drops = new WorldDrops(floor); let calls = 0;
  const sink: DropSink = (batch, at) => { calls++; expect(transfer.tryTransfer(inv, pending, d, sink, () => {})).toBe(false); return drops.planSpawnBatch(batch, at); };
  expect(transfer.tryTransfer(inv, pending, d, sink, () => { expect(transfer.tryTransfer(inv, pending, d, sink, () => {})).toBe(false); pending.length = 0; })).toBe(true);
  expect(calls).toBe(1); expect(drops.records).toHaveLength(7);
});

it("completes an actual empty batch once and persists its terminal state", () => {
  const inv = new Inventory(), d = death(), drops = new WorldDrops(floor), transfer = new PlayerDeathTransfer(); let calls = 0, clears = 0;
  const sink: DropSink = (batch, at) => { calls++; expect(batch).toEqual([]); return drops.planSpawnBatch(batch, at); };
  expect(transfer.tryTransfer(inv, [], d, sink, () => { clears++; })).toBe(true);
  expect(transfer.tryTransfer(inv, [], d, sink, () => { clears++; })).toBe(true);
  expect({ calls, clears, phase: d.phase }).toEqual({ calls: 1, clears: 1, phase: "complete" }); expect(drops.records).toEqual([]);
});

it("keeps all owners including full bag and pending screen under captured keepInventory without emitting or clearing", () => {
  const { inv, pending } = owners(); for (let i = 2; i < 35; i++) inv.slots[i] = stack("stone", 64);
  const before = inv.toJSON(), beforePending = structuredClone(pending), d = death(true);
  expect(new PlayerDeathTransfer().tryTransfer(inv, pending, d, () => { throw Error("kept inventory must not emit"); }, () => { throw Error("kept pending owner must not clear"); })).toBe(true);
  expect(d.phase).toBe("complete"); expect(inv.toJSON()).toEqual(before); expect(pending).toEqual(beforePending);
});

it("refuses invalid owned metadata, AIR, misplaced equipment or malformed state without silently repairing it", () => {
  const mutations = [(inv: Inventory) => { inv.slots[0]!.damage = 99999; }, (inv: Inventory) => { inv.slots[1]!.book!.pages[0] = "x".repeat(257); }, (inv: Inventory) => { inv.slots[1]!.book!.title = "t".repeat(33); }, (inv: Inventory) => { inv.slots[0] = { id: AIR, count: 1 }; }, (inv: Inventory) => { inv.equipment.feet = stack("iron_helmet"); }];
  for (const mutate of mutations) {
    const { inv, pending } = owners(); mutate(inv); const before = structuredClone(inv.toJSON()), d = death(); let reserved = false;
    expect(new PlayerDeathTransfer().tryTransfer(inv, pending, d, () => { reserved = true; return null; }, () => { throw Error("no clearing"); })).toBe(false);
    expect(reserved).toBe(false); expect(inv.toJSON()).toEqual(before); expect(d.phase).toBe("pending");
  }
});

it("strictly roundtrips alive, dead pending and dead complete states including actual negative-y positions", () => {
  expect(sanitizePlayerState(undefined)).toEqual({ data: { health: MAX_PLAYER_HEALTH }, invalid: 0, present: false });
  for (const data of [{ health: .25 }, { health: 20 }, { health: 0, death: death() }, { health: 0, death: { ...death(true), phase: "complete" as const, position: { ...position, y: -20.5 } } }]) {
    const parsed = parseSave(serializeSave({ ...base, playerState: data }));
    const clean = sanitizePlayerState(parsed.playerState); expect(clean).toEqual({ data, invalid: 0, present: true });
    if (clean.data.death) { clean.data.death.position.x = 100; expect(data.death!.position.x).toBe(position.x); }
  }
  expect(Object.hasOwn(parseSave(serializeSave(base)), "playerState")).toBe(false);
});

it("marks invalid present player-state data instead of treating it as an absent legacy state", () => {
  const good = { health: 0, death: death() };
  const bad = [null, [], {}, { health: NaN }, { health: Infinity }, { health: -1 }, { health: 21 }, { health: "20" }, { health: 0 }, { health: 20, death: death() }, { ...good, death: null }, { ...good, death: { ...death(), phase: "alive" } }, { ...good, death: { ...death(), keepInventory: 1 } }, { ...good, death: { ...death(), position: { ...position, x: Infinity } } }, Object.create(good), { ...good, death: Object.create(death()) }];
  for (const raw of bad) expect(sanitizePlayerState(raw)).toEqual({ data: { health: 20 }, invalid: 1, present: true });
  expect(parseSave(JSON.stringify({ ...base, version: 1, playerState: null })).playerState).toBeNull();
  const inherited = { health: 0, death: { ...death(), position: Object.create(position) } }; expect(sanitizePlayerState(inherited).invalid).toBe(1);
});

it("adds actual typed keepInventory command aliases and persists strict false-default gamerule values", () => {
  expect(parseCommand("/gamerule keepInventory true")).toEqual({ type: "gamerule", rule: "keepInventory", value: true });
  expect(parseCommand("/gamerule keepinventory false")).toEqual({ type: "gamerule", rule: "keepInventory", value: false });
  expect(parseCommand("/gamerule keepInventory yes").type).toBe("error");
  expect(COMMAND_HELP.some(line => line.includes("keepInventory"))).toBe(true);
  expect(parseSave(serializeSave(base)).gamerules?.keepInventory).toBe(false);
  for (const value of [null, "true", 1, {}]) expect(parseSave(JSON.stringify({ ...base, version: 1, gamerules: { keepInventory: value } })).gamerules?.keepInventory).toBe(false);
  const kept = parseSave(serializeSave({ ...base, gamerules: { doMobSpawning: false, doDaylightCycle: true, keepInventory: true } }));
  expect(kept.gamerules).toEqual({ doMobSpawning: false, doDaylightCycle: true, keepInventory: true });
});


it("diagnoses raw pending-death ownership before legacy inventory/pending repair hides invalid items", () => {
  const { inv, pending } = owners(), good = { ...base, version: 1, inventory: inv.toJSON(), inventoryPending: pending, playerState: { health: 0, death: death() } };
  expect(validatePlayerDeathOwnership(good.inventory, pending)).toBe(true);
  expect(parseSave(JSON.stringify(good)).playerStateOwnershipInvalid).toBeUndefined();
  const mutations = [
    (raw: typeof good) => { raw.inventory.slots[0]!.damage = 99999; },
    (raw: typeof good) => { raw.inventory.slots[1]!.book!.pages[0] = "x".repeat(257); },
    (raw: typeof good) => { raw.inventory.slots[1]!.book!.title = "t".repeat(33); },
    (raw: typeof good) => { raw.inventory.slots[35]!.count = 65; },
    (raw: typeof good) => { (raw.inventory as unknown as Record<string, unknown>).equipment = "invalid discarded equipment"; },
    (raw: typeof good) => { raw.inventory.equipment!.head = stack("diamond"); },
    (raw: typeof good) => { raw.inventoryPending[0].count = 999; },
    (raw: typeof good) => { raw.inventoryPending = new Array(11).fill(stack("diamond")); },
    (raw: typeof good) => { raw.inventory.slots.pop(); },
  ];
  for (const mutate of mutations) {
    const raw = structuredClone(good); mutate(raw);
    expect(validatePlayerDeathOwnership(raw.inventory, raw.inventoryPending)).toBe(false);
    const parsed = parseSave(JSON.stringify(raw)); expect(parsed.playerStateOwnershipInvalid).toBe(true);
    // The original raw JSON is retained by the web recovery gate; no false claim that its legacy
    // repaired Inventory or truncated pending array still represents every source owner.
    expect(sanitizePlayerState(parsed.playerState).data.death!.phase).toBe("pending");
  }
});

it("derives ownership diagnostics itself and does not trust a JSON-supplied recovery flag", () => {
  const { inv, pending } = owners();
  const raw = { ...base, version: 1, inventory: inv.toJSON(), inventoryPending: pending, playerState: { health: 0, death: death(true) }, playerStateOwnershipInvalid: true };
  expect(parseSave(JSON.stringify(raw)).playerStateOwnershipInvalid).toBeUndefined();
  raw.inventory.slots[0]!.damage = 99999; raw.playerStateOwnershipInvalid = false;
  expect(parseSave(JSON.stringify(raw)).playerStateOwnershipInvalid).toBe(true);
  inv.slots[0]!.damage = 99999;
  const d = death(true); expect(new PlayerDeathTransfer().tryTransfer(inv, pending, d, () => { throw Error("must not reserve"); }, () => {})).toBe(false); expect(d.phase).toBe("pending");
});
