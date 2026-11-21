import { it, expect } from "vitest";
import * as E from "../src";
import baseline from "./fixtures/ignition-prefix-8933e09.json";

const hit = { x: 1, y: 80, z: 1, normal: { x: 0, y: 1, z: 0 } };
function setup(damage = 0) {
  const world = new E.World(12345), inventory = new E.Inventory();
  world.setBlock(1, 80, 1, E.blockId("stone")); world.setBlock(1, 81, 1, E.AIR);
  inventory.slots[0] = { id: E.stackId("flint_and_steel"), count: 1, damage };
  return { world, inventory };
}
const ignite = (w: E.World, i: E.Inventory, mode: E.GameMode = "survival", h = hit): boolean =>
  E.igniteFire(w, i, mode, h);
const fires = (w: E.World): E.FireSystem => w.fires;

it("crafts one usable non-mining ignition tool from Iron and Flint in either grid", () => {
  const id = E.stackId("flint_and_steel");
  expect(E.toolOf(id)).toBeNull(); expect(E.durabilityOf(id)).toBe(64); expect(E.maxStackOf(id)).toBe(1);
  for (const width of [2, 3]) {
    const grid = Array.from({ length: width * width }, () => null) as E.CraftingGrid;
    grid[0] = { id: E.stackId("iron_ingot"), count: 1 }; grid[grid.length - 1] = { id: E.stackId("flint"), count: 1 };
    expect(E.craftOnce(grid, width)).toEqual({ id, count: 1 }); expect(grid.every(s => s === null)).toBe(true);
  }
});
it("preserves every inherited definition/recipe/key while appending only the usable tool and hidden Fire", () => {
  expect(JSON.parse(JSON.stringify(E.ITEMS.slice(0, 582)))).toEqual(baseline.items);
  expect(JSON.parse(JSON.stringify(E.BLOCKS.slice(0, 308)))).toEqual(baseline.blocks);
  expect(JSON.parse(JSON.stringify(E.RECIPES.slice(0, 167)))).toEqual(baseline.recipes);
  expect(E.allAtlasTextureNames().slice(0, 868)).toEqual(baseline.names);
  expect([E.ITEMS.length, E.BLOCKS.length, E.RECIPES.length, E.allAtlasTextureNames().length]).toEqual([583, 309, 168, 870]);
  expect(E.allAtlasTextureNames().slice(868)).toEqual(["fire", "item_flint_and_steel"]);
  expect(E.blockDrops(E.blockId("fire"))).toEqual([]); expect(E.creativeBlocks().some(b => b.name === "fire")).toBe(false);
});
it("ignites real Fire and commits precisely one wear, including the final use", () => {
  for (const damage of [0, 63]) {
    const { world, inventory } = setup(damage);
    expect(ignite(world, inventory)).toBe(true); expect(world.getBlock(1, 81, 1)).toBe(E.blockId("fire"));
    expect(inventory.slots[0]).toEqual(damage === 63 ? null : { id: E.stackId("flint_and_steel"), count: 1, damage: 1 });
    expect(fires(world).exportState().records).toEqual([{ x: 1, y: 81, z: 1, remaining: 15 }]);
    expect(ignite(world, inventory)).toBe(false);
  }
});
it("refuses denied, unsupported, side, water and locked owners without wear or placement", () => {
  for (const kind of ["deny", "side", "water", "slot", "damage", "count"]) {
    const { world, inventory } = setup(2);
    if (kind === "deny") world.setBlock(1, 79, 1, E.blockId("deny"));
    if (kind === "water") world.setBlock(1, 81, 1, E.blockId("water"));
    if (kind === "slot") Object.defineProperty(inventory.slots, "0", { writable: false });
    if (kind === "damage" || kind === "count") Object.defineProperty(inventory.slots[0]!, kind, { writable: false });
    const before = inventory.toJSON(), edits = world.exportEdits();
    expect(ignite(world, inventory, "survival", kind === "side" ? { ...hit, normal: { x: 1, y: 0, z: 0 } } : hit)).toBe(false);
    expect(inventory.toJSON()).toEqual(before); expect(world.exportEdits()).toEqual(edits);
  }
});
it("restores remaining lifetime/contact without reset and extinguishes without a hidden drop", () => {
  const { world, inventory } = setup(); expect(ignite(world, inventory)).toBe(true);
  const box = { minX: 1, maxX: 1.6, minY: 81, maxY: 82.8, minZ: 1, maxZ: 1.6 };
  expect(fires(world).update(.6, box)).toBe(0);
  const state = fires(world).exportState(), cold = new E.World(12345); cold.importEdits(world.exportEdits());
  expect(fires(cold).restore(state, cold.exportEdits())).toMatchObject({ invalid: false });
  expect(fires(cold).update(.4, box)).toBe(1);
  const inv = new E.Inventory(); inv.slots[0] = { id: E.stackId("iron_shovel"), count: 1, damage: 2 };
  expect(E.breakBlock(cold, inv, "survival", 1, 81, 1)).toBe(true); expect(inv.slots[0]?.damage).toBe(2);
  expect(inv.slots.filter(Boolean)).toHaveLength(1); expect(fires(cold).exportState().records).toEqual([]);
});
it("preserves malformed raw Fire and explicit ignition wear as diagnostics before sanitation", () => {
  const { inventory } = setup();
  const base = { version: 1, name: "Fire", seed: 12345, mode: "survival", inventory: inventory.toJSON(), edits: [] };
  for (const damage of [-1, 64, 1.5, "2"]) {
    const inv = inventory.toJSON(); inv.slots[0]!.damage = damage as number;
    expect(E.parseSave(JSON.stringify({ ...base, inventory: inv })).ignitionOwnershipIssues?.length).toBeGreaterThan(0);
  }
  expect(E.parseSave(JSON.stringify({ ...base, fire: { version: 1, records: [{ x: 1, y: 81, z: 1, remaining: -1 }], contactSeconds: 0 } })).fireInvalid).toBe(true);
});

it("unions overlapping Fire contact instead of truncating to the earliest expiring cell", () => {
  const { world, inventory } = setup(); expect(ignite(world, inventory)).toBe(true);
  world.setBlock(2, 80, 1, E.blockId("stone")); world.setBlock(2, 81, 1, E.AIR);
  expect(ignite(world, inventory, "survival", { ...hit, x: 2 })).toBe(true);
  const state = fires(world).exportState(); state.contactSeconds = .5; state.records[0].remaining = .1; state.records[1].remaining = 2;
  expect(fires(world).restore(state)).toMatchObject({ invalid: false });
  expect(fires(world).update(.5, { minX: 1.5, maxX: 2.5, minY: 81, maxY: 82.8, minZ: 1, maxZ: 1.6 })).toBe(1);
  expect(fires(world).exportState().records).toEqual([{ x: 2, y: 81, z: 1, remaining: 1.5 }]);
});
it("keeps prior contact through the final expiry tick, then clears the contact owner", () => {
  const { world, inventory } = setup(); expect(ignite(world, inventory)).toBe(true);
  const state = fires(world).exportState(); state.contactSeconds = .9; state.records[0].remaining = .1;
  expect(fires(world).restore(state)).toMatchObject({ invalid: false });
  expect(fires(world).update(.1, E.playerBox({ x: 1.5, y: 81, z: 1.5 }))).toBe(1);
  expect(fires(world).exportState()).toEqual({ version: 1, records: [], contactSeconds: 0 });
});
it("pauses age and accumulated contact while the overlapping Fire cell is unloaded", () => {
  const { world, inventory } = setup(); expect(ignite(world, inventory)).toBe(true);
  const box = E.playerBox({ x: 1.5, y: 81, z: 1.5 }); expect(fires(world).update(.9, box)).toBe(0);
  const before = fires(world).exportState(); world.unloadChunk(0, 0);
  expect(fires(world).update(.5, box)).toBe(0); expect(fires(world).exportState()).toEqual(before); expect(world.loadedChunkCount()).toBe(0);
  world.getChunk(0, 0); expect(fires(world).update(.1, box)).toBe(1);
});
it("refuses a same-ID source ABA during validation without mutating the selected tool or target", () => {
  const { world, inventory } = setup(2), original = world.getLoadedBlock.bind(world); let sourceReads = 0;
  world.getLoadedBlock = (x, y, z) => {
    if (x === 1 && y === 80 && z === 1 && ++sourceReads === 3) {
      world.setBlock(1, 80, 1, E.blockId("dirt")); world.setBlock(1, 80, 1, E.blockId("stone"));
    }
    return original(x, y, z);
  };
  expect(ignite(world, inventory)).toBe(false); expect(inventory.slots[0]?.damage).toBe(2);
  expect(world.getBlock(1, 81, 1)).toBe(E.AIR); expect(fires(world).exportState().records).toEqual([]);
});
it("commits Fire and wear before observers and never overwrites an observer's later owner", () => {
  const { world, inventory } = setup(63); let seen = false;
  world.onBlockChanged((_x, _y, _z, id) => {
    if (id !== E.blockId("fire")) return;
    expect(inventory.slots[0]).toBeNull(); expect(fires(world).exportState().records).toHaveLength(1);
    inventory.slots[0] = { id: E.stackId("iron_shovel"), count: 1, damage: 7 }; seen = true; throw Error("observer failure after commit");
  });
  expect(ignite(world, inventory)).toBe(true); expect(seen).toBe(true);
  expect(inventory.slots[0]).toEqual({ id: E.stackId("iron_shovel"), count: 1, damage: 7 });
  expect(world.getBlock(1, 81, 1)).toBe(E.blockId("fire"));
});

it("expires loaded fire, removes water/replaced support owners and never emits loot or duplicate age", () => {
  for (const kind of ["expiry", "support", "water", "replace", "agent"] as const) {
    const { world, inventory } = setup(); expect(ignite(world, inventory)).toBe(true);
    if (kind === "expiry") for (let i = 0; i < 15; i++) expect(fires(world).update(1)).toBe(0);
    if (kind === "support") world.setBlock(1, 80, 1, E.AIR);
    if (kind === "water") world.setBlock(1, 81, 1, E.blockId("water"));
    if (kind === "replace") { world.setBlock(1, 81, 1, E.AIR); world.setBlock(1, 81, 1, E.blockId("fire")); }
    if (kind === "agent") {
      const agent = E.createAgent(1, 81, 2, 2); agent.slots[0] = { id: E.stackId("iron_shovel"), count: 1, damage: 7 };
      expect(E.runAgentCommand(world, agent, { op: "destroy", dir: "forward" }, { worldDrop: () => { throw Error("Fire must not reserve item loot"); } }).ok).toBe(true);
      expect(agent.slots.filter(Boolean)).toEqual([{ id: E.stackId("iron_shovel"), count: 1, damage: 7 }]);
    }
    expect(fires(world).exportState()).toEqual({ version: 1, records: [], contactSeconds: 0 });
    expect(world.getBlock(1, 81, 1)).toBe(kind === "water" ? E.blockId("water") : kind === "replace" ? E.blockId("fire") : E.AIR);
    expect(fires(world).update(1)).toBe(0);
  }
});
it("refuses malformed Fire data, orphan cells, missing cells, wrong support and extra/unreadable records", () => {
  const good = { version: 1, records: [{ x: 1, y: 81, z: 1, remaining: 3 }], contactSeconds: .2 };
  const invalid: unknown[] = [null, [], { ...good, version: 2 }, { ...good, records: new Array(1) }, { ...good, extra: 0 },
    { ...good, contactSeconds: 1 }, { ...good, records: [] }, { ...good, records: [good.records[0], good.records[0]] },
    ...[-1, 0, 16, NaN, Infinity, "2"].map(remaining => ({ ...good, records: [{ ...good.records[0], remaining }] })),
    { ...good, records: [{ ...good.records[0], extra: 0 }] }, { ...good, records: [{ ...good.records[0], x: .5 }] },
    { ...good, records: Array(257).fill(good.records[0]) }];
  let reads = 0; const accessor = { ...good }; Object.defineProperty(accessor, "contactSeconds", { get() { reads++; return 0; } }); invalid.push(accessor);
  for (const raw of invalid) expect(E.sanitizeFireState(raw).invalid).toBe(true);
  expect(reads).toBe(0);
  for (const kind of ["missing", "orphan", "support"]) {
    const { world, inventory } = setup(); expect(ignite(world, inventory)).toBe(true);
    const state = fires(world).exportState();
    if (kind === "missing") world.setBlock(1, 81, 1, E.AIR);
    if (kind === "support") world.setBlock(1, 80, 1, E.blockId("glass"));
    expect(fires(world).restore(kind === "orphan" ? undefined : state)).toMatchObject({ invalid: true });
    expect(fires(world).exportState().records).toEqual([]);
  }
  expect(E.sanitizeFireState(undefined)).toEqual({ data: { version: 1, records: [], contactSeconds: 0 }, invalid: false, present: false });
});
it("does not age or hurt on invalid timesteps, without active calls, or after leaving contact", () => {
  const { world, inventory } = setup(); expect(ignite(world, inventory)).toBe(true);
  const before = fires(world).exportState(); for (const dt of [0, -1, NaN, Infinity, 1.01]) expect(fires(world).update(dt)).toBe(0);
  expect(fires(world).exportState()).toEqual(before);
  const box = E.playerBox({ x: 1.5, y: 81, z: 1.5 }); expect(fires(world).update(.9, box)).toBe(0);
  expect(fires(world).update(.05, null)).toBe(0); expect(fires(world).exportState().contactSeconds).toBe(0);
  expect(fires(world).update(.1, box)).toBe(0);
  // Existing armor semantics stay unchanged; the bounded fire model explicitly bypasses armor and wear.
  for (const slot of E.ARMOR_SLOTS) inventory.equipment[slot] = { id: E.stackId(`diamond_${slot === "head" ? "helmet" : slot === "chest" ? "chestplate" : slot === "legs" ? "leggings" : "boots"}`), count: 1, damage: 2 };
  expect(E.applyArmorDamage(inventory, 1, "fire")).toBe(1); expect(Object.values(inventory.equipment).every(s => s?.damage === 2)).toBe(true);
});
it("keeps creative use unspent but refuses unsupported/no-load/invalid held-state placement", () => {
  const { world, inventory } = setup(7); expect(ignite(world, inventory, "creative")).toBe(true); expect(inventory.slots[0]?.damage).toBe(7);
  for (const defect of ["empty", "count", "wear", "book", "getter", "nonextensible", "air-support", "unloaded"] as const) {
    const { world: w, inventory: inv } = setup(); let getters = 0;
    if (defect === "empty") inv.slots[0] = null;
    if (defect === "count") inv.slots[0]!.count = 2;
    if (defect === "wear") inv.slots[0]!.damage = 64;
    if (defect === "book") inv.slots[0]!.book = { pages: ["wrong metadata"] };
    if (defect === "getter") Object.defineProperty(inv.slots[0]!, "damage", { get() { getters++; return 0; } });
    if (defect === "nonextensible") { delete inv.slots[0]!.damage; Object.preventExtensions(inv.slots[0]); }
    if (defect === "air-support") w.setBlock(1, 80, 1, E.AIR);
    if (defect === "unloaded") w.unloadChunk(0, 0);
    expect(ignite(w, inv)).toBe(false); expect(getters).toBe(0); expect(fires(w).exportState().records).toEqual([]);
    if (defect === "unloaded") expect(w.loadedChunkCount()).toBe(0);
  }
});
it("has no obtainable/placeable Fire stack, even through forged inventory owners", () => {
  const id = E.blockId("fire"), inventory = new E.Inventory();
  expect(E.isKnownBlockId(id)).toBe(true); expect(E.isKnownId(id)).toBe(false); expect(E.placedBlockOf(id)).toBeNull(); expect(E.dropCount(id)).toBe(0);
  expect(E.sanitizeStack({ id, count: 1 })).toBeNull(); expect(inventory.addStack({ id, count: 1 })).toBe(1); expect(inventory.slots.every(s => s === null)).toBe(true);
});
it("keeps valid tool wear through supported owners and diagnoses malformed/unsupported raw owners", () => {
  const { inventory } = setup(7), worn = { ...inventory.slots[0]! };
  const state = E.createFurnace(); state.input = { ...worn }; state.fuel = { ...worn }; state.output = { ...worn };
  expect(E.sanitizeFurnaces([{ x: 1, y: 80, z: 1, state }]).furnaces[0].state).toEqual(state);
  expect(E.sanitizeInventoryPending([worn])).toEqual([worn]); expect(E.Inventory.fromJSON(inventory.toJSON()).slots[0]).toEqual(worn);
  const agent = E.createAgent(1, 81, 1, 0); expect(E.giveAgent(agent, worn)).toBe(0); expect(E.sanitizeAgent(agent)?.slots[0]).toEqual(worn);
  const base = { version: 1, name: "owners", seed: 12345, mode: "survival", inventory: inventory.toJSON(), edits: [], inventoryPending: [worn], agent, furnaces: [{ x: 1, y: 80, z: 1, state }] };
  expect(E.parseSave(JSON.stringify(base)).ignitionOwnershipIssues).toBeUndefined();
  for (const path of ["bag", "pending", "agent", "input", "fuel", "output", "ground"] as const) {
    const raw = JSON.parse(JSON.stringify(base)), bad = { ...worn, damage: 64 };
    if (path === "bag") raw.inventory.slots[0] = bad;
    if (path === "pending") raw.inventoryPending[0] = bad;
    if (path === "agent") raw.agent.slots[0] = bad;
    if (path === "input" || path === "fuel" || path === "output") raw.furnaces[0].state[path] = bad;
    if (path === "ground") raw.worldDrops = { nextKey: 2, records: [{ key: 1, stack: bad, position: { x: 1, y: 81, z: 1 }, velocity: { x: 0, y: 0, z: 0 }, ageSeconds: 0, pickupDelaySeconds: 0 }] };
    expect(E.parseSave(JSON.stringify(raw)).ignitionOwnershipIssues?.length).toBeGreaterThan(0);
  }
  expect(inventory.setOffhand(worn)).toBe(false); expect(inventory.swapSelectedOffhand()).toBe(false); expect(inventory.slots[0]).toEqual(worn);
  for (const owner of ["offhand", "equipment", "agentOffhand", "mobLoot"]) {
    const raw = JSON.parse(JSON.stringify(base));
    if (owner === "offhand") raw.inventory.offhand = worn;
    if (owner === "equipment") raw.inventory.equipment.head = worn;
    if (owner === "agentOffhand") raw.agent.offhand = worn;
    if (owner === "mobLoot") raw.mobs = { records: [{ pendingLoot: [worn] }] };
    expect(E.parseSave(JSON.stringify(raw)).ignitionOwnershipIssues?.length).toBeGreaterThan(0);
  }
});
it("conserves worn tool through refused Agent ground transfer, cold restoration and exact-once pickup", () => {
  const world = new E.World(12345); world.setBlock(1, 80, 1, E.blockId("stone")); world.setBlock(1, 81, 1, E.AIR); world.setBlock(1, 82, 1, E.AIR);
  const agent = E.createAgent(1, 81, 1, 0), worn = { id: E.stackId("flint_and_steel"), count: 1, damage: 7 };
  expect(E.giveAgent(agent, worn)).toBe(0);
    expect(E.runAgentCommand(world, agent, { op: "drop", slot: 0, quantity: 1 }, { worldDrop: () => null }).ok).toBe(false); expect(agent.slots[0]).toEqual(worn);
  const drops = new E.WorldDrops(world); expect(E.runAgentCommand(world, agent, { op: "drop", slot: 0, quantity: 1 }, { worldDrop: drops.planSpawnBatch.bind(drops) }).ok).toBe(true);
  expect(agent.slots[0]).toBeNull(); expect(drops.records.map(r => r.stack)).toEqual([worn]);
  const raw = drops.toJSON(), restored = new E.WorldDrops(world, raw); expect(restored.loadIssues).toBe(0);
  expect(restored.toJSON()).toEqual(raw); restored.update(.6);
  const receiver = new E.Inventory(), position = restored.records[0].position;
  expect(restored.tryPickup(position, s => receiver.addStack(s))).toBe(1); expect(receiver.slots.filter(Boolean)).toEqual([worn]);
  expect(restored.tryPickup(position, s => receiver.addStack(s))).toBe(0); expect(restored.records).toEqual([]);
});
it("preserves worn death owners on refusal and commits default/keepInventory policies once", () => {
  for (const keepInventory of [false, true]) {
    const { world, inventory } = setup(7), worn = { ...inventory.slots[0]! }, pending: E.ItemStack[] = [], drops = new E.WorldDrops(world), death: E.PlayerDeathState = { phase: "pending", position: { x: 1, y: 81, z: 1 }, keepInventory };
    const transfer = new E.PlayerDeathTransfer();
    if (!keepInventory) { expect(transfer.tryTransfer(inventory, pending, death, () => null, () => pending.splice(0))).toBe(false); expect(inventory.slots[0]).toEqual(worn); }
    expect(transfer.tryTransfer(inventory, pending, death, drops.planSpawnBatch.bind(drops), () => pending.splice(0))).toBe(true);
    expect(inventory.slots[0]).toEqual(keepInventory ? worn : null); expect(drops.records.map(r => r.stack)).toEqual(keepInventory ? [] : [worn]);
    expect(transfer.tryTransfer(inventory, pending, death, () => { throw Error("duplicate transfer"); }, () => {})).toBe(true);
    expect(drops.records.map(r => r.stack)).toEqual(keepInventory ? [] : [worn]);
  }
});
it("refuses to serialize invalid Fire/tool diagnostics and preserves valid explicit zero wear", () => {
  const { inventory } = setup(), base = { name: "save", seed: 12345, mode: "survival" as const, timeOfDay: .2, player: { position: { x: 1, y: 81, z: 1 }, yaw: 0, pitch: 0, flying: false }, inventory: inventory.toJSON(), edits: [] };
  expect(E.sanitizeStack(inventory.slots[0])).toEqual(inventory.slots[0]);
  const bad = inventory.toJSON(); bad.slots[0]!.damage = 64;
  expect(() => E.serializeSave({ ...base, inventory: bad })).toThrow();
  expect(() => E.serializeSave({ ...base, fireInvalid: true })).toThrow();
  expect(() => E.serializeSave({ ...base, ignitionOwnershipIssues: [{ path: "x", reason: "invalid" }] })).toThrow();
  const clean = E.parseSave(JSON.stringify({ version: 1, ...base, fireInvalid: true, ignitionOwnershipIssues: [{ path: "spoof", reason: "spoof" }] }));
  expect(clean.fireInvalid).toBeUndefined(); expect(clean.ignitionOwnershipIssues).toBeUndefined();
  expect(JSON.parse(E.serializeSave({ ...base, fire: { version: 1, records: [], contactSeconds: 0 } })).fire).toBeUndefined();
});
it("extinguishes on real opaque support replacement/ABA but keeps no-op same-ID support writes", () => {
  const { world, inventory } = setup(); expect(ignite(world, inventory)).toBe(true);
  fires(world).update(.5); const before = fires(world).exportState();
  world.setBlock(1, 80, 1, E.blockId("stone")); expect(fires(world).exportState()).toEqual(before);
  world.setBlock(1, 80, 1, E.blockId("dirt")); world.setBlock(1, 80, 1, E.blockId("stone"));
  expect(world.getBlock(1, 81, 1)).toBe(E.AIR); expect(fires(world).exportState().records).toEqual([]);
});
it("refuses the real 257th source without evicting a valid Fire or wearing the tool", () => {
  const world = new E.World(12345), inventory = new E.Inventory(), records: E.FireRecord[] = [];
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
    world.setBlock(x, 80, z, E.blockId("stone")); world.setBlock(x, 81, z, E.blockId("fire"));
    records.push({ x, y: 81, z, remaining: 10 });
  }
  expect(fires(world).restore({ version: 1, records, contactSeconds: 0 })).toMatchObject({ invalid: false });
  world.setBlock(16, 80, 0, E.blockId("stone")); world.setBlock(16, 81, 0, E.AIR);
  inventory.slots[0] = { id: E.stackId("flint_and_steel"), count: 1, damage: 3 };
  expect(ignite(world, inventory, "survival", { ...hit, x: 16, z: 0 })).toBe(false);
  expect(inventory.slots[0]?.damage).toBe(3); expect(world.getBlock(16, 81, 0)).toBe(E.AIR); expect(fires(world).exportState().records).toEqual(records);
}, 10000);
it("does not turn ignition tools into mining tools or Fire into reducer input", () => {
  const { world, inventory } = setup(7); world.setBlock(2, 80, 1, E.blockId("dirt"));
  expect(E.breakBlock(world, inventory, "survival", 2, 80, 1)).toBe(true); expect(inventory.slots[0]?.damage).toBe(7);
  expect(E.toolOf(E.stackId("flint_and_steel"))).toBeNull(); expect(E.reduceMaterial(E.blockId("fire"))).toBeNull();
});
it("respects Deny for player and Agent extinguishing without losing the existing Fire owner", () => {
  const { world, inventory } = setup(); expect(ignite(world, inventory)).toBe(true); world.setBlock(1, 79, 1, E.blockId("deny"));
  const before = fires(world).exportState(), agent = E.createAgent(1, 81, 2, 2);
  expect(E.breakBlock(world, inventory, "survival", 1, 81, 1)).toBe(false);
  expect(E.runAgentCommand(world, agent, { op: "destroy", dir: "forward" }).ok).toBe(false);
  expect(fires(world).exportState()).toEqual(before); expect(world.getBlock(1, 81, 1)).toBe(E.blockId("fire"));
});
it("ACKs selected-owner and target changes during validation without replacing the new owner", () => {
  for (const defect of ["owner", "target"]) {
    const { world, inventory } = setup(7), original = world.getLoadedBlock.bind(world); let reads = 0;
    world.getLoadedBlock = (x, y, z) => {
      if (x === 1 && y === 81 && z === 1 && ++reads === 2) {
        if (defect === "owner") inventory.slots[0] = { id: E.stackId("iron_shovel"), count: 1, damage: 3 };
        else world.setBlock(1, 81, 1, E.blockId("dirt"));
      }
      return original(x, y, z);
    };
    expect(ignite(world, inventory)).toBe(false); expect(fires(world).exportState().records).toEqual([]);
    expect(world.getBlock(1, 81, 1)).toBe(defect === "target" ? E.blockId("dirt") : E.AIR);
    expect(inventory.slots[0]).toEqual({ id: E.stackId(defect === "owner" ? "iron_shovel" : "flint_and_steel"), count: 1, damage: defect === "owner" ? 3 : 7 });
  }
});
