import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { inspectWorldSaveImport, MAX_WORLD_SAVE_BYTES, MAX_WORLD_SAVE_DEPTH } from "../src/persistence/world-save-import";
import { DIMENSION_WORLD_KEYS } from "../src/persistence/dimension-world";
import { parseSave } from "../src/persistence/save";
import { Inventory } from "../src/ownership/inventory";
import { stackId } from "../src/catalog/items";
import { emptyCodeWorkspace } from "../src/persistence/code-workspace";
import { createMob } from "../src/simulation/entities";
import { mobSnapshot } from "../src/persistence/mob-save";

// Genuine UI SaveQuit segment002, published397, SHA256 c1eb0af9412ef0a580f32b49b02d9b9c41482ca252bff3f1de32a115a1e87c97.
// Validation input only: tests do not claim a fresh natural-acquisition/browser run.
const original = readFileSync(new URL("./fixtures/world-save-import-v1.json", import.meta.url), "utf8");
const bytes = (s: string) => new TextEncoder().encode(s);
const fixture = () => JSON.parse(original);
const inspect = (data: unknown) => inspectWorldSaveImport(bytes(JSON.stringify(data)));
const broken = (mutate: (data: ReturnType<typeof fixture>) => void) => { const data = fixture(); mutate(data); return data; };

describe("explicit raw-preserving current application backup contract", () => {
  it("accepts the actual segment without rewriting any selected bytes or starting a game", () => {
    const selected = ` \n${original}\n `, result = inspectWorldSaveImport(bytes(selected));
    expect(result).toEqual({ raw: selected, name: "My World", mode: "survival", seed: 2468, bytes: bytes(selected).length });
    expect(Object.isFrozen(result)).toBe(true);
  });
  it("retains finite wrapped yaw exactly in the chosen bytes; ordinary Continue alone wraps orientation", () => {
    const data = fixture(); data.player.yaw = Math.PI * 8 + .5;
    const result = inspect(data); expect(JSON.parse(result.raw).player.yaw).toBe(data.player.yaw);
  });
  it.each([
    ["missing field", (x: any) => { delete x.inventory; }],
    ["unknown root owner", (x: any) => { x.futureInventory = [{ id: 6, count: 3 }]; }],
    ["foreign version", (x: any) => { x.version = 2; }],
    ["fractional seed", (x: any) => { x.seed = 2.5; }],
    ["blank name", (x: any) => { x.name = " "; }],
    ["truncated name", (x: any) => { x.name = "a".repeat(65); }],
    ["repaired mode", (x: any) => { x.mode = "adventure"; }],
    ["wrapped time", (x: any) => { x.timeOfDay = 2; }],
    ["clamped player", (x: any) => { x.player.position.x = 1e8; }],
    ["repaired pitch", (x: any) => { x.player.pitch = 2; }],
    ["unknown player field", (x: any) => { x.player.cargo = [6]; }],
    ["extra inventory slot", (x: any) => { x.inventory.slots.push({ id: 6, count: 3 }); }],
    ["invalid ordinary owned ID", (x: any) => { x.inventory.slots[5] = { id: 999999, count: 1 }; }],
    ["repaired tool wear", (x: any) => { x.inventory.slots[5] = { id: 772, count: 1, damage: 999999 }; }],
    ["truncated pending cargo", (x: any) => { x.inventoryPending = Array.from({ length: 11 }, () => ({ id: 6, count: 1 })); }],
    ["extra Agent cargo", (x: any) => { x.agent.slots.push({ id: 6, count: 2 }); }],
    ["repaired Agent", (x: any) => { x.agent.facing = 8; }],
    ["malformed program", (x: any) => { x.programs = [{ name: "bad", body: [{ op: "invented" }] }]; }],
    ["malformed health", (x: any) => { x.playerState.health = -1; }],
    ["repaired hunger", (x: any) => { x.hunger.food = 40; }],
    ["repaired game rule", (x: any) => { x.gamerules.keepInventory = "true"; }],
    ["dropped creature", (x: any) => { x.mobs.records.push({ id: 999, kind: "unknown" }); }],
    ["dropped world item", (x: any) => { x.worldDrops.records.push({ key: 999, stack: { id: 6, count: 999 } }); }],
    ["invalid new NPC actions", (x: any) => { x.npcs = [{ x: 0, y: 50, z: 0, yaw: 0, name: "Guide", dialogue: "", npcActions: null }]; }],
    ["invalid source workspace", (x: any) => { x.codeWorkspace = { version: 99 }; }],
    ["invalid dimension envelope", (x: any) => { x.dimensions = null; }],
    ["derived recovery flag on disk", (x: any) => { x.npcActionsInvalid = false; }],
  ])("refuses %s instead of accepting parseSave repairs", (_label, mutate) => {
    expect(() => inspect(broken(mutate as (x: any) => void))).toThrow();
  });
  it("preserves worn equipment, books, global Agent/pending cargo and inert program/source drafts", () => {
    const data = fixture(), bag = new Inventory();
    bag.slots[0] = { id: stackId("iron_pickaxe"), count: 1, damage: 37 };
    bag.slots[1] = { id: stackId("written_book"), count: 1, book: { pages: ["Owned page"], title: "Notes", author: "Learner" } };
    bag.equipment.head = { id: stackId("iron_helmet"), count: 1, damage: 9 };
    data.inventory = bag.toJSON(); data.inventoryPending = [{ id: 6, count: 2 }]; data.agent.slots[0] = { id: 6, count: 3 };
    data.programs = [{ name: "Owned program", trigger: { type: "run" }, blocks: [{ type: "repeat", times: 2, body: [] }] }];
    data.codeWorkspace = emptyCodeWorkspace(); data.codeWorkspace.drafts.javascript = { name: "Unfinished source", source: "not valid JavaScript; preserved as text" };
    data.playerStatus = { weakness: { remaining: 30, amplifier: 1 } };
    const selected = JSON.stringify(data); expect(inspectWorldSaveImport(bytes(selected)).raw).toBe(selected);
  });
  it("accepts validated modern NPCs and their exact legacy action mirror without activating a link", () => {
    const data = fixture(), mob = mobSnapshot(createMob(1, "npc", { x: 2, y: 80, z: 2 }, { name: "Guide", dialogue: "Read", npcActions: { version: 1, buttons: [{ kind: "url", label: "Lesson", url: "https://example.org/lesson" }] } }));
    data.mobs = { nextId: 2, records: [mob] };
    data.npcs = [{ ...mob.position, yaw: mob.yaw, name: mob.name, dialogue: mob.dialogue, npcActions: mob.npcActions }];
    expect(JSON.parse(inspect(data).raw).npcs).toEqual(data.npcs);
    data.npcs[0].npcActions.buttons[0].url = "javascript:bad"; expect(() => inspect(data)).toThrow();
  });
  it("refuses divergent independently-valid modern and legacy NPCs in active and inactive worlds", () => {
    const data = fixture(), legacy = { x: 2, y: 80, z: 2, yaw: 0, name: "Omitted guide", dialogue: "Do not discard me" };
    data.npcs = [legacy]; expect(() => inspect(data)).toThrow(/conflicting NPC/);
    const inactive = Object.fromEntries(DIMENSION_WORLD_KEYS.filter(k => Object.hasOwn(data, k)).map(k => [k, structuredClone(data[k])]));
    data.npcs = []; data.dimensions = { version: 1, active: "overworld", inactive: { nether: { ...inactive, generatorVersion: 1 } }, links: [] };
    expect(() => inspect(data)).toThrow(/conflicting NPC/);
  });
  it("retains a valid pending death owner and refuses live effects a dead player loader would clear", () => {
    const data = fixture(); data.playerState = { health: 0, death: { phase: "pending", position: data.player.position, keepInventory: true } };
    expect(() => inspect(data)).not.toThrow(); data.playerStatus = { weakness: { remaining: 30, amplifier: 0 } }; expect(() => inspect(data)).toThrow();
  });
  it("demonstrates why parseSave success is not import validation", () => {
    const data = broken(x => { x.mode = "unknown"; x.inventory.slots.push({ id: 6, count: 2 }); });
    expect(() => parseSave(JSON.stringify(data))).not.toThrow(); expect(() => inspect(data)).toThrow();
  });
  it("validates actual inactive world owners rather than only active fields", () => {
    const data = fixture();
    const inactive = Object.fromEntries(DIMENSION_WORLD_KEYS.filter(k => Object.hasOwn(data, k)).map(k => [k, structuredClone(data[k])]));
    data.dimensions = { version: 1, active: "overworld", inactive: { nether: { ...inactive, generatorVersion: 1 } }, links: [] };
    expect(() => inspect(data)).not.toThrow();
    data.dimensions.inactive.nether.worldDrops.records[0].stack.count = 999;
    expect(() => inspect(data)).toThrow();
  });
  it.each([original.replace('"seed":2468', '"seed":2468,"se\\u0065d":2468'), original.replace('"count":5', '"count":5,"count":6')])("rejects duplicate decoded fields before native JSON parsing hides them", raw => {
    expect(() => inspectWorldSaveImport(bytes(raw))).toThrow(/duplicate/);
  });
  it("refuses invalid UTF-8, native archives, oversize and excessively nested text", () => {
    expect(() => inspectWorldSaveImport(new Uint8Array([0xc3, 0x28]))).toThrow(/UTF-8/);
    expect(() => inspectWorldSaveImport(bytes("PK\u0003\u0004"))).toThrow();
    expect(() => inspectWorldSaveImport(new Uint8Array(MAX_WORLD_SAVE_BYTES + 1))).toThrow(/8 MiB/);
    expect(() => inspectWorldSaveImport(bytes("[".repeat(MAX_WORLD_SAVE_DEPTH + 2) + "0" + "]".repeat(MAX_WORLD_SAVE_DEPTH + 2)))).toThrow(/depth/);
  });
});
