import { describe, expect, it } from "vitest";
import {
  Inventory, WORLD_BORDER, World, boxCollides, bodyBox, clampPosition, createAgent, createMob, createPlayerBody, itemId, moveAxis, parseCommand,
  parseSave, runAgentCommand, sanitizeAgent, sanitizeFurnaces, sanitizeStack, stepMob, stepPlayer, toolOf,
} from "../src";

// Review 7372276b: huge coordinates froze block loops (x++ stops changing x beyond ~9e15).
const EXTREMES = [1e16, -1e16, 1e308, -1e308, Number.MAX_VALUE, Infinity, -Infinity, NaN, 2 ** 53, 9.007199254740993e15];

describe("world border and /tp", () => {
  it("/tp refuses non-finite and out-of-border coordinates", () => {
    for (const v of ["1e16", "-1e16", "1e308", "NaN", "Infinity", "-Infinity", "30000001"]) {
      const r = parseCommand(`/tp ${v} 80 0`);
      expect(r.type, v).toBe("error");
      expect(parseCommand(`/tp 0 80 ${v}`).type, v).toBe("error");
    }
    expect(parseCommand("/tp 0 1e9 0")).toEqual({ type: "error", message: "Height is out of range" });
    expect(parseCommand("/tp ~1e16 80 ~")).toMatchObject({ type: "error" });
    expect(parseCommand("/tp 30000000 80 -30000000")).toMatchObject({ type: "tp", x: 30000000, z: -30000000 });
    // A relative offset within range may still land past the border: the game clamps (clampPosition).
    expect(parseCommand("/tp ~50000000 80 ~")).toMatchObject({ type: "tp", relative: [true, false, true] });
    expect(clampPosition({ x: 29999999 + 50000000, y: 80, z: -1e9 })).toEqual({ x: WORLD_BORDER, y: 80, z: -WORLD_BORDER });
    expect(clampPosition({ x: NaN, y: NaN, z: Infinity })).toEqual({ x: 0, y: 512, z: WORLD_BORDER });
  });

  it("saves with huge, NaN or Infinity numbers load inside the world", () => {
    const base = { version: 1, name: "w", seed: 1, mode: "creative", inventory: { slots: [], selected: 0 }, edits: [] };
    for (const v of EXTREMES) {
      const text = JSON.stringify({ ...base, timeOfDay: v, player: { position: { x: v, y: v, z: v }, yaw: v, pitch: v, flying: false } })
        .replace(/null/g, "1e999"); // JSON has no NaN/Infinity: they arrive as null, or as overflowing literals
      const s = parseSave(text);
      expect(Number.isFinite(s.timeOfDay) && s.timeOfDay >= 0 && s.timeOfDay < 1, String(v)).toBe(true);
      if (s.player.position) {
        expect(Math.abs(s.player.position.x) <= WORLD_BORDER && Math.abs(s.player.position.z) <= WORLD_BORDER, String(v)).toBe(true);
      }
      expect(Number.isFinite(s.player.yaw) && Number.isFinite(s.player.pitch), String(v)).toBe(true);
    }
    const huge = parseSave(JSON.stringify({ ...base, timeOfDay: 0, player: { position: { x: 1e16, y: 80, z: -1e16 }, yaw: 0, pitch: 0, flying: false } }));
    expect(huge.player.position).toEqual({ x: WORLD_BORDER, y: 80, z: -WORLD_BORDER });
    expect(parseSave(JSON.stringify({ ...base, seed: 1e20, timeOfDay: 0, player: { position: { x: 0, y: 80, z: 0 }, yaw: 0, pitch: 0, flying: false } })).seed | 0).toBe(
      parseSave(JSON.stringify({ ...base, seed: 1e20, timeOfDay: 0, player: { position: { x: 0, y: 80, z: 0 }, yaw: 0, pitch: 0, flying: false } })).seed,
    );
  });
});

describe("block loops are bounded with extreme inputs", () => {
  const w = new World(1);
  const get = (x: number, y: number, z: number) => w.getBlock(x, y, z);

  it("boxCollides / moveAxis return quickly for any position", () => {
    for (const v of EXTREMES) {
      const t0 = performance.now();
      boxCollides(get, bodyBox({ x: v, y: 60, z: v }));
      boxCollides(get, { minX: -v, minY: 0, minZ: 0, maxX: v, maxY: 1, maxZ: 1 });
      const p = { x: v, y: 60, z: v };
      moveAxis(get, p, "x", 1);
      moveAxis(get, { x: 0, y: 60, z: 0 }, "x", v);
      expect(performance.now() - t0, String(v)).toBeLessThan(50);
    }
  });

  it("player and mob physics stay finite and inside the world from extreme states", () => {
    for (const v of EXTREMES) {
      const t0 = performance.now();
      const body = createPlayerBody({ x: v, y: 60, z: v });
      body.velocity = { x: v, y: v, z: v };
      stepPlayer(get, body, { forward: 1, strafe: 0, jump: true, descend: false, sprint: true }, 0.1);
      const p = body.position;
      expect([p.x, p.y, p.z].every(Number.isFinite), String(v)).toBe(true);
      expect(Math.abs(p.x) <= WORLD_BORDER && Math.abs(p.z) <= WORLD_BORDER, String(v)).toBe(true);
      const mob = createMob(1, "zombie", { x: v, y: 60, z: v });
      stepMob(get, mob, 0.1, () => 0.5, { x: 0, y: 60, z: 0 });
      expect([mob.position.x, mob.position.y, mob.position.z].every(Number.isFinite), String(v)).toBe(true);
      expect(performance.now() - t0, String(v)).toBeLessThan(200);
    }
  });

  it("the Agent stops at the world border, and World ignores out-of-world coordinates", () => {
    const a = createAgent(WORLD_BORDER, 60, 0, 3); // facing +X, at the border
    expect(runAgentCommand(w, a, { op: "move", dir: "forward" })).toEqual({ ok: false, message: "That's beyond the world border" });
    for (const v of EXTREMES) {
      expect(w.getBlock(v, 60, v), String(v)).toBe(0);
      expect(() => w.setBlock(v, 60, v, 1), String(v)).not.toThrow();
    }
    expect(sanitizeAgent({ x: 1e16, y: 60, z: 0, facing: 0, selected: 0, slots: [] })).toBeNull();
  });
});

describe("stack counts and tool damage are strict integers", () => {
  const pick = itemId("wooden_pickaxe");
  const max = toolOf(pick)!.durability;

  it("damage must be an integer in 1..durability-1; counts 1..stack max", () => {
    expect(sanitizeStack({ id: pick, count: 1, damage: 5 })).toEqual({ id: pick, count: 1, damage: 5 });
    for (const damage of ["5", -1, 0, 1.5, max, max + 10, NaN, Infinity, "__proto__", null, {}]) {
      expect(sanitizeStack({ id: pick, count: 1, damage }), String(damage)).toEqual({ id: pick, count: 1 });
    }
    for (const count of [0, -1, 1.5, 65, "3", NaN, Infinity, 2]) {
      const s = sanitizeStack({ id: 1, count });
      if (count === 2) expect(s).toEqual({ id: 1, count: 2 });
      else expect(s, String(count)).toBeNull();
    }
    expect(sanitizeStack({ id: pick, count: 2 })).toBeNull(); // tools stack to 1
  });

  it("fuzz: inventory, Agent and furnace slots only ever hold valid stacks", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const values: unknown[] = [-1, 0, 1, 2, 63, 64, 65, 1.5, 1e9, NaN, Infinity, "1", null, pick, 300, max - 1, max];
    const pickv = () => values[Math.floor(rnd() * values.length)];
    const valid = (s: unknown) => {
      if (s === null) return true;
      const st = s as { id: number; count: number; damage?: number };
      const tool = toolOf(st.id);
      return Number.isInteger(st.count) && st.count >= 1 && st.count <= (tool ? 1 : 64) &&
        (st.damage === undefined || (Number.isInteger(st.damage) && st.damage >= 1 && tool !== null && st.damage < tool.durability));
    };
    for (let i = 0; i < 2000; i++) {
      const raw = { id: pickv(), count: pickv(), damage: pickv() };
      const inv = Inventory.fromJSON({ slots: [raw as never], selected: 0 });
      expect(valid(inv.slots[0]), JSON.stringify(raw)).toBe(true);
      const agent = sanitizeAgent({ x: 0, y: 60, z: 0, facing: 0, selected: 0, slots: [raw] });
      expect(valid(agent!.slots[0]), JSON.stringify(raw)).toBe(true);
      const f = sanitizeFurnaces([{ x: 0, y: 1, z: 0, state: { input: raw, fuel: raw, output: raw, burnLeft: 0, burnTotal: 0, progress: 0 } }]);
      for (const s of [f.furnaces[0].state.input, f.furnaces[0].state.fuel, f.furnaces[0].state.output]) expect(valid(s)).toBe(true);
    }
  });
});
