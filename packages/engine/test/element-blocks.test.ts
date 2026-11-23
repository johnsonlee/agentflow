import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  AIR, BLOCKS, BLOCK_ID_LIMIT, CHUNK_SIZE, Chunk, ELEMENTS, EXTENDED_BLOCK_ID_BASE, ITEM_ID_BASE, ITEM_ID_LIMIT, ITEMS,
  FarmingSystem, Inventory, World, armorOf, baseStackId, blockById, blockId, boxCollides, breakBlock,
  canPlaceChalkboard, chalkboardSizeOf, createAgent, creativeBlocks, dropOf, durabilityOf, elementBlockId,
  elementParticlesOf, elementZOfBlock, emission, foodOf, giveAgent, isBlockNamespace, isItem, isKnownBlockId,
  isKnownId, isKnownItemId, isOpaque, isSolid, loadPrograms, maxStackOf, meshChunk, parseCommand, parseSave,
  placeBlock, placedBlockOf, raycast, runAgentCommand, sanitizeAgent, sanitizeChalkboards, sanitizeEdits,
  sanitizeFurnaces, sanitizeInventoryPending, sanitizeScheduled, serializeSave, stackId, toolOf, tryBlockById,
} from "../src/index";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value) + "\n").digest("hex");
const feet = { x: 2, y: 91, z: 2 };
function emptyWorld() {
  const world = new World(13);
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) world.getChunk(cx, cz).blocks.fill(AIR);
  return world;
}

it("keeps all old numeric/particle identities and adds 119 compact, disjoint extended block definitions", () => {
  expect(hash(BLOCKS.slice(0, 164).map(({ id, name }) => [id, name]))).toBe("01c152ce6dbc67a7e4e07b24fccf35b2a20725eb6e3fb3b97694403c39b84894");
  expect(hash(ITEMS.slice(0, 519).map(({ id, name }) => [id, name]))).toBe("c7c43e88c216c30259536783a583814edc6f93126bf4aa6397f024a33cce5ba7");
  expect(hash(ITEMS.filter((i) => i.chem?.kind === "element" || i.chem?.kind === "isotope").map((i) => [i.id, i.chem!.kind, i.chem!.z, i.chem!.symbol, i.chem!.mass])))
    .toBe("54ba81669824eb6b526e76e1fff7f979ed42b273faed2f99b71012c5d34be270");
  expect(BLOCKS.slice(0, 283)).toHaveLength(283); expect(ITEMS.slice(0, 519)).toHaveLength(519);
  expect(new Set(BLOCKS.map((b) => b.id)).size).toBe(BLOCKS.length);
  for (let z = 0; z <= 118; z++) {
    const id = elementBlockId(z), def = blockById(id);
    expect(id).toBe(32768 + z); expect(elementZOfBlock(id)).toBe(z); expect(def.name).toBe(`element_${z}`);
    expect(isKnownBlockId(id)).toBe(true); expect(isItem(id)).toBe(false);
    expect(def).toMatchObject({ shape: "cube", solid: true, transparent: false });
    if (z) {
      const element = ELEMENTS.find((e) => e.z === z)!;
      const item = stackId(element.name.toLowerCase());
      expect(placedBlockOf(item)).toBe(id); expect(dropOf(id)).toBe(item); expect(baseStackId(id)).toBe(item);
      expect(def.faces.side).toBe(`element_block_${z}_${element.symbol}`); expect(def.creative).toBe(false);
    }
  }
  expect(dropOf(elementBlockId(0))).toBe(elementBlockId(0));
  expect(creativeBlocks().filter((b) => elementZOfBlock(b.id) !== null).map((b) => b.id)).toEqual([32768]);
});

it("separates registered membership from numeric namespaces and rejects unknown IDs without wrap or world mutation", () => {
  expect([ITEM_ID_BASE, ITEM_ID_LIMIT, EXTENDED_BLOCK_ID_BASE, BLOCK_ID_LIMIT]).toEqual([256,32767,32768,65535]);
  expect(isBlockNamespace(255)).toBe(true); expect(isKnownBlockId(255)).toBe(false);
  expect(isItem(256)).toBe(true); expect(isKnownItemId(256)).toBe(true); expect(isKnownBlockId(256)).toBe(false);
  expect(isItem(32767)).toBe(true); expect(isKnownId(32767)).toBe(false);
  expect(isBlockNamespace(65535)).toBe(true); expect(isKnownBlockId(65535)).toBe(false); expect(isBlockNamespace(65536)).toBe(false);
  const world = new World(13), chunk = new Chunk(0, 0);
  for (const bad of [-1, .5, NaN, Infinity, 240, 255, 256, 774, 32767, 32887, 65535, 65536]) {
    expect(isKnownBlockId(bad)).toBe(false); expect(tryBlockById(bad)).toBeUndefined(); expect(placedBlockOf(bad)).toBeNull();
    world.setBlock(8, 90, 8, bad); chunk.set(1, 90, 1, bad);
    expect(chunk.get(1, 90, 1)).toBe(AIR);
  }
  expect(world.loadedChunkCount()).toBe(0); expect(world.exportEdits()).toEqual([]);
  expect(() => blockById(65535)).toThrow(/Unknown block/);
  expect(() => maxStackOf(65535)).toThrow();
  for (const id of [32768, 32886, 65535]) {
    expect(toolOf(id)).toBeNull(); expect(foodOf(id)).toBeNull(); expect(armorOf(id)).toBeNull(); expect(durabilityOf(id)).toBeNull();
    expect(elementParticlesOf(id)).toBeNull();
  }
  expect(isOpaque(65535)).toBe(false); expect(isSolid(65535)).toBe(false); expect(emission(65535)).toBe(0);
  expect(elementZOfBlock(0)).toBeNull(); expect(() => elementBlockId(119)).toThrow();
});

it("retains all high bits in Chunk and integer world edits through unload and regeneration", () => {
  const chunk = new Chunk(0, 0); expect(chunk.blocks).toBeInstanceOf(Uint16Array); expect(chunk.light).toBeInstanceOf(Uint8Array);
  chunk.set(0, 90, 0, 32768); chunk.set(1, 90, 0, 32769); chunk.set(2, 90, 0, 32886);
  expect([chunk.get(0, 90, 0), chunk.get(1, 90, 0), chunk.get(2, 90, 0)]).toEqual([32768,32769,32886]);
  const world = new World(13);
  for (const [x, id] of [[-1, 32768], [15, 32769], [16, 32886]]) world.setBlock(x, 90, 0, id);
  const edits = world.exportEdits(); world.unloadChunk(-1, 0); world.unloadChunk(0, 0); world.unloadChunk(1, 0);
  expect(world.getBlock(-1, 90, 0)).toBe(32768); expect(world.getBlock(15, 90, 0)).toBe(32769); expect(world.getBlock(16, 90, 0)).toBe(32886);
  const restored = new World(13); restored.importEdits(edits); expect(restored.exportEdits()).toEqual(edits);
});

it("meshes high IDs with their own UVs and culls high/low and cross-chunk opaque neighbors", () => {
  const world = emptyWorld(), tiles = new Set<string>();
  const uv = (name: string): readonly [number, number, number, number] => { tiles.add(name); return name.includes("element_block") ? [.25, .25, .5, .5] : [0, 0, 1, 1]; };
  world.setBlock(5, 70, 5, elementBlockId(0));
  const mesh = meshChunk(world, 0, 0, uv); expect(mesh.solid.indices).toHaveLength(36); expect(tiles).toEqual(new Set(["element_block_0_unknown"]));
  expect(Array.from(mesh.solid.uvs).every((n) => n >= .25 && n <= .5)).toBe(true);
  world.setBlock(6, 70, 5, blockId("stone")); expect(meshChunk(world, 0, 0, uv).solid.indices).toHaveLength(60);
  world.setBlock(5, 70, 5, AIR); world.setBlock(6, 70, 5, AIR);
  world.setBlock(15, 70, 5, elementBlockId(118)); world.setBlock(16, 70, 5, elementBlockId(1));
  expect(meshChunk(world, 0, 0, uv).solid.indices).toHaveLength(30);
  expect(tiles.has("element_block_118_Og")).toBe(true);
});

it("recognizes high blocks for collision, ray hits, opacity/light and other block-specific guards", () => {
  const world = new World(13), id = elementBlockId(79); world.setBlock(8, 90, 8, id);
  expect(isSolid(id)).toBe(true); expect(isOpaque(id)).toBe(true);
  expect(boxCollides((x, y, z) => world.getBlock(x, y, z), { minX: 8.2, maxX: 8.8, minY: 90.2, maxY: 91.2, minZ: 8.2, maxZ: 8.8 })).toBe(true);
  expect(raycast((x, y, z) => world.getBlock(x, y, z), { x: 8.5, y: 90.5, z: 10.5 }, { x: 0, y: 0, z: -1 }, 5, (value) => value === id)).toMatchObject({ id, normal: { x: 0, y: 0, z: 1 } });
  expect(world.getLight(8, 90, 8)).toBe(0);
  world.setBlock(7, 90, 8, blockId("torch")); expect(world.getLight(7, 90, 8) & 15).toBe(14); expect(world.getLight(8, 90, 8) & 15).toBe(0);
  expect(chalkboardSizeOf(id)).toBeNull(); expect(canPlaceChalkboard((x, y, z) => world.getBlock(x, y, z), { x: 8, y: 90, z: 8, size: "slate", facing: 0 })).toBe(false);
  world.setBlock(8, 89, 8, blockId("farmland_7")); const farm = new FarmingSystem(world); farm.update(1);
  expect(world.getBlock(8, 89, 8)).toBe(blockId("dirt")); farm.dispose();
});

it("places and harvests every base element back to the same item and keeps isotopes nonplaceable", () => {
  const world = new World(13);
  for (const element of ELEMENTS) {
    const bag = new Inventory(), id = stackId(element.name.toLowerCase()); bag.add(id, 2);
    expect(placeBlock(world, bag, "survival", 8, 90, 8, feet)).toBe(true); expect(world.getBlock(8, 90, 8)).toBe(elementBlockId(element.z));
    expect(bag.slots[0]).toEqual({ id, count: 1 }); expect(breakBlock(world, bag, "survival", 8, 90, 8)).toBe(true); expect(bag.slots[0]).toEqual({ id, count: 2 });
  }
  for (const isotope of ITEMS.filter((i) => i.chem?.kind === "isotope")) {
    const bag = new Inventory(); bag.add(isotope.id, 2); const before = bag.toJSON();
    expect(placedBlockOf(isotope.id)).toBeNull(); expect(placeBlock(world, bag, "survival", 8, 90, 8, feet)).toBe(false); expect(bag.toJSON()).toEqual(before);
  }
});

it("canonicalizes high block aliases in inventory/pick/Agent paths without relabeling saved isotope IDs", () => {
  const high = elementBlockId(6), carbon = stackId("carbon"), isotope = stackId("carbon_11"), bag = new Inventory();
  bag.add(high, 2); expect(bag.slots[0]).toEqual({ id: carbon, count: 2 });
  bag.setSlot(3, { id: high, count: 1 }); expect(bag.slots[3]).toEqual({ id: carbon, count: 1 });
  bag.selected = 7; bag.pick(high); expect(bag.selected).toBe(0); expect(bag.slots[7]).toBeNull();
  bag.add(isotope, 3); expect(bag.slots.some((s) => s?.id === isotope && s.count === 3)).toBe(true);
  const agent = createAgent(8, 91, 8); expect(giveAgent(agent, { id: high, count: 2 })).toBe(0); expect(agent.slots[0]).toEqual({ id: carbon, count: 2 });
  const world = new World(13); expect(runAgentCommand(world, agent, { op: "place", dir: "down" }).ok).toBe(true); expect(world.getBlock(8, 90, 8)).toBe(high);
  expect(runAgentCommand(world, agent, { op: "destroy", dir: "down" }).ok).toBe(true); expect(agent.slots[0]).toEqual({ id: carbon, count: 2 });
  const unknown = new Inventory(); unknown.add(elementBlockId(0), 2); expect(unknown.slots[0]).toEqual({ id: 32768, count: 2 });
  expect(placeBlock(world, unknown, "survival", 8, 90, 8, feet)).toBe(true); expect(breakBlock(world, unknown, "survival", 8, 90, 8)).toBe(true); expect(unknown.slots[0]!.count).toBe(2);
  expect(parseCommand("/give hydrogen")).toMatchObject({ id: 284 }); expect(parseCommand("/give element_0")).toMatchObject({ id: 32768 });
});

it("preserves full-bag/build/overlap refusal and creative count behavior with extended solids", () => {
  const world = new World(13), bag = new Inventory(), id = stackId("hydrogen"); bag.add(id, 2);
  world.setBlock(8, 89, 8, blockId("deny")); expect(placeBlock(world, bag, "survival", 8, 90, 8, feet)).toBe(false);
  expect(placeBlock(world, bag, "creative", 8, 90, 8, feet)).toBe(true); expect(bag.slots[0]!.count).toBe(2);
  world.setBlock(8, 90, 8, AIR); world.setBlock(8, 89, 8, AIR);
  expect(placeBlock(world, bag, "survival", 8, 90, 8, { x: 8.5, y: 90, z: 8.5 })).toBe(false);
  expect(placeBlock(world, bag, "survival", 8, 90, 8, feet)).toBe(true);
  for (let i = 0; i < 36; i++) bag.setSlot(i, { id: blockId("stone"), count: 64 });
  const before = bag.toJSON(); expect(breakBlock(world, bag, "survival", 8, 90, 8)).toBe(false); expect(bag.toJSON()).toEqual(before); expect(world.getBlock(8, 90, 8)).toBe(32769);
});

it("loads a literal pre-extension v1 fixture without remapping any IDs, references or unrelated numbers", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/world-v1-before-element-blocks.json", import.meta.url), "utf8"));
  const parsed = parseSave(JSON.stringify(fixture));
  expect(parsed.version).toBe(1); expect(parsed.player).toEqual(fixture.player);
  expect(Inventory.fromJSON(parsed.inventory).toJSON()).toEqual(fixture.inventory);
  expect(sanitizeInventoryPending(parsed.inventoryPending)).toEqual(fixture.inventoryPending); expect(sanitizeAgent(parsed.agent)).toEqual(fixture.agent);
  expect(sanitizeFurnaces(parsed.furnaces).furnaces).toEqual(fixture.furnaces); expect(sanitizeChalkboards(parsed.chalkboards).boards).toEqual(fixture.chalkboards);
  expect(loadPrograms(parsed.programs)).toEqual({ programs: fixture.programs, errors: [] }); expect(sanitizeScheduled(parsed.redstone)).toEqual(fixture.redstone);
  expect(parsed.farming).toEqual(fixture.farming); expect(sanitizeEdits(parsed.edits)).toEqual(fixture.edits);
  expect(parseSave(serializeSave(parsed)).inventory).toEqual(parsed.inventory);
});

it("round trips high integer edits with v1 JSON and rejects item IDs/unknown IDs as world blocks", () => {
  const edits: [number, number, number, number][] = [[-1, 90, 0, 32768], [15, 90, 0, 32769], [16, 90, 0, 32886]];
  const parsed = parseSave(serializeSave({ name: "high blocks", seed: 13, mode: "survival", timeOfDay: .3,
    player: { position: feet, yaw: 0, pitch: 0, flying: false }, inventory: new Inventory().toJSON(), edits }));
  expect(parsed.version).toBe(1); expect(sanitizeEdits(parsed.edits)).toEqual(edits);
  const world = new World(parsed.seed); world.importEdits(sanitizeEdits(parsed.edits)); expect(world.exportEdits()).toEqual(edits);
  expect(sanitizeEdits([...edits, [0, 90, 0, 256], [0, 90, 0, 774], [0, 90, 0, 65535], [0, 90, 0, 65536], [0, 90, 0, .5]])).toEqual(edits);
});

it("uses the same canonical IDs for capacity prediction and actual adds, including old hidden states", () => {
  for (const alias of [elementBlockId(6), blockId("redstone_wire_15"), blockId("lever_on")]) {
    const canonical = baseStackId(alias), bag = new Inventory(); expect(canonical).not.toBe(alias);
    for (let i = 0; i < 36; i++) bag.setSlot(i, { id: blockId("stone"), count: 64 });
    bag.setSlot(0, { id: canonical, count: 63 });
    expect(bag.spaceFor(alias)).toBe(1); expect(bag.spaceFor(canonical)).toBe(1);
    expect(bag.addStack({ id: alias, count: 2 })).toBe(1); expect(bag.slots[0]).toEqual({ id: canonical, count: 64 });
    expect(bag.spaceFor(alias)).toBe(0); expect(bag.add(alias)).toBe(1);
  }
  const bag = new Inventory();
  for (const invalid of [-1, NaN, Infinity, ITEMS.at(-1)!.id + 1, 32767, 65535, 65536]) expect(bag.spaceFor(invalid)).toBe(0);
});
