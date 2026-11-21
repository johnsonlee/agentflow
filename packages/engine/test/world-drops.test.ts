import { expect, it } from "vitest";
import {
  AIR, BLOCKS, ITEMS, Inventory, SAVE_VERSION, World, WorldDrops, WORLD_DROP_PROFILE, blockId, breakBlock,
  createAgent, giveAgent, runAgentCommand, stackId, elementBlockId, sanitizeWorldDrops, cloneStack,
  parseSave, serializeSave, validateProgram, type ItemStack, type Vec3,
} from "../src";
const s = (name: string, count = 1): ItemStack => ({ id: stackId(name), count });
const p: Vec3 = { x: .5, y: 1, z: .5 };
function floorWorld() {
  let reads = 0; const loaded = new Set(["0,0"]), blocks = new Map<string, number>();
  return { loaded, blocks, get reads() { return reads; }, getLoadedBlock(x: number, y: number, z: number) {
    reads++;
    if (!loaded.has(`${Math.floor(x / 16)},${Math.floor(z / 16)}`)) return undefined;
    return blocks.get(`${x},${y},${z}`) ?? (y === 0 ? blockId("stone") : AIR);
  } };
}
const quantity = (drops: WorldDrops) => drops.records.reduce((n, r) => n + r.stack.count, 0);
const sink = (drops: WorldDrops) => drops.planSpawnBatch.bind(drops);

it("reserves a detached whole batch, splits max stacks and commits only once", () => {
  const drops = new WorldDrops(floorWorld()), book = { ...s("written_book"), book: { pages: ["original"], title: "signed", author: "A" } };
  const batch = drops.planSpawnBatch([s("coal", 130), book, { ...s("iron_chestplate"), damage: 37 }, { id: elementBlockId(0), count: 58 }], p)!;
  book.book.pages[0] = "changed"; expect(drops.records).toHaveLength(0); expect(batch.commit()).toBe(true); expect(batch.commit()).toBe(false);
  expect(drops.records.map((r) => r.stack.count)).toEqual([64, 64, 2, 1, 1, 58]);
  expect(drops.records[3].stack.book?.pages).toEqual(["original"]); expect(drops.records[4].stack.damage).toBe(37);
  const snapshot = drops.toJSON(); snapshot.records[3].stack.book!.pages[0] = "snapshot mutation";
  expect(drops.records[3].stack.book?.pages).toEqual(["original"]); expect(quantity(drops)).toBe(190);
});

it("refuses invalid or unavailable reservations without partially inserting earlier valid inputs", () => {
  const drops = new WorldDrops(floorWorld());
  for (const bad of [{ id: 0, count: 1 }, { id: -1, count: 1 }, s("coal", 0), s("coal", .5), { ...s("iron_chestplate"), damage: 9999 }, { ...s("written_book"), book: { pages: ["x".repeat(300)] } }]) {
    expect(drops.planSpawnBatch([s("coal"), bad], p)).toBeNull(); expect(quantity(drops)).toBe(0);
  }
  expect(drops.planSpawnBatch([s("coal", 6400001)], p)).toBeNull(); // Explicit allocation refusal, no silent truncation.
  expect(drops.planSpawnBatch([s("coal")], { ...p, x: Infinity })).toBeNull();
  const batch = drops.planSpawnBatch([s("coal")], p)!; drops.dispose(); expect(batch.commit()).toBe(false); expect(drops.spawnBatch([s("coal")], p)).toBe(false);
});

it("uses loaded-only collision physics, lands on fractional support and freezes unloaded records", () => {
  const world = floorWorld(); world.blocks.set("0,0,0", blockId("farmland_0"));
  const drops = new WorldDrops(world); drops.spawnBatch([s("coal")], { ...p, y: 3 }); drops.update(1);
  expect(drops.records[0].position.y).toBeCloseTo(15 / 16, 3); expect(drops.records[0].velocity.y).toBe(0);
  const before = drops.toJSON(); world.loaded.clear(); drops.update(20); expect(drops.toJSON()).toEqual(before);
  world.loaded.add("0,0"); drops.update(.1); expect(drops.records[0].ageSeconds).toBeCloseTo(1.1);
});

it("does not cross unloaded boundaries, high-ID solids or world bounds and never requests terrain", () => {
  const world = floorWorld(), drops = new WorldDrops(world);
  drops.spawnBatch([s("coal")], { x: 15.7, y: 1, z: .5 }, { x: 10, y: 0, z: 0 }); drops.update(.5);
  expect(drops.records[0].position.x).toBeLessThanOrEqual(15.8751); expect(world.loaded.size).toBe(1);
  world.blocks.set("1,1,0", elementBlockId(79));
  const wall = new WorldDrops(world); wall.spawnBatch([s("diamond")], p, { x: 10, y: 0, z: 0 }); wall.update(.5);
  expect(wall.records[0].position.x).toBeLessThanOrEqual(.8751); expect(wall.records[0].velocity.x).toBe(0);
  expect(world.reads).toBeGreaterThan(0);
});

it("merges compatible partial stacks without refreshing lifetime/delay, keeps distinct metadata", () => {
  const world = floorWorld(), old = new WorldDrops(world); old.spawnBatch([s("coal", 60)], p); old.update(.25);
  old.spawnBatch([s("coal", 10)], p); old.update(.01);
  const records = old.records; expect(records.map((r) => r.stack.count)).toEqual([64, 6]);
  expect(records.map((r) => r.ageSeconds)).toEqual([.26, .26]); expect(records[0].pickupDelaySeconds).toBeCloseTo(.49);
  const withBooks = new WorldDrops(world);
  const book = { ...s("written_book"), book: { pages: ["A"], title: "A", author: "A" } };
  withBooks.spawnBatch([book, { ...book, book: { ...book.book, pages: ["B"] } }, { ...s("iron_chestplate"), damage: 3 }, { ...s("iron_chestplate"), damage: 4 }], p);
  withBooks.update(.01); expect(withBooks.records).toHaveLength(4); expect(quantity(withBooks)).toBe(4);
  const aged = withBooks.toJSON(); aged.records[0].ageSeconds = 299.99;
  const expiry = new WorldDrops(world, aged); expiry.update(.01); expect(expiry.records).toHaveLength(3);
});

it("leaves full-bag and partial pickup remainders owned by world, then collects each unit once", () => {
  const world = floorWorld(), drops = new WorldDrops(world), bag = new Inventory();
  drops.spawnBatch([s("coal", 10)], p);
  expect(drops.tryPickup(p, (v) => bag.addStack(v))).toBe(0); drops.update(.5);
  for (let i = 0; i < 36; i++) bag.setSlot(i, s("stone", 64));
  expect(drops.tryPickup(p, (v) => bag.addStack(v))).toBe(0); expect(quantity(drops)).toBe(10);
  bag.setSlot(0, s("coal", 62)); expect(drops.tryPickup(p, (v) => bag.addStack(v))).toBe(2); expect(quantity(drops)).toBe(8);
  bag.setSlot(1, null); expect(drops.tryPickup(p, (v) => bag.addStack(v))).toBe(8); expect(quantity(drops)).toBe(0);
  expect(drops.tryPickup(p, (v) => bag.addStack(v))).toBe(0); expect(bag.slots[0]).toEqual(s("coal", 64)); expect(bag.slots[1]).toEqual(s("coal", 8));
});

it("preserves wear/books/Unknown and canonical aliases through metadata-safe inventory pickup", () => {
  const drops = new WorldDrops(floorWorld()), bag = new Inventory();
  const book = { ...s("written_book"), book: { pages: ["kept"], title: "T", author: "A" } };
  drops.spawnBatch([book, { ...s("iron_chestplate"), damage: 41 }, { id: 32768, count: 58 }, { id: elementBlockId(6), count: 2 }], p); drops.update(.5);
  expect(drops.tryPickup(p, (v) => bag.addStack(v), stackId("coal"))).toBe(0);
  expect(drops.tryPickup(p, (v) => bag.addStack(v))).toBe(62); expect(bag.slots[0]).toEqual(book);
  expect(bag.slots[1]).toEqual({ ...s("iron_chestplate"), damage: 41 }); expect(bag.slots[2]).toEqual({ id: 32768, count: 58 }); expect(bag.slots[3]).toEqual(s("carbon", 2));
  const saved = bag.toJSON(); saved.slots[0]!.book!.pages[0] = "external"; expect(bag.slots[0]!.book!.pages).toEqual(["kept"]);
  const marked = { ...s("coal", 5), book: { pages: ["marker"] } }; bag.setSlot(4, marked); bag.addStack(s("coal", 3)); expect(bag.slots[4]).toEqual(marked);
});

it("loads all valid records without count caps, reports corrupt entries and preserves optional Savev1", () => {
  const drops = new WorldDrops(floorWorld()); for (let i = 0; i < 1200; i++) expect(drops.spawnBatch([s("coal")], p)).toBe(true);
  const raw = drops.toJSON(), restored = new WorldDrops(floorWorld(), raw); expect(restored.loadIssues).toBe(0); expect(restored.records).toHaveLength(1200); expect(restored.toJSON()).toEqual(raw);
  const corrupt = structuredClone(raw); corrupt.records.push(corrupt.records[0], { ...corrupt.records[0], key: 5000, stack: s("coal", 65) });
  const checked = new WorldDrops(floorWorld(), corrupt); expect(checked.records).toHaveLength(1200); expect(checked.loadIssues).toBe(2);
  expect(sanitizeWorldDrops({ records: [], nextKey: Number.MAX_SAFE_INTEGER }).invalid).toBe(0);
  const exhausted = new WorldDrops(floorWorld(), { records: [], nextKey: Number.MAX_SAFE_INTEGER }); expect(exhausted.spawnBatch([s("coal")], p)).toBe(false);
  const data = { name: "drops", seed: 1, mode: "survival" as const, timeOfDay: .3, player: { position: p, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), edits: [] };
  const saved = parseSave(serializeSave({ ...data, worldDrops: raw })); expect(saved.version).toBe(1); expect(SAVE_VERSION).toBe(1); expect(saved.worldDrops).toEqual(raw);
  expect(new WorldDrops(floorWorld(), parseSave(serializeSave(data)).worldDrops).records).toEqual([]);
  for (const bad of [null, [], { records: [], nextKey: NaN }, { records: [{ key: 1 }], nextKey: 2 }, Object.create({ records: [] })]) expect(sanitizeWorldDrops(bad).invalid).toBeGreaterThan(0);
});

it("stages player block/support/furnace contents in one world batch and rolls back refusal including wear", () => {
  const world = new World(7), bag = new Inventory(); world.setBlock(8, 90, 8, blockId("furnace")); world.setBlock(8, 91, 8, blockId("dandelion"));
  for (let i = 0; i < 36; i++) bag.setSlot(i, s("stone", 64)); bag.setSlot(0, s("iron_pickaxe"));
  const contents = [{ ...s("iron_chestplate"), damage: 17 }, s("coal", 3)]; const before = bag.toJSON();
  expect(breakBlock(world, bag, "survival", 8, 90, 8, () => 0, contents, () => null)).toBe(false);
  expect(world.getBlock(8, 90, 8)).toBe(blockId("furnace")); expect(bag.toJSON()).toEqual(before);
  expect(breakBlock(world, bag, "survival", 8, 90, 8, () => 0, contents, () => ({ commit: () => false }))).toBe(false);
  const drops = new WorldDrops(world); expect(breakBlock(world, bag, "survival", 8, 90, 8, () => 0, contents, sink(drops))).toBe(true);
  expect(world.getBlock(8, 90, 8)).toBe(AIR); expect(world.getBlock(8, 91, 8)).toBe(AIR);
  expect(drops.records.map((r) => r.stack)).toEqual([s("furnace"), s("dandelion"), ...contents]);
  expect(bag.slots[0]).toEqual({ ...s("iron_pickaxe"), damage: 1 }); expect(bag.slots.slice(1)).toEqual(before.slots.slice(1));
  world.setBlock(8, 90, 8, blockId("glass")); expect(breakBlock(world, bag, "survival", 8, 90, 8, () => 0, [], sink(drops))).toBe(true); expect(drops.records).toHaveLength(4);
});

it("Agent directional quantity drop/collect has one owner and keeps legacy no-hook behavior", () => {
  const world = new World(8), drops = new WorldDrops(world), robot = createAgent(8, 90, 8, 0); world.getChunk(0, 0);
  giveAgent(robot, { ...s("iron_chestplate"), damage: 8 }); giveAgent(robot, s("coal", 5));
  expect(runAgentCommand(world, robot, { op: "drop", slot: 1, dir: "forward", quantity: 2 }, { worldDrop: sink(drops) }).ok).toBe(true);
  expect(robot.slots[1]).toEqual(s("coal", 3)); expect(drops.records[0].stack).toEqual(s("coal", 2)); expect(drops.records[0].position).toEqual({ x: 8.5, y: 90.25, z: 9.5 });
  expect(runAgentCommand(world, robot, { op: "drop", slot: 0 }, { worldDrop: () => null }).ok).toBe(false); expect(robot.slots[0]!.damage).toBe(8);
  expect(runAgentCommand(world, robot, { op: "drop", slot: 0, dir: "up" }, { worldDrop: sink(drops) }).ok).toBe(true); expect(robot.slots[0]).toBeNull();
  drops.update(.5);
  const collect = (a: typeof robot, filter?: number) => drops.tryPickup(drops.records.find((r) => filter === undefined || r.stack.id === filter)!.position, (v) => giveAgent(a, v), filter);
  expect(runAgentCommand(world, robot, { op: "collect", filterId: stackId("coal") }, { collect }).value).toBe(true); expect(robot.slots.some((v) => v?.id === stackId("coal") && v.count === 5)).toBe(true);
  expect(runAgentCommand(world, robot, { op: "collect" }, { collect }).value).toBe(true); expect(drops.records).toHaveLength(0); expect(robot.slots.some((v) => v?.damage === 8)).toBe(true);
  const bag = new Inventory(); expect(runAgentCommand(world, robot, { op: "drop", slot: 0 }, { giveToPlayer: (v) => bag.addStack(v) }).ok).toBe(true);
  expect(runAgentCommand(world, robot, { op: "drop", slot: 1, quantity: 0 }, { worldDrop: sink(drops) }).ok).toBe(false);
});

it("Agent destroy contributes external contents to one sink, never steals to player, cleans up only after commit", () => {
  const world = new World(9), robot = createAgent(8, 91, 8), drops = new WorldDrops(world); world.setBlock(8, 90, 8, blockId("furnace"));
  for (let i = 0; i < 27; i++) robot.slots[i] = s("stone", 64);
  let after = 0, before = 0; const external = [{ ...s("written_book"), book: { pages: ["furnace book"], title: "T" } }];
  const env = { worldDrop: sink(drops), destroyContents: () => external, beforeDestroy: () => { before++; return false; }, afterDestroy: () => { after++; } };
  expect(runAgentCommand(world, robot, { op: "destroy", dir: "down" }, { ...env, worldDrop: () => null }).ok).toBe(false); expect(after).toBe(0);
  expect(runAgentCommand(world, robot, { op: "destroy", dir: "down" }, env).ok).toBe(true); expect(after).toBe(1); expect(before).toBe(0);
  expect(drops.records.map((r) => r.stack)).toEqual([s("furnace"), ...external]); expect(robot.slots.every((v) => v?.id === stackId("stone") && v.count === 64)).toBe(true);
});

it("validates and preserves optional new Agent command fields through programs while old commands remain valid", () => {
  const program = (cmd: unknown) => ({ name: "drops", trigger: { type: "chat", command: "drops" }, blocks: [{ type: "command", cmd }] });
  for (const cmd of [{ op: "drop", slot: 0 }, { op: "drop", slot: 0, dir: "left", quantity: 2 }, { op: "collect", filterId: 32768 }]) expect(validateProgram(program(cmd))).toEqual([]);
  for (const cmd of [{ op: "drop", slot: 0, quantity: -1 }, { op: "drop", slot: 0, dir: "north" }, { op: "collect", filterId: 65535 }]) expect(validateProgram(program(cmd)).length).toBeGreaterThan(0);
  expect(BLOCKS).toHaveLength(307); expect(ITEMS.slice(0, 535)).toHaveLength(535);
  const a = s("written_book"); a.book = { pages: ["A"] }; const b = cloneStack(a); b.book!.pages[0] = "B"; expect(a.book.pages).toEqual(["A"]);
});


it("rejects AIR in stage/load while Unknown32768 remains an actual owned item, and prevents reentrant duplicate pickup", () => {
  const world = floorWorld(), drops = new WorldDrops(world); expect(drops.spawnBatch([{ id: 0, count: 1 }], p)).toBe(false);
  expect(drops.spawnBatch([{ id: 32768, count: 58 }], p)).toBe(true); drops.update(.5);
  const raw = drops.toJSON(); raw.records.push({ ...raw.records[0], key: 99, stack: { id: 0, count: 1 } });
  const checked = new WorldDrops(world, raw); expect(checked.loadIssues).toBe(1); expect(checked.records[0].stack).toEqual({ id: 32768, count: 58 });
  const bag = new Inventory(); let nested = -1;
  expect(drops.tryPickup(p, (stack) => { nested = drops.tryPickup(p, (s) => bag.addStack(s)); return bag.addStack(stack); })).toBe(58);
  expect(nested).toBe(0); expect(quantity(drops)).toBe(0); expect(bag.slots[0]).toEqual({ id: 32768, count: 58 });
});

it("roundtrips dropped signed book, worn equipment and Unknown metadata through actual Savev1 JSON", () => {
  const drops = new WorldDrops(floorWorld()); const book = { ...s("written_book"), book: { pages: ["first", "second"], title: "Signed", author: "User" } };
  drops.spawnBatch([book, { ...s("iron_pickaxe"), damage: 23 }, { ...s("iron_chestplate"), damage: 31 }, { id: 32768, count: 58 }], p, { x: .1, y: 2, z: -.2 }); drops.update(.1);
  const text = serializeSave({ name: "metadata", seed: 1, mode: "survival", timeOfDay: .3, player: { position: p, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), edits: [], worldDrops: drops.toJSON() });
  const restored = new WorldDrops(floorWorld(), parseSave(text).worldDrops); expect(restored.loadIssues).toBe(0); expect(restored.toJSON()).toEqual(drops.toJSON());
  expect(restored.records.map((r) => r.stack)).toEqual([book, { ...s("iron_pickaxe"), damage: 23 }, { ...s("iron_chestplate"), damage: 31 }, { id: 32768, count: 58 }]);
});


it("Agent collect leaves full and partial remainders world-owned at its actual position", () => {
  const world = new World(10), drops = new WorldDrops(floorWorld()), robot = createAgent(0, 1, 0);
  for (let i = 0; i < robot.slots.length; i++) robot.slots[i] = s("stone", 64);
  drops.spawnBatch([s("coal", 10)], p); drops.update(.5);
  const env = { collect: (agent: typeof robot, filter?: number) => drops.tryPickup({ x: agent.x + .5, y: agent.y, z: agent.z + .5 }, (stack) => giveAgent(agent, stack), filter) };
  expect(runAgentCommand(world, robot, { op: "collect" }, env).value).toBe(false); expect(quantity(drops)).toBe(10);
  robot.slots[0] = s("coal", 62);
  expect(runAgentCommand(world, robot, { op: "collect", filterId: stackId("coal") }, env).value).toBe(true);
  expect(robot.slots[0]).toEqual(s("coal", 64)); expect(quantity(drops)).toBe(8);
  expect(runAgentCommand(world, robot, { op: "collect" }, env).value).toBe(false);
  robot.slots[1] = null;
  expect(runAgentCommand(world, robot, { op: "collect" }, env).value).toBe(true);
  expect(robot.slots[1]).toEqual(s("coal", 8)); expect(quantity(drops)).toBe(0);
  expect(runAgentCommand(world, robot, { op: "collect" }, env).value).toBe(false);
});
