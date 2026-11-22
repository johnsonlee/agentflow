import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  AIR, BLOCKS, DYE_COLORS, ITEMS, Inventory, World, baseStackId, blockById, blockDrops, blockId,
  boxCollides, breakBlock, breakTime, craftOnce, createAgent, dropCount, dropOf, giveAgent, isItem,
  isKnownBlockId, isOpaque, isSolid, matchRecipe, meshChunk, parseSave, placeBlock, placedBlockOf,
  raycast, runAgentCommand, sanitizeAgent, sanitizeEdits, sanitizeInventoryPending, serializeSave,
  stackId, type CraftingGrid, type ItemStack, type MeshData,
} from "../src/index";

const stack = (name: string, count = 1): ItemStack => ({ id: stackId(name), count });
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value) + "\n").digest("hex");
const meshHash = (mesh: MeshData) => digest(Object.fromEntries(Object.entries(mesh).map(([n, a]) => [n, Array.from(a)])));
const names = DYE_COLORS.map((c) => `${c.name}_stained_glass`);
const source = JSON.parse(readFileSync(new URL("./fixtures/stained-glass-source-recipes.json", import.meta.url), "utf8")) as {
  revision: string; records: { recipe: string; pattern: string[]; keys: Record<string, string>; output: { name: string; count: number } }[];
};
function emptyWorld() {
  const world = new World(13);
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) world.getChunk(x, z).blocks.fill(AIR);
  return world;
}

it("preserves all prior registry/atom IDs and adds only sixteen explicit translucent low-block identities", () => {
  expect(digest(BLOCKS.slice(0, 291).map(({ id, name }) => [id, name]))).toBe("25176986039cc25bf6439a18fa41557d6795fff785648954210ae5451484b561");
  expect(digest(ITEMS.slice(0, 535).map(({ id, name }) => [id, name]))).toBe("885d45248089dcfd792313e7a5e8cd18f293596684eb119a628a8afda3844b3f");
  expect(digest(ITEMS.filter((i) => i.chem?.kind === "element" || i.chem?.kind === "isotope").map((i) => [i.id, i.chem!.kind, i.chem!.z, i.chem!.symbol, i.chem!.mass])))
    .toBe("54ba81669824eb6b526e76e1fff7f979ed42b273faed2f99b71012c5d34be270");
  expect(BLOCKS.slice(0, 307)).toHaveLength(307); expect(ITEMS.slice(0, 535)).toHaveLength(535);
  expect(BLOCKS.slice(291, 307).map((b) => [b.id, b.name])).toEqual(names.map((name, i) => [172 + i, name]));
  expect(BLOCKS.filter((b) => b.translucent).map((b) => b.name)).toEqual(names);
  for (const name of names) {
    const id = blockId(name), def = blockById(id);
    expect(def).toMatchObject({ transparent: true, translucent: true, solid: true, shape: "cube", creative: true, hardness: .45 });
    expect(def.faces).toEqual({ top: name, side: name, bottom: name });
    expect(isItem(id)).toBe(false); expect(isKnownBlockId(id)).toBe(true); expect(placedBlockOf(id)).toBe(id);
  }
  expect(isKnownBlockId(208)).toBe(false); expect(blockId("glass")).toBe(11); expect(blockId("element_118")).toBe(32886);
});

it("crafts every primary-source ring with exact eight outputs and one unit consumed per occupied cell", () => {
  expect(source.revision).toBe("15701fa9c13923f12662984c32c124327e40e3d3"); expect(source.records).toHaveLength(17);
  for (const record of source.records) {
    const grid: CraftingGrid = record.pattern.flatMap((row) => [...row].map((c) => stack(record.keys[c], 3)));
    expect(craftOnce(grid, 3), record.recipe).toEqual(stack(record.output.name, record.output.count));
    expect(record.output.count).toBe(8); expect(grid.every((s) => s?.count === 2)).toBe(true);
    expect(craftOnce(grid, 3)).toEqual(stack(record.output.name, 8));
    expect(grid.every((s) => s?.count === 1)).toBe(true);
  }
  expect(source.records.filter((r) => r.recipe !== "black_stained_glass_from_ink_sac").map((r) => r.output.name).sort()).toEqual([...names].sort());
});

it("refuses incomplete rings, moved dyes, wrong input classes and small grids without consuming ingredients", () => {
  const valid = () => Array.from({ length: 9 }, (_, i) => stack(i === 4 ? "red_dye" : "glass", 2));
  for (let hole = 0; hole < 9; hole++) {
    const grid: CraftingGrid = valid(); grid[hole] = null; const before = structuredClone(grid);
    expect(craftOnce(grid, 3)).toBeNull(); expect(grid).toEqual(before);
  }
  for (const wrong of ["red_wool", "poppy", "sodium_hypochlorite", "carbon", "red_stained_glass"]) {
    const grid = valid(); grid[4] = stack(wrong, 2); const before = structuredClone(grid);
    expect(craftOnce(grid, 3)).toBeNull(); expect(grid).toEqual(before);
  }
  const swapped = valid(); [swapped[0], swapped[4]] = [swapped[4], swapped[0]];
  const before = structuredClone(swapped); expect(craftOnce(swapped, 3)).toBeNull(); expect(swapped).toEqual(before);
  const recolor = valid().map((s, i) => i === 4 ? s : stack("blue_stained_glass", 2));
  expect(craftOnce(recolor, 3)).toBeNull();
  expect(matchRecipe([stack("glass", 8), stack("red_dye"), null, null], 2)).toBeNull();
  const blue = valid(); blue[4] = stack("blue_dye"); expect(matchRecipe(blue, 3)?.result).toEqual(stack("blue_stained_glass", 8));
});

it("shatters ordinary and all stained glass through shared player/Agent paths even with full inventories", () => {
  const world = new World(13), bag = new Inventory(), agent = createAgent(8, 91, 8);
  for (let i = 0; i < 36; i++) bag.setSlot(i, stack("stone", 64));
  for (let i = 0; i < 27; i++) agent.slots[i] = stack("stone", 64);
  for (const name of ["glass", ...names]) {
    const id = blockId(name); expect(dropCount(id)).toBe(0); expect(blockDrops(id)).toEqual([]);
    expect(dropOf(id)).toBe(id); expect(baseStackId(id)).toBe(id);
    const before = bag.toJSON(); world.setBlock(8, 90, 8, id);
    expect(breakBlock(world, bag, "survival", 8, 90, 8)).toBe(true); expect(world.getBlock(8, 90, 8)).toBe(AIR); expect(bag.toJSON()).toEqual(before);
    const agentBefore = structuredClone(agent); world.setBlock(8, 90, 8, id);
    expect(runAgentCommand(world, agent, { op: "destroy", dir: "down" }).ok).toBe(true);
    expect(world.getBlock(8, 90, 8)).toBe(AIR); expect(agent).toEqual(agentBefore);
  }
  expect(dropCount(blockId("stone"))).toBe(1); expect(blockDrops(blockId("bookshelf"))).toEqual([stack("book", 3)]);
});

it("still protects support/external drops and Deny when the glass itself has no output", () => {
  const world = new World(13), bag = new Inventory(), glass = blockId("red_stained_glass");
  for (let i = 0; i < 36; i++) bag.setSlot(i, stack("stone", 64));
  world.setBlock(8, 90, 8, glass); world.setBlock(8, 91, 8, blockId("poppy"));
  const before = bag.toJSON(); expect(breakBlock(world, bag, "survival", 8, 90, 8)).toBe(false);
  expect(world.getBlock(8, 90, 8)).toBe(glass); expect(world.getBlock(8, 91, 8)).toBe(blockId("poppy")); expect(bag.toJSON()).toEqual(before);
  world.setBlock(8, 91, 8, AIR);
  expect(breakBlock(world, bag, "survival", 8, 90, 8, () => 0, [stack("iron_ingot")])).toBe(false);
  bag.setSlot(35, null); expect(breakBlock(world, bag, "survival", 8, 90, 8, () => 0, [stack("iron_ingot")])).toBe(true); expect(bag.slots[35]).toEqual(stack("iron_ingot"));
  world.setBlock(8, 89, 8, blockId("deny")); world.setBlock(8, 90, 8, glass);
  expect(breakBlock(world, bag, "survival", 8, 90, 8)).toBe(false); expect(breakBlock(world, bag, "creative", 8, 90, 8)).toBe(true);
});

it("places every color, collides and ray-targets full cubes while allowing ordinary sky/torch light", () => {
  const world = new World(13);
  for (const name of names) {
    const bag = new Inventory(), id = blockId(name); bag.add(id, 8);
    expect(placeBlock(world, bag, "survival", 8, 90, 8, { x: 2, y: 91, z: 2 })).toBe(true);
    expect(bag.slots[0]!.count).toBe(7); expect(isSolid(id)).toBe(true); expect(isOpaque(id)).toBe(false);
    expect(boxCollides((x, y, z) => world.getBlock(x, y, z), { minX: 8.1, maxX: 8.9, minY: 90.1, maxY: 91.1, minZ: 8.1, maxZ: 8.9 })).toBe(true);
    expect(raycast((x, y, z) => world.getBlock(x, y, z), { x: 8.5, y: 90.5, z: 10.5 }, { x: 0, y: 0, z: -1 }, 5, (n) => n === id)).toMatchObject({ id, x: 8, y: 90, z: 8, normal: { x: 0, y: 0, z: 1 } });
    expect(world.getLight(8, 90, 8) >> 4).toBe(15);
    world.setBlock(7, 90, 8, blockId("torch")); expect(world.getLight(8, 90, 8) & 15).toBeGreaterThan(0);
    expect(breakTime("survival", id)).toBe(breakTime("survival", blockId("glass")));
    world.setBlock(8, 90, 8, AIR);
  }
});

it("partitions stained solids into their own mesh, culls same-color neighbors and retains different-color boundaries", () => {
  const world = emptyWorld(), uv = () => [0, 0, 1, 1] as const, red = blockId("red_stained_glass"), blue = blockId("blue_stained_glass");
  world.setBlock(5, 70, 5, red);
  let mesh = meshChunk(world, 0, 0, uv); expect(mesh.translucent.indices).toHaveLength(36); expect(mesh.solid.indices).toHaveLength(0); expect(mesh.liquid.indices).toHaveLength(0);
  expect(Math.max(...Array.from(mesh.translucent.positions).filter((_, i) => i % 3 === 1))).toBe(71); // Not lowered like water.
  world.setBlock(6, 70, 5, red); expect(meshChunk(world, 0, 0, uv).translucent.indices).toHaveLength(60);
  world.setBlock(6, 70, 5, blue); expect(meshChunk(world, 0, 0, uv).translucent.indices).toHaveLength(72);
  world.setBlock(6, 70, 5, blockId("stone")); mesh = meshChunk(world, 0, 0, uv);
  expect(mesh.translucent.indices).toHaveLength(30); expect(mesh.solid.indices).toHaveLength(36);
  world.setBlock(5, 70, 5, AIR); world.setBlock(6, 70, 5, AIR);
  world.setBlock(15, 70, 5, red); world.setBlock(16, 70, 5, red);
  expect(meshChunk(world, 0, 0, uv).translucent.indices).toHaveLength(30);
  world.setBlock(16, 70, 5, blue); expect(meshChunk(world, 0, 0, uv).translucent.indices).toHaveLength(36);
});

it("retains byte-for-byte old solid/liquid mesh outputs for mixed legacy blocks", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/glass-old-mesh-96.json", import.meta.url), "utf8"));
  const world = emptyWorld();
  for (const [name, x, y, z] of fixture.inputs) world.setBlock(x, y, z, blockId(name));
  const mesh = meshChunk(world, 0, 0, () => [0, 0, 1, 1]);
  expect(meshHash(mesh.solid)).toBe(fixture.hashes.solid); expect(meshHash(mesh.liquid)).toBe(fixture.hashes.liquid); expect(mesh.translucent.indices).toHaveLength(0);
});

it("round trips all sixteen identities through save edits, inventory/pending/Agent and canonical pick", () => {
  const bag = new Inventory(), agent = createAgent(8, 91, 8), edits: [number, number, number, number][] = [];
  for (const [i, name] of names.entries()) {
    bag.add(stackId(name), 8); expect(giveAgent(agent, stack(name, 2))).toBe(0); edits.push([i, 90, 0, blockId(name)]);
    const pick = new Inventory(); pick.setSlot(3, stack(name, 7)); pick.pick(blockId(name)); expect(pick.selected).toBe(3); expect(pick.slots[3]).toEqual(stack(name, 7));
  }
  const pending = names.slice(0, 10).map((n) => stack(n, 2));
  const parsed = parseSave(serializeSave({ name: "all colors", seed: 13, mode: "survival", timeOfDay: .3,
    player: { position: { x: 8, y: 91, z: 8 }, yaw: 0, pitch: 0, flying: false }, inventory: bag.toJSON(), agent, inventoryPending: pending, edits }));
  expect(Inventory.fromJSON(parsed.inventory).toJSON()).toEqual(bag.toJSON()); expect(sanitizeAgent(parsed.agent)).toEqual(agent); expect(sanitizeInventoryPending(parsed.inventoryPending)).toEqual(pending);
  expect(sanitizeEdits(parsed.edits)).toEqual(edits); const world = new World(13); world.importEdits(sanitizeEdits(parsed.edits)); expect(world.exportEdits()).toEqual(edits);
  for (const [i, name] of names.entries()) expect(world.getBlock(i, 90, 0)).toBe(blockId(name));
  const placement = new World(13), robot = createAgent(8, 91, 8); giveAgent(robot, stack("red_stained_glass", 2));
  expect(runAgentCommand(placement, robot, { op: "place", dir: "down" }).ok).toBe(true);
  expect(runAgentCommand(placement, robot, { op: "destroy", dir: "down" }).ok).toBe(true); expect(robot.slots[0]).toEqual(stack("red_stained_glass", 1));
});
