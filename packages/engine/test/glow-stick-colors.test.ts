import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  AIR, BLOCKS, ITEMS, RECIPES, GLOW_STICK_COLORS, Inventory, PlayerDeathTransfer, World, WorldDrops,
  blockId, cloneStack, craftOnce, createAgent, giveAgent, itemById, matchRecipe, maxStackOf, parseSave,
  placeBlock, placedBlockOf, runAgentCommand, sanitizeAgent, sanitizeInventoryPending, sanitizeStack,
  serializeSave, stackId, stacksCompatible, validatePlayerDeathOwnership, type CraftingGrid, type ItemStack, type PlayerDeathState,
} from "../src";
const baseline = JSON.parse(readFileSync(new URL("./fixtures/glow-stick-colors-baseline.json", import.meta.url), "utf8"));
const facts = JSON.parse(readFileSync(new URL("./fixtures/glow-stick-color-source-facts.json", import.meta.url), "utf8"));
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value) + "\n").digest("hex");
const st = (name: string, count = 1): ItemStack => ({ id: stackId(name), count });
const grid = (dye: string, count = 1): CraftingGrid => ["polyethylene", "hydrogen_peroxide", "polyethylene", "polyethylene", dye, "polyethylene", "polyethylene", "luminol", "polyethylene"].map(name => st(name, count));
const crafted = () => GLOW_STICK_COLORS.map(c => craftOnce(grid(c.dye), 3)!);
const floor = { getLoadedBlock: (_x: number, y: number, _z: number) => y === 0 ? blockId("stone") : AIR };
const full = () => { const inv = new Inventory(); for (let i = 0; i < 36; i++) inv.setSlot(i, st("stone", 64)); return inv; };
const saveBase = { name: "glow color ownership", seed: 1, mode: "survival" as const, timeOfDay: .2, player: { position: { x: .5, y: 1, z: .5 }, yaw: 0, pitch: 0, flying: false }, edits: [] };

it("pins fourteen literal catalog identities, excluding both red-art placeholders and unknown activation rules", () => {
  const expected = [[1, "red"], [2, "green"], [3, "brown"], [4, "blue"], [5, "purple"], [6, "cyan"], [8, "gray"], [9, "pink"], [10, "lime"], [11, "yellow"], [12, "light_blue"], [13, "magenta"], [14, "orange"], [15, "white"]];
  expect(GLOW_STICK_COLORS.map(c => [c.legacyData, c.color])).toEqual(expected);
  expect(GLOW_STICK_COLORS.map(c => [c.legacyData, c.color, c.itemName, c.dye])).toEqual(facts.variants.filter((v: { catalogSelectable: boolean }) => v.catalogSelectable).map((v: { nativeLegacyData: number; color: string; proposedApplicationItemName: string; canonicalDye: string }) => [v.nativeLegacyData, v.color, v.proposedApplicationItemName, v.canonicalDye]));
  expect(facts.totalSupportedColors).toBe(14); expect(facts.additionalColors).toBe(13);
  expect(facts.variants.filter((v: { placeholder: boolean }) => v.placeholder).map((v: { nativeLegacyData: number }) => v.nativeLegacyData)).toEqual([0, 7]);
  expect(facts.excludedUnsupportedProducts).toEqual(["black", "light_gray"]);
  for (const field of ["nativeActivationMetadata", "nativeDurationSeconds", "nativeDurability", "nativeLightStrength", "nativePlacementRule"]) expect(facts[field]).toBeNull();
  expect(facts.journal.pattern).toEqual(["PHP", "PDP", "PLP"]); expect(facts.journal.outputCountProven).toBeNull();
  expect(facts.sources.map((s: { sha256: string }) => s.sha256)).toEqual([
    "5aa219340a95531f9517ff7713ca1075b1f9524c342fa577f6ac7916416308fc",
    "3b05a3686d10da21033888a54aac8b378778d270bd533777eb09217155f0afde",
    "99791e9cf7b37756d3fefeebf6744279eb853bea9be7b9e10cea25d2c658f93d",
    "c1c9ea59ecaf1dcfb48d35d42511f8e756f9f4a5e6b184e608305d73beadaaa8",
    "35f544af9bd169fd92889d299108f26da878b56d728e5a0afabc5c4013a5513a",
  ]);
});

it("retains all537 old item definitions,307 blocks,128 recipes and exact old green owners", () => {
  expect([baseline.items, baseline.blocks, baseline.recipes]).toEqual([537, 307, 128]);
  expect(ITEMS.slice(0, 550)).toHaveLength(550); expect(BLOCKS).toHaveLength(307); expect(RECIPES.slice(0, 141)).toHaveLength(141);
  expect(digest(ITEMS.slice(0, 537))).toBe(baseline.itemDefsSHA256); expect(digest(BLOCKS)).toBe(baseline.blockDefsSHA256);
  expect(digest(RECIPES.slice(0, 128))).toBe(baseline.recipesSHA256); expect(RECIPES.slice(0, 128).map(r => r.id)).toEqual(baseline.recipeIDs);
  expect(itemById(stackId("glow_stick"))).toEqual(baseline.oldGreenItem); expect(RECIPES.find(r => r.id === "glow_stick")).toEqual(baseline.oldGreenRecipe);
  expect(placedBlockOf(stackId("glow_stick"))).toBe(blockId("placed_glow_stick"));
  expect(ITEMS.slice(537, 550).map(i => i.id)).toEqual(Array.from({ length: 13 }, (_, i) => 793 + i));
  expect(ITEMS.slice(537, 550).map(i => i.name)).toEqual(GLOW_STICK_COLORS.filter(c => c.color !== "green").map(c => c.itemName));
  expect(new Set(ITEMS.slice(0, 550).map(i => i.name)).size).toBe(550); expect(new Set(RECIPES.slice(0, 141).map(r => r.id)).size).toBe(141);
});

it("crafts each matching color from the nine Journal cells with exactly six polyethylene and provisional output1", () => {
  for (const color of GLOW_STICK_COLORS) {
    const cells = grid(color.dye, 2), before = structuredClone(cells), result = st(color.itemName);
    expect(cells.filter(s => s!.id === stackId("polyethylene"))).toHaveLength(6);
    expect(matchRecipe(cells, 3)?.recipe.id).toBe(color.itemName); expect(matchRecipe(cells, 3)?.result).toEqual(result); expect(cells).toEqual(before);
    expect(craftOnce(cells, 3)).toEqual(result); expect(cells).toEqual(grid(color.dye));
    expect(craftOnce(cells, 3)).toEqual(result); expect(cells).toEqual(Array(9).fill(null));
    if (color.color !== "green") expect(RECIPES.find(r => r.id === color.itemName)?.note).toContain("output count provisional");
  }
  const red = grid("red_dye"), blue = grid("blue_dye");
  expect(craftOnce(red, 3)).toEqual(st("red_glow_stick")); expect(craftOnce(blue, 3)).toEqual(st("blue_glow_stick"));
});

it("refuses missing polyethylene, swapped chemistry, unsupported dyes and compact2x2 without consuming inputs", () => {
  for (const color of GLOW_STICK_COLORS) {
    for (const missing of [0, 2, 3, 5, 6, 8]) {
      const cells = grid(color.dye); cells[missing] = null; const before = structuredClone(cells);
      expect(craftOnce(cells, 3)).toBeNull(); expect(cells).toEqual(before);
    }
    const swapped = grid(color.dye); [swapped[1], swapped[7]] = [swapped[7], swapped[1]]; const before = structuredClone(swapped);
    expect(craftOnce(swapped, 3)).toBeNull(); expect(swapped).toEqual(before);
    const compact = [st("polyethylene", 6), st("hydrogen_peroxide"), st(color.dye), st("luminol")], old = structuredClone(compact);
    expect(craftOnce(compact, 2)).toBeNull(); expect(compact).toEqual(old);
  }
  for (const dye of ["black_dye", "light_gray_dye", "ink_sac", "luminol"]) {
    const cells = grid(dye), before = structuredClone(cells); expect(craftOnce(cells, 3)).toBeNull(); expect(cells).toEqual(before);
  }
  for (const name of ["black_glow_stick", "light_gray_glow_stick", "green_glow_stick"]) expect(() => stackId(name)).toThrow();
});

it("keeps color owners distinct and detached through bags, pending cursors and raw save sanitizers", () => {
  const outputs = crafted(), inv = new Inventory();
  for (const output of outputs) { expect(inv.addStack(output)).toBe(0); expect(sanitizeStack(output)).toEqual(output); }
  expect(inv.slots.filter(Boolean)).toEqual(outputs); expect(stacksCompatible(outputs[0], outputs[1])).toBe(false);
  const copied = cloneStack(outputs[0]); copied.count = 40; expect(outputs[0].count).toBe(1);
  // Pending ownership is one cursor plus at most nine grid cells; exercise all colors in valid chunks.
  for (const group of [outputs.slice(0, 10), outputs.slice(10)]) {
    const pending = group.map(s => ({ ...s, count: 2 }));
    const parsed = parseSave(serializeSave({ ...saveBase, inventory: inv.toJSON(), inventoryPending: pending }));
    expect(Inventory.fromJSON(parsed.inventory).slots.filter(Boolean)).toEqual(outputs); expect(sanitizeInventoryPending(parsed.inventoryPending)).toEqual(pending);
    const clean = sanitizeInventoryPending(parsed.inventoryPending); clean[0].count = 9; expect(pending[0].count).toBe(2);
  }
  for (const c of GLOW_STICK_COLORS) { expect(maxStackOf(stackId(c.itemName))).toBe(64); expect(sanitizeStack(st(c.itemName, 65))).toBeNull(); }
});

it("preserves Agent source on refused batches and partial world pickup leaves exactly the retained remainder", () => {
  const w = new World(1);
  for (const color of GLOW_STICK_COLORS) {
    const robot = createAgent(0, 1, 0), output = craftOnce(grid(color.dye), 3)!;
    expect(giveAgent(robot, { ...output, count: 65 })).toBe(0); expect(robot.slots.slice(0, 2)).toEqual([st(color.itemName, 64), st(color.itemName)]);
    const before = structuredClone(robot); expect(runAgentCommand(w, robot, { op: "drop", slot: 0, quantity: 2 }, { worldDrop: () => null }).ok).toBe(false); expect(robot).toEqual(before);
    const drops = new WorldDrops(floor); expect(runAgentCommand(w, robot, { op: "drop", slot: 0, quantity: 2 }, { worldDrop: drops.planSpawnBatch.bind(drops) }).ok).toBe(true);
    expect(robot.slots[0]).toEqual(st(color.itemName, 62)); expect(drops.records.map(r => r.stack)).toEqual([st(color.itemName, 2)]);
    const savedDrops = drops.toJSON(); savedDrops.records[0].pickupDelaySeconds = 0;
    const loaded = new WorldDrops(floor, savedDrops), bag = full(), position = savedDrops.records[0].position;
    expect(loaded.tryPickup(position, s => bag.addStack(s))).toBe(0); expect(loaded.records[0].stack).toEqual(st(color.itemName, 2));
    bag.setSlot(0, st(color.itemName, 63)); expect(loaded.tryPickup(position, s => bag.addStack(s))).toBe(1); expect(bag.slots[0]).toEqual(st(color.itemName, 64)); expect(loaded.records[0].stack).toEqual(st(color.itemName));
    bag.setSlot(1, null); expect(loaded.tryPickup(position, s => bag.addStack(s))).toBe(1); expect(loaded.records).toEqual([]); expect(loaded.tryPickup(position, s => bag.addStack(s))).toBe(0);
    const parsed = parseSave(serializeSave({ ...saveBase, inventory: bag.toJSON(), agent: robot, worldDrops: loaded.toJSON() }));
    expect(sanitizeAgent(parsed.agent)!.slots.slice(0, 2)).toEqual([st(color.itemName, 62), st(color.itemName)]); expect(Inventory.fromJSON(parsed.inventory).slots.slice(0, 2)).toEqual([st(color.itemName, 64), st(color.itemName)]);
  }
});

it("transfers crafted colors and pending cursor owners through death once, refusing the whole batch first", () => {
  const outputs = crafted(), inv = new Inventory(); for (const s of outputs) inv.addStack(s);
  const pending = [st("red_glow_stick", 2), st("glow_stick", 3)], original = inv.toJSON(), originalPending = structuredClone(pending);
  const death: PlayerDeathState = { phase: "pending", position: { x: .5, y: 1, z: .5 }, keepInventory: false }, transfer = new PlayerDeathTransfer(), drops = new WorldDrops(floor);
  expect(transfer.tryTransfer(inv, pending, death, () => null, () => { pending.length = 0; })).toBe(false); expect(inv.toJSON()).toEqual(original); expect(pending).toEqual(originalPending);
  expect(transfer.tryTransfer(inv, pending, death, drops.planSpawnBatch.bind(drops), () => { pending.length = 0; })).toBe(true);
  expect(drops.records.map(r => r.stack)).toEqual([...outputs, ...originalPending]); expect(inv.slots.every(s => s === null)).toBe(true); expect(death.phase).toBe("complete");
  expect(transfer.tryTransfer(inv, pending, death, () => { throw Error("must not replay"); }, () => {})).toBe(true);
  const parsed = parseSave(serializeSave({ ...saveBase, inventory: inv.toJSON(), playerState: { health: 0, death }, worldDrops: drops.toJSON() }));
  expect(new WorldDrops(floor, parsed.worldDrops).records.map(r => r.stack)).toEqual([...outputs, ...originalPending]); expect(validatePlayerDeathOwnership(inv.toJSON(), [])).toBe(true);
  const bad = new Inventory(); bad.slots[0] = st("red_glow_stick", 65); expect(validatePlayerDeathOwnership(bad.toJSON(), [])).toBe(false);
});

it("does not turn the additional thirteen color identities into new permanent-light placement blocks", () => {
  const w = new World(1); w.setBlock(8, 90, 8, AIR);
  for (const color of GLOW_STICK_COLORS.filter(c => c.color !== "green")) {
    const inv = new Inventory(); inv.addStack(craftOnce(grid(color.dye), 3)!); const before = inv.toJSON();
    expect(itemById(stackId(color.itemName)).places).toBeUndefined(); expect(placedBlockOf(stackId(color.itemName))).toBeNull();
    expect(placeBlock(w, inv, "survival", 8, 90, 8, { x: 10, y: 90, z: 10 })).toBe(false); expect(inv.toJSON()).toEqual(before); expect(w.getBlock(8, 90, 8)).toBe(AIR);
  }
});
