import { expect, it } from "vitest";
import { AGENT_SLOTS, Inventory, World, createAgent, giveAgent, parseSave, runAgentCommand, sanitizeAgent,
  serializeSave, stackId, type ItemStack } from "../src";

it("preserves worn armor, tools and authored books through Agent transfer, save and drop", () => {
  const agent = createAgent(0, 60, 0);
  const stacks: ItemStack[] = [
    { id: stackId("iron_chestplate"), count: 1, damage: 38 },
    { id: stackId("iron_chestplate"), count: 1, damage: 19 },
    { id: stackId("diamond_pickaxe"), count: 1, damage: 123 },
    { id: stackId("written_book"), count: 1, book: { pages: ["A preserved page"], title: "Notes", author: "Builder" } },
  ];
  for (const stack of stacks) expect(giveAgent(agent, stack)).toBe(0);
  expect(agent.slots.slice(0, 4)).toEqual(stacks);
  // Agent owns detached copies, including nested book pages.
  expect(agent.slots[0]).not.toBe(stacks[0]);
  expect(agent.slots[3]!.book!.pages).not.toBe(stacks[3].book!.pages);
  const save = parseSave(serializeSave({ name: "transfer", seed: 5, mode: "survival", timeOfDay: .3,
    player: { position: { x: 0, y: 60, z: 0 }, yaw: 0, pitch: 0, flying: false },
    inventory: new Inventory().toJSON(), edits: [], agent }));
  const restored = sanitizeAgent(save.agent)!;
  expect(restored.slots.slice(0, 4)).toEqual(stacks);
  const bag = new Inventory();
  const world = new World(5);
  for (let slot = 0; slot < stacks.length; slot++) {
    expect(runAgentCommand(world, restored, { op: "drop", slot }, { giveToPlayer: (s) => bag.addStack(s) }).ok).toBe(true);
    expect(restored.slots[slot]).toBeNull();
  }
  expect(bag.slots.slice(0, 4)).toEqual(stacks);
});

it("keeps legacy bulk transfers while respecting one-item armor limits and full inventories", () => {
  const agent = createAgent(0, 60, 0);
  const stone = stackId("stone");
  expect(giveAgent(agent, stone, 130)).toBe(0);
  expect(agent.slots.slice(0, 3)).toEqual([{ id: stone, count: 64 }, { id: stone, count: 64 }, { id: stone, count: 2 }]);
  const armor = { id: stackId("diamond_boots"), count: 30, damage: 7 };
  expect(giveAgent(agent, armor)).toBe(6);
  expect(agent.slots.slice(3)).toHaveLength(AGENT_SLOTS - 3);
  expect(agent.slots.slice(3).every((s) => s!.count === 1 && s!.damage === 7)).toBe(true);
  const before = structuredClone(agent);
  expect(giveAgent(agent, { ...armor, count: 1 })).toBe(1);
  expect(agent).toEqual(before);
  const bag = new Inventory();
  for (let i = 0; i < 36; i++) bag.setSlot(i, { id: stone, count: 64 });
  expect(runAgentCommand(new World(5), agent, { op: "drop", slot: 3 }, { giveToPlayer: (s) => bag.addStack(s) }).ok).toBe(true);
  expect(agent).toEqual(before);
});
