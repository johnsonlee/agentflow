import { expect, it } from "vitest";
import {
  AIR, Inventory, SnowballProjectiles, World, WorldDrops, blockId, bodyBox, boxCollides, breakBlock,
  canHostileSpawn, createAgent, findAgentPosition, parseSave, placeBlock, runAgentCommand,
  serializeSave, stackId,
} from "../src";
const F = blockId("oak_fence"), S = blockId("stone");
const stack = (id = F, count = 1) => ({ id, count });
function terrain() {
  const world = new World(7);
  for (let x = -4; x <= 5; x++) for (let z = -4; z <= 4; z++) {
    world.setBlock(x, 0, z, S); for (let y = 1; y <= 5; y++) world.setBlock(x, y, z, AIR);
  }
  return world;
}
const held = (id = F, count = 2) => { const inv = new Inventory(); inv.setSlot(0, stack(id, count)); return inv; };

it("prospective fence placement refuses above-origin overlap before consuming and permits actual empty corners", () => {
  const w = terrain(), inv = held(), before = inv.toJSON();
  expect(placeBlock(w, inv, "survival", 0, 1, 0, { x: .5, y: 2.01, z: .5 })).toBe(false);
  expect(w.getBlock(0, 1, 0)).toBe(AIR); expect(inv.toJSON()).toEqual(before);
  expect(placeBlock(w, inv, "survival", 0, 1, 0, { x: .05, y: 1, z: .05 })).toBe(true);
  expect(inv.selectedStack()).toEqual(stack(F, 1)); expect(w.getBlock(0, 1, 0)).toBe(F);
});

it("refuses an ordinary cube whose new neighbor fence arm would intersect the player above that cube", () => {
  const w = terrain(), inv = held(S); w.setBlock(0, 1, 0, F);
  const feet = { x: 1, y: 2.01, z: .5 }, get = w.getBlock.bind(w);
  expect(boxCollides(get, bodyBox(feet))).toBe(false);
  const before = inv.toJSON(); expect(placeBlock(w, inv, "survival", 1, 1, 0, feet)).toBe(false);
  expect(inv.toJSON()).toEqual(before); expect(w.getBlock(1, 1, 0)).toBe(AIR);
  expect(placeBlock(w, inv, "survival", 1, 1, 0, { x: 3.5, y: 1, z: .5 })).toBe(true);
  expect(boxCollides(get, bodyBox(feet))).toBe(true); expect(inv.selectedStack()?.count).toBe(1);
});

it("preserves refused harvest ownership, then transfers exactly one fence to ground even with a full player bag", () => {
  const w = terrain(), bag = new Inventory(); w.setBlock(0, 1, 0, F);
  for (let i = 0; i < bag.slots.length; i++) bag.setSlot(i, stack(S, 64));
  const before = bag.toJSON(); expect(breakBlock(w, bag, "survival", 0, 1, 0, () => .5, [], () => null)).toBe(false);
  expect(w.getBlock(0, 1, 0)).toBe(F); expect(bag.toJSON()).toEqual(before);
  const drops = new WorldDrops(w); expect(breakBlock(w, bag, "survival", 0, 1, 0, () => .5, [], drops.planSpawnBatch.bind(drops))).toBe(true);
  expect(w.getBlock(0, 1, 0)).toBe(AIR); expect(drops.records.map(r => r.stack)).toEqual([stack()]); expect(bag.toJSON()).toEqual(before);
  drops.update(.7); expect(drops.tryPickup({ x: .5, y: 1, z: .5 }, s => bag.addStack(s))).toBe(0);
  const save = parseSave(serializeSave({ name: "fence drop", seed: 7, mode: "survival", timeOfDay: .3, player: { position: { x: .5, y: 1, z: .5 }, yaw: 0, pitch: 0, flying: false }, inventory: bag.toJSON(), edits: w.exportEdits(), worldDrops: drops.toJSON() }));
  const restored = new WorldDrops(w, save.worldDrops); expect(restored.loadIssues).toBe(0); expect(restored.toJSON()).toEqual(drops.toJSON());
  bag.setSlot(0, null); expect(restored.tryPickup({ x: .5, y: 1, z: .5 }, s => bag.addStack(s))).toBe(1);
  expect(bag.selectedStack()).toEqual(stack()); expect(restored.records).toEqual([]);
});

it("small world-owned items settle on the1.5 collision top, survive save and remain collectible", () => {
  const w = terrain(); w.setBlock(0, 1, 0, F); const drops = new WorldDrops(w);
  expect(drops.spawnBatch([stack(stackId("string"), 2)], { x: .5, y: 4, z: .5 })).toBe(true);
  drops.update(1); expect(drops.records[0].position.y).toBeCloseTo(2.5, 3);
  expect(drops.records[0].stack.count).toBe(2); expect(boxCollides(w.getBlock.bind(w), bodyBox(drops.records[0].position, .25, .25))).toBe(false);
  const restored = new WorldDrops(w, JSON.parse(JSON.stringify(drops.toJSON()))); expect(restored.toJSON()).toEqual(drops.toJSON());
  const bag = new Inventory(); expect(restored.tryPickup({ x: .5, y: 2.5, z: .5 }, s => bag.addStack(s))).toBe(2);
  expect(bag.slots[0]).toEqual(stack(stackId("string"), 2));
});

it("Agent grid move/teleport refuses air above fences, and new fence placements preflight Agent/player overlap", () => {
  const w = terrain(); w.setBlock(0, 1, 0, F);
  const agent = createAgent(0, 2, 1, 2); expect(runAgentCommand(w, agent, { op: "move", dir: "forward" }).ok).toBe(false);
  expect([agent.x, agent.y, agent.z]).toEqual([0, 2, 1]);
  const spot = findAgentPosition(w, { x: 1.5, y: 2, z: .5 }, 0)!; expect(spot).not.toEqual({ x: 0, y: 2, z: 0 });
  const down = createAgent(1, 2, 0); down.slots[0] = stack(F, 2);
  expect(runAgentCommand(w, down, { op: "place", dir: "down" }).ok).toBe(false); expect(down.slots[0]).toEqual(stack(F, 2));
  const builder = createAgent(2, 1, 0, 1); builder.slots[0] = stack(S, 2);
  expect(runAgentCommand(w, builder, { op: "place", dir: "forward" }, { playerFeet: () => ({ x: 1, y: 2.01, z: .5 }) }).ok).toBe(false);
  expect(builder.slots[0]).toEqual(stack(S, 2)); expect(w.getBlock(1, 1, 0)).toBe(AIR);
  // Detect/inspect report block identity, not the fence collision extending into this aircell.
  expect(runAgentCommand(w, agent, { op: "detect", dir: "forward" }).value).toBe(false);
  expect(runAgentCommand(w, agent, { op: "inspect", dir: "forward" }).value).toBe("air");
});

it("Agent destroy reserves a whole fence drop once and leaves block/slot unchanged on receiver refusal", () => {
  const w = terrain(); w.setBlock(0, 1, 0, F); const agent = createAgent(0, 1, 1, 2), drops = new WorldDrops(w);
  expect(runAgentCommand(w, agent, { op: "destroy", dir: "forward" }, { worldDrop: () => null }).ok).toBe(false); expect(w.getBlock(0, 1, 0)).toBe(F);
  expect(runAgentCommand(w, agent, { op: "destroy", dir: "forward" }, { worldDrop: drops.planSpawnBatch.bind(drops) }).ok).toBe(true);
  expect(w.getBlock(0, 1, 0)).toBe(AIR); expect(drops.records.map(r => r.stack)).toEqual([stack()]); expect(agent.slots.every(s => s === null)).toBe(true);
});

it("swept projectiles hit the fence upper extension and preserve nearest block-before-mob ties", () => {
  const blocks = new Map<string, number>([["0,10,0", F]]); const w = { getLoadedBlock: (x: number, y: number, z: number) => blocks.get(`${x},${y},${z}`) ?? AIR };
  const shots = new SnowballProjectiles(w); shots.spawn({ x: -1, y: 11.25, z: .5 }, { x: 1, y: 0, z: 0 });
  const hit = shots.update(.1, [{ id: 1, box: { minX: .375, maxX: .625, minY: 10, maxY: 12, minZ: .375, maxZ: .625 } }])[0];
  expect(hit.kind).toBe("block"); expect(hit.position.x).toBeCloseTo(.25); expect(shots.records).toEqual([]);
  const gap = new SnowballProjectiles(w); gap.spawn({ x: -1, y: 11.25, z: .1 }, { x: 1, y: 0, z: 0 }); expect(gap.update(.1)).toEqual([]); expect(gap.records[0].position.x).toBeCloseTo(2);
});

it("unloaded possible extended geometry freezes the complete projectile owner without ghost impacts or generation", () => {
  let loaded = false, reads = 0;
  const w = { getLoadedBlock: (_x: number, y: number, _z: number) => { reads++; return !loaded && y === 10 ? undefined : AIR; } };
  const shots = new SnowballProjectiles(w); shots.spawn({ x: .5, y: 11.25, z: .5 }, { x: 1, y: 0, z: 0 }); const before = shots.toJSON();
  expect(shots.update(.1)).toEqual([]); expect(shots.toJSON()).toEqual(before); expect(reads).toBeLessThan(100);
  loaded = true; expect(shots.update(.1)).toEqual([]); expect(shots.records[0].position.x).toBeCloseTo(3.5); expect(shots.records[0].ageSeconds).toBeCloseTo(.1);
  loaded = false; const clear = new SnowballProjectiles(w); clear.spawn({ x: .5, y: 11.75, z: .5 }, { x: 1, y: 0, z: 0 });
  expect(clear.update(.01)).toEqual([]); expect(clear.records[0].ageSeconds).toBeCloseTo(.01); // Unknown below cannot reach this segment.
});

it("integer hostile spawn cannot use air above a fence as a full cube support", () => {
  const w = terrain(); w.setBlock(0, 1, 0, F);
  expect(canHostileSpawn(w.getBlock.bind(w), () => 0, 0, 2, 0, 11, 0)).toBe(false);
});

it("known fence contact beside unloaded neighbors pauses ownership until its connection shape is known", () => {
  let loaded = false;
  const w = { getLoadedBlock: (x: number, y: number, z: number) => x === 0 && y === 10 && z === 0 ? F : !loaded && x === 1 && y === 10 && z === 0 ? undefined : AIR };
  const shots = new SnowballProjectiles(w); shots.spawn({ x: .5, y: 11.25, z: .5 }, { x: 0, y: 0, z: 1 }); const before = shots.toJSON();
  expect(shots.update(.1)).toEqual([]); expect(shots.toJSON()).toEqual(before);
  loaded = true; expect(shots.update(.1)[0].kind).toBe("block"); expect(shots.records).toEqual([]);
});
