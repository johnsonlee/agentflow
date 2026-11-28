import { withLegacyBirchRecipes } from "./helpers/legacy-birch-recipes";
import { withLegacyStationFaces } from "./helpers/legacy-station-faces";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  AIR, BLOCKS, ITEMS, RECIPES, NATIVE_MATERIAL_REDUCTIONS, LEGACY_MATERIAL_REDUCTIONS,
  Inventory, World, WorldDrops, blockId, blockDrops, breakBlock, canHarvest, craftOnce, matchRecipe,
  itemById, stackId, toolOf, reduceMaterial, createAgent, giveAgent, runAgentCommand,
  parseSave, serializeSave, sanitizeAgent, sanitizeInventoryPending, type ItemStack, type CraftingGrid,
} from "../src/index";
const st = (name: string, count = 1): ItemStack => ({ id: stackId(name), count });
const snow = blockId("snow");
const baseline = JSON.parse(readFileSync(new URL("./fixtures/snowball-material-baseline.json", import.meta.url), "utf8"));
const digest = (x: unknown) => createHash("sha256").update(JSON.stringify(x) + "\n").digest("hex");
const scene = () => { const w = new World(1); w.setBlock(8, 90, 8, snow); w.setBlock(8, 91, 8, AIR); return w; };
const full = () => { const b = new Inventory(); for (let i = 0; i < 36; i++) b.setSlot(i, st("stone", 64)); return b; };

it("appends item537 with application stack16 and retains all307 block identities", () => {
  expect([baseline.blocks, baseline.items, baseline.recipes, baseline.nativeRows]).toEqual([307, 536, 128, 23]);
  expect(ITEMS.slice(0, 537)).toHaveLength(537); // New13color entries append after this frozen prefix.
  expect(BLOCKS.slice(0, 307)).toHaveLength(307);
  expect(digest(withLegacyStationFaces(BLOCKS.slice(0, 307)))).toBe(baseline.blockDefsSHA256);
  expect(digest(ITEMS.slice(0, 536))).toBe(baseline.itemDefsSHA256);
  expect(withLegacyBirchRecipes(RECIPES.slice(0, 128)).map((r) => r.id)).toEqual(baseline.recipeIDs);
  expect(digest(withLegacyBirchRecipes(RECIPES.slice(0, 128)).filter((r) => r.id !== "snow_block"))).toBe(baseline.other127RecipesSHA256);
  expect(digest(NATIVE_MATERIAL_REDUCTIONS.slice(0, 23))).toBe(baseline.nativeRowsSHA256);
  expect(itemById(792)).toEqual({ name: "snowball", displayName: "Snowball", maxStack: 16, icon: "item_snowball", id: 792 });
  expect(ITEMS[535].name).toBe("glowstone_dust");
  const bag = new Inventory(); expect(bag.addStack(st("snowball", 33))).toBe(0);
  expect(bag.slots.slice(0, 3)).toEqual([st("snowball", 16), st("snowball", 16), st("snowball")]);
});

it("requires an actual shovel for player survival drops; hands and other tools still break", () => {
  for (const held of [null, "stick", "wooden_pickaxe", "wooden_axe", "wooden_sword", "wooden_hoe", "wooden_shovel", "diamond_shovel"]) {
    const w = scene(), b = new Inventory(); if (held) b.setSlot(0, st(held));
    const harvest = held?.endsWith("_shovel") ?? false;
    expect(canHarvest(snow, held ? toolOf(stackId(held)) : null)).toBe(harvest);
    expect(breakBlock(w, b, "survival", 8, 90, 8)).toBe(true); expect(w.getBlock(8, 90, 8)).toBe(AIR);
    expect(b.slots.filter((s) => s?.id === stackId("snowball"))).toEqual(harvest ? [st("snowball", 4)] : []);
  }
  expect(blockDrops(snow)).toEqual([st("snowball", 4)]); // Application quantity; no numeric runtime parity claim.
  const b = new Inventory(); b.setSlot(0, st("wooden_shovel"));
  expect(breakBlock(scene(), b, "creative", 8, 90, 8)).toBe(true); expect(b.slots.filter(Boolean)).toEqual([st("wooden_shovel")]);
});

it("refuses full receiver and either sink refusal without consuming source, metadata or tool wear", () => {
  for (const sink of [undefined, () => null, () => ({ commit: () => false })]) {
    const w = scene(), b = full(); b.setSlot(0, { ...st("wooden_shovel"), damage: 7 });
    const before = b.toJSON(); expect(breakBlock(w, b, "survival", 8, 90, 8, () => 0, [], sink)).toBe(false);
    expect(w.getBlock(8, 90, 8)).toBe(snow); expect(b.toJSON()).toEqual(before);
  }
});

it("stages one complete world batch with external metadata and wears only after acceptance", () => {
  const w = scene(), b = full(); b.setSlot(0, { ...st("wooden_shovel"), damage: 7 });
  const external = { ...st("book_and_quill"), book: { pages: ["snow field notes"] } };
  const drops = new WorldDrops(w); let calls = 0, commits = 0;
  expect(breakBlock(w, b, "survival", 8, 90, 8, () => 0, [external], (batch, p) => {
    calls++; expect(batch).toEqual([st("snowball", 4), external]);
    const reservation = drops.planSpawnBatch(batch, p)!;
    return { commit: () => { commits++; return reservation.commit(); } };
  })).toBe(true);
  expect([calls, commits]).toEqual([1, 1]); expect(b.slots[0]?.damage).toBe(8);
  expect(drops.records.map((r) => r.stack)).toEqual([st("snowball", 4), external]);
  expect(w.getBlock(8, 90, 8)).toBe(AIR);
});

it("crafts the existing snow_block ID from a real2x2 snowball grid, consuming only its four cells", () => {
  expect(withLegacyBirchRecipes(RECIPES.slice(0, 128))).toHaveLength(128);
  expect(RECIPES.find((r) => r.id === "snow_block")).toEqual({ id: "snow_block", pattern: ["##", "##"], key: { "#": "snowball" }, result: ["snow", 1] });
  const grid: CraftingGrid = Array.from({ length: 4 }, () => st("snowball", 2));
  expect(matchRecipe(grid, 2)?.recipe.id).toBe("snow_block"); expect(craftOnce(grid, 2)).toEqual(st("snow"));
  expect(grid).toEqual(Array.from({ length: 4 }, () => st("snowball")));
  expect(craftOnce(grid, 2)).toEqual(st("snow")); expect(grid).toEqual([null, null, null, null]);
  for (const wrong of [[st("snow"), st("snow"), st("snow"), st("snow")], [st("snowball", 4), null, null, null]]) {
    const before = structuredClone(wrong); expect(craftOnce(wrong, 2)).toBeNull(); expect(wrong).toEqual(before);
  }
});

it("pins the actual reducer source bytes and preserves native duplicate-H source order", () => {
  const raw = readFileSync(new URL("./fixtures/reducer-snowball-1.26.33.json", import.meta.url));
  expect(createHash("sha256").update(raw).digest("hex")).toBe("b7677d4d8ab3dc65d832d420369570fc3203cd908bb950310a66778deece5dba");
  const source = JSON.parse(raw.toString())["minecraft:recipe_material_reduction"];
  const row = NATIVE_MATERIAL_REDUCTIONS.find(r=>r.input==="snowball")!;
  expect(NATIVE_MATERIAL_REDUCTIONS.slice(0,24)).toHaveLength(24); expect(NATIVE_MATERIAL_REDUCTIONS.slice(24,26).map(r=>r.input)).toEqual(["netherrack","soul_sand"]); expect(LEGACY_MATERIAL_REDUCTIONS).toHaveLength(2);
  expect(row.inputKind).toBe("item"); expect(row.nativeIdentifier).toBe(source.input);
  expect(row.output).toEqual(source.output.map((s: { item: string; count: number }) => [Number(s.item.split("_").at(-1)), s.count]));
  expect(reduceMaterial(792)).toEqual([st("hydrogen", 64), st("hydrogen", 3), st("oxygen", 33)]);
});

it("retains Agent tool-independent destroy and bounded snowball ownership across save/partial transfer", () => {
  const w = scene(), robot = createAgent(8, 91, 8);
  expect(runAgentCommand(w, robot, { op: "destroy", dir: "down" }).ok).toBe(true);
  expect(robot.slots[0]).toEqual(st("snowball", 4)); // Existing Agent semantics have no player tool gate.
  expect(giveAgent(robot, st("snowball", 14))).toBe(0); expect(robot.slots.slice(0, 2)).toEqual([st("snowball", 16), st("snowball", 2)]);
  const b = full(); b.setSlot(1, st("snowball", 15));
  expect(runAgentCommand(w, robot, { op: "drop", slot: 0 }, { giveToPlayer: (s) => b.addStack(s) }).ok).toBe(true);
  expect(robot.slots[0]).toEqual(st("snowball", 15)); expect(b.slots[1]).toEqual(st("snowball", 16));
  const parsed = parseSave(serializeSave({ name: "snow materials", seed: 1, mode: "survival", timeOfDay: .3,
    player: { position: { x: 8, y: 91, z: 8 }, yaw: 0, pitch: 0, flying: false }, inventory: b.toJSON(), edits: w.exportEdits(), agent: robot,
    inventoryPending: [st("snowball", 16), st("snowball", 2)] }));
  expect(Inventory.fromJSON(parsed.inventory).slots[1]).toEqual(st("snowball", 16));
  expect(sanitizeAgent(parsed.agent)!.slots.slice(0, 2)).toEqual([st("snowball", 15), st("snowball", 2)]);
  expect(sanitizeInventoryPending(parsed.inventoryPending)).toEqual([st("snowball", 16), st("snowball", 2)]);
});

it("picks up the four harvested balls exactly once with full-bag remainder ownership and stack16 bounds", () => {
  const w = scene(), harvestBag = full(); harvestBag.setSlot(0, st("wooden_shovel"));
  const drops = new WorldDrops(w);
  expect(breakBlock(w, harvestBag, "survival", 8, 90, 8, () => 0, [], drops.planSpawnBatch.bind(drops))).toBe(true);
  // Keep retained world-owned harvest at a loaded empty cell with elapsed pickup delay.
  const saved = drops.toJSON(); saved.records[0].pickupDelaySeconds = 0;
  const loaded = new WorldDrops({ getLoadedBlock: () => AIR }, saved), b = full(), p = saved.records[0].position;
  expect(loaded.tryPickup(p, (s) => b.addStack(s))).toBe(0); expect(loaded.records[0].stack).toEqual(st("snowball", 4));
  b.setSlot(1, st("snowball", 15)); expect(loaded.tryPickup(p, (s) => b.addStack(s))).toBe(1);
  expect(b.slots[1]).toEqual(st("snowball", 16)); expect(loaded.records[0].stack).toEqual(st("snowball", 3));
  b.setSlot(2, null); expect(loaded.tryPickup(p, (s) => b.addStack(s))).toBe(3);
  expect(b.slots[2]).toEqual(st("snowball", 3)); expect(loaded.records).toEqual([]);
  expect(loaded.tryPickup(p, (s) => b.addStack(s))).toBe(0);
});

it("matches both retained source-pinned snow craft variants", () => {
  const variants = JSON.parse(readFileSync(new URL("./fixtures/snow-craft-source-facts.json", import.meta.url), "utf8"));
  expect(variants).toHaveLength(2);
  expect(variants.map((r: { sha256: string }) => r.sha256)).toEqual([
    "46311dae0d7f7b6d647d6d4eba46ae15739b345bc9c69a8ec82a5a8005d6a496",
    "83e2e26494b447e216f1e3d91a811fe2e3c21a2d18a13d654ca0196485654864",
  ]);
  for (const variant of variants) {
    expect(variant.pattern).toEqual(["##", "##"]); expect(variant.input).toBe("minecraft:snowball");
    expect(variant.result).toEqual({ item: "minecraft:snow" });
  }
});
