import { withLegacyBirchRecipes } from "./helpers/legacy-birch-recipes";
import baseline from "./fixtures/spider-eye-8e4c66c.json";
import { describe, expect, it } from "vitest";
import { Inventory, POISON, ITEMS, BLOCKS, RECIPES, allAtlasTextureNames, createHunger, createMob, createPlayerStatus, applyPoison, clearPlayerStatus, tickPlayerStatus, sanitizePlayerStatus,
  finishMeal, mobDrops, MobLootResolver, mobSnapshot, sanitizeMobState, parseSave, serializeSave, stackId } from "../src/index";
const at = { x: 0, y: 1, z: 0 };
const eye = (count = 1) => ({ id: stackId("spider_eye"), count });
const base = { name: "poison", seed: 1, mode: "survival" as const, timeOfDay: .2, player: { position: at, yaw: 0, pitch: 0, flying: false }, inventory: { slots: [], selected: 0 }, edits: [] };

describe("player-conditional Spider Eye acquisition", () => {
  it("preserves every inherited catalog and recipe prefix exactly", () => {
    expect(JSON.parse(JSON.stringify(ITEMS.slice(0,573)))).toEqual(baseline.items);
    expect(JSON.parse(JSON.stringify(BLOCKS.slice(0,308)))).toEqual(baseline.blocks);
    expect(JSON.parse(JSON.stringify(withLegacyBirchRecipes(RECIPES.slice(0,165))))).toEqual(baseline.recipes);
    expect(allAtlasTextureNames().slice(0,859)).toEqual(baseline.names);
    expect([ITEMS.length, BLOCKS.length, RECIPES.length, allAtlasTextureNames().length]).toEqual([594, 322, 171, 893]);
  });
  it("appends ID829 and samples String before the eligible Eye pool only", () => {
    expect(ITEMS[573]).toMatchObject({ id: 829, name: "spider_eye", food: { hunger: 2, saturation: 3.2 } });
    for (const cause of ["agent", "environment"] as const) {
      let calls = 0; expect(mobDrops("spider", () => { calls++; return 1; }, cause)).toEqual([{ id: stackId("string"), count: 2 }]); expect(calls).toBe(1);
    }
    const rolls = [0, 1]; expect(mobDrops("spider", () => rolls.shift()!, "player")).toEqual([eye()]); expect(rolls).toHaveLength(0);
    expect(mobDrops("spider", () => 0, "player")).toEqual([]);
    expect(mobDrops("spider", () => 1, "player")).toEqual([{ id: stackId("string"), count: 2 }, eye()]);
  });
  it("freezes first attribution and roll across refused delivery, reload and later Agent retry", () => {
    let draws = 0; const resolver = new MobLootResolver(() => { draws++; return 1; }); const spider = createMob(1, "spider", at);
    expect(resolver.tryDrop(spider, () => null, at, "player")).toBe(false); expect(draws).toBe(2);
    expect(resolver.exportPendingCause(spider)).toBe("player");
    const snapshot = mobSnapshot(spider, resolver.exportPending(spider), resolver.exportPendingCause(spider));
    const clean = sanitizeMobState({ nextId: 2, records: [snapshot] }); expect(clean.invalid).toBe(0);
    const restored = createMob(1, "spider", at), next = new MobLootResolver(() => { throw new Error("no reroll"); });
    expect(next.restorePending(restored, clean.data.records[0].pendingLoot, clean.data.records[0].pendingLootCause)).toBe(true);
    let received: unknown;
    expect(next.tryDrop(restored, stacks => { received = stacks; return { commit: () => true }; }, at, "agent")).toBe(true);
    expect(received).toEqual([{ id: stackId("string"), count: 2 }, eye()]); expect(next.exportPending(restored)).toBeUndefined();
  });
  it("does not upgrade a refused environment roll into a player Eye roll", () => {
    let draws = 0; const resolver = new MobLootResolver(() => { draws++; return 1; }), spider = createMob(3,"spider",at);
    expect(resolver.tryDrop(spider,()=>null,at,"environment")).toBe(false);
    expect(resolver.exportPendingCause(spider)).toBe("environment");
    let batch: unknown;
    expect(resolver.tryDrop(spider,stacks=>{batch=stacks;return {commit:()=>true};},at,"player")).toBe(true);
    expect(batch).toEqual([{id:stackId("string"),count:2}]); expect(draws).toBe(1);
    expect(resolver.tryDrop(spider,()=>{throw new Error("duplicate");},at,"player")).toBe(true); expect(draws).toBe(1);
  });
  it("preserves legacy pending empty/base batches and rejects unproven/corrupt Eye ownership", () => {
    const spider = createMob(2, "spider", at), resolver = new MobLootResolver(() => { throw new Error("legacy pending cannot reroll"); });
    expect(resolver.restorePending(spider, [])).toBe(true); expect(resolver.exportPendingCause(spider)).toBeUndefined();
    expect(resolver.tryDrop(spider, () => ({ commit: () => true }), at, "player")).toBe(true);
    for (const cause of [undefined, "agent", "environment", "unknown", null]) {
      const raw = { ...mobSnapshot(spider), pendingLoot: [eye()], ...(cause === undefined ? {} : { pendingLootCause: cause }) };
      expect(sanitizeMobState({ nextId: 3, records: [raw] }).invalid).toBe(1);
    }
    expect(sanitizeMobState({ nextId: 3, records: [{ ...mobSnapshot(spider), pendingLootCause: "player" }] }).invalid).toBe(1);
    expect(sanitizeMobState({ nextId: 3, records: [{ ...mobSnapshot(spider), pendingLoot: [], pendingLootCause: "player" }] }).invalid).toBe(0);
  });
});

describe("atomic meal and bounded genuine Poison status", () => {
  const setup = () => { const inventory = new Inventory(), hunger = createHunger(), status = createPlayerStatus(); hunger.food = 14; inventory.slots[0] = eye(2); return { inventory, hunger, status }; };
  it("finishes one owned meal, restores food/saturation and creates actual timed poison", () => {
    const { inventory, hunger, status } = setup(); expect(finishMeal(inventory, hunger, status)).toBe(true);
    expect(inventory.selectedStack()).toEqual(eye()); expect(hunger.food).toBe(16); expect(hunger.saturation).toBe(8.2); expect(status.poison).toEqual({ remaining: 5, elapsed: 0 });
    expect(tickPlayerStatus(status, 1.25, 20)).toBe(-1); expect(status.poison).toEqual({ remaining: 3.75, elapsed: 0 });
    tickPlayerStatus(status, .5, 19); expect(finishMeal(inventory, hunger, status)).toBe(true); expect(inventory.selectedStack()).toBeNull(); expect(status.poison).toEqual({ remaining: 5, elapsed: .5 });
    expect(tickPlayerStatus(status, .75, 19)).toBe(-1);
  });
  it("refuses full food, malformed or absent source owners with no side effects", () => {
    for (const raw of [null, eye(0), eye(-1), eye(65), eye(NaN), { ...eye(), glow: { state: "active" } }, { ...eye(), book: { pages: [] } }, { ...eye(), damage: 1 }]) {
      const { inventory, hunger, status } = setup(); inventory.slots[0] = raw as never; const before = structuredClone({ slots: inventory.slots, hunger, status });
      expect(finishMeal(inventory, hunger, status)).toBe(false); expect({ slots: inventory.slots, hunger, status }).toEqual(before);
    }
    const { inventory, hunger, status } = setup(); hunger.food = 20; const before = structuredClone({ slots: inventory.slots, hunger, status });
    expect(finishMeal(inventory, hunger, status)).toBe(false); expect({ slots: inventory.slots, hunger, status }).toEqual(before);
  });
  it("refuses malformed hunger/status without debiting the meal or repairing poison", () => {
    const { inventory, hunger, status } = setup();
    (status as unknown as { poison: null }).poison = null;
    const before = structuredClone({ slots: inventory.slots, hunger, status });
    expect(finishMeal(inventory, hunger, status)).toBe(false); expect({ slots: inventory.slots, hunger, status }).toEqual(before);
    delete status.poison; hunger.exhaustion = Infinity;
    const before2 = structuredClone({ slots: inventory.slots, hunger, status });
    expect(finishMeal(inventory, hunger, status)).toBe(false); expect({ slots: inventory.slots, hunger, status }).toEqual(before2);
  });
  it("retains ordinary food/risky exhaustion and refuses callback-directed source changes", () => {
    const { inventory, hunger, status } = setup(); inventory.slots[0] = { id: stackId("bread"), count: 2 };
    expect(finishMeal(inventory, hunger, status)).toBe(true); expect(hunger.food).toBe(19); expect(status).toEqual({});
    hunger.food = 10; hunger.saturation = 5; inventory.slots[0] = { id: stackId("rotten_flesh"), count: 2 };
    expect(finishMeal(inventory, hunger, status, () => 0)).toBe(true); expect(hunger.exhaustion).toBe(3);
    const prior = { ...hunger }; expect(finishMeal(inventory, hunger, status, () => { inventory.selected = 1; return 0; })).toBe(false);
    expect(hunger).toEqual(prior); expect(inventory.slots[0]?.count).toBe(1); expect(status).toEqual({});
  });
  it("advances finite active time only, expires consistently and never kills", () => {
    const once = createPlayerStatus(), split = createPlayerStatus(); applyPoison(once); applyPoison(split);
    let health = 20; for (let i = 0; i < 50; i++) health += tickPlayerStatus(split, .1, health);
    expect(20 + tickPlayerStatus(once, 5, 20)).toBe(health); expect(health).toBe(16); expect(once).toEqual({}); expect(split).toEqual({});
    applyPoison(once); expect(tickPlayerStatus(once, 1, 1)).toBe(0); expect(tickPlayerStatus(once, 1000000, 2)).toBe(-1); expect(once).toEqual({});
    applyPoison(once); expect(tickPlayerStatus(once, 1.25, 20, false)).toBe(0); expect(once.poison?.remaining).toBe(3.75);
    const before = structuredClone(once); for (const dt of [0, -1, NaN, Infinity]) expect(tickPlayerStatus(once, dt, 20)).toBe(0); expect(once).toEqual(before);
    clearPlayerStatus(once); expect(once).toEqual({}); expect(POISON.interval).toBe(1.25);
  });
  it("retains fractional active-time phase across partitioned ticks and cold reload", () => {
    const once=createPlayerStatus(), split=createPlayerStatus(); applyPoison(once); applyPoison(split);
    const delta=tickPlayerStatus(once,3.3,20); let health=20;
    for(let i=0;i<33;i++) health+=tickPlayerStatus(split,.1,health);
    expect(20+delta).toBe(health); expect(split.poison?.remaining).toBeCloseTo(once.poison!.remaining,10); expect(split.poison?.elapsed).toBeCloseTo(once.poison!.elapsed,10);
    const restored=parseSave(serializeSave({...base,playerStatus:once})).playerStatus!;
    expect(restored).toEqual(once); expect(tickPlayerStatus(restored,.45,health)).toBe(-1); expect(tickPlayerStatus(once,.45,health)).toBe(-1); expect(restored).toEqual(once);
  });
  it("strictly diagnoses raw malformed status and preserves exact cold phase while omitting empty owners", () => {
    const status = createPlayerStatus(); applyPoison(status); tickPlayerStatus(status, .7, 20);
    const saved = serializeSave({ ...base, playerStatus: status }); expect(parseSave(saved).playerStatus).toEqual(status);
    expect(JSON.parse(serializeSave({ ...base, playerStatus: {} })).playerStatus).toBeUndefined(); expect(parseSave(serializeSave(base)).playerStatus).toBeUndefined();
    for (const raw of [null, [], { poison: null }, { poison: { remaining: 0, elapsed: 0 } }, { poison: { remaining: 6, elapsed: 0 } }, { poison: { remaining: 1, elapsed: 1.25 } }, { poison: { remaining: 1, elapsed: -1 } }, { poison: { remaining: 1, elapsed: NaN } }, { poison: { remaining: 1, elapsed: 0, other: 1 } }, { other: 1 }]) {
      expect(sanitizePlayerStatus(raw).invalid).toBe(1); const parsed = parseSave(JSON.stringify({ version: 1, ...base, playerStatus: raw }));
      expect(parsed.playerStatusInvalid).toBe(true); expect(parsed.playerStatus).toBeUndefined();
      expect(() => serializeSave({ ...base, playerStatus: raw as never })).toThrow();
    }
    expect(parseSave(JSON.stringify({ version: 1, ...base, playerStatusInvalid: true })).playerStatusInvalid).toBeUndefined();
    const throwing = Object.defineProperty({}, "poison", { enumerable: true, get() { throw new Error("bad getter"); } });
    expect(sanitizePlayerStatus(throwing).invalid).toBe(1);
  });
});
