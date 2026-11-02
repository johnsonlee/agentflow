import { describe, expect, it } from "vitest";
import {
  Inventory, World, createAgent, isKnownId, loadPrograms, parseCommand, parseSave, runAgentCommand, sanitizeAgent, sanitizeChalkboards,
  sanitizeEdits, sanitizeFurnaces, sanitizeHunger, sanitizeNpcs, sanitizePhotos, sanitizeStack, serializeSave, startProgram, validateProgram, type AgentCommand,
} from "../src";

// Review d1dce006: prototype property names as keys must never be accepted or throw.
const PROTO_NAMES = [...Object.getOwnPropertyNames(Object.prototype), "__proto__", "prototype", "__defineGetter__"];
const prog = (cmd: unknown) => ({ name: "p", trigger: { type: "chat", command: "x" }, blocks: [{ type: "command", cmd }] });

/** Builds a JSON-parsed object (so "__proto__" becomes an own key, as it would from a save). */
const fromJson = (o: unknown) => JSON.parse(JSON.stringify(o).replace(/"__PROTO__"/g, '"__proto__"'));

describe("Code Builder validation is total and own-property only", () => {
  it("every Object.prototype name as an op is rejected (never accepted, never throws)", () => {
    for (const op of PROTO_NAMES) {
      const p = fromJson(prog({ op, dir: "forward" }));
      let problems: string[] = [];
      expect(() => (problems = validateProgram(p)), op).not.toThrow();
      expect(problems, op).toEqual([`Unknown command ${op}`]);
      expect(() => loadPrograms([p]), op).not.toThrow();
      expect(loadPrograms([p]).programs, op).toEqual([]);
      expect(startProgram(p), op).toEqual({ error: `Unknown command ${op}` });
    }
  });

  it("prototype names as block types, directions, trigger types and fields are rejected", () => {
    for (const name of PROTO_NAMES) {
      const cases = [
        { name: "p", trigger: { type: "run" }, blocks: [{ type: name }] },
        { name: "p", trigger: { type: "run" }, blocks: [{ type: "if", dir: name, then: [], else: [] }] },
        { name: "p", trigger: { type: name }, blocks: [] },
        { name: "p", trigger: { type: "run" }, blocks: [{ type: "command", cmd: { op: "move", dir: name } }] },
      ];
      for (const c of cases) {
        expect(() => validateProgram(fromJson(c)), name).not.toThrow();
        expect(validateProgram(fromJson(c)).length, name).toBeGreaterThan(0);
      }
    }
    // A literal "__proto__" own key (from JSON) as the cmd object itself.
    const evil = JSON.parse('{"name":"p","trigger":{"type":"run"},"blocks":[{"type":"command","cmd":{"__proto__":{"op":"move","dir":"up"}}}]}');
    expect(validateProgram(evil)).toEqual(["Unknown command undefined"]);
  });

  it("fuzz: random malformed shapes never throw and are never accepted unless well-formed", () => {
    const atoms: unknown[] = [null, undefined, 0, -1, 1.5, NaN, Infinity, "", "x", "forward", "constructor", true, [], {}, [[]], { op: "move" }];
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
    const shape = (d: number): unknown => {
      if (d > 3 || rnd() < 0.3) return pick(atoms);
      const kind = rnd();
      if (kind < 0.3) return Array.from({ length: Math.floor(rnd() * 4) }, () => shape(d + 1));
      const o: Record<string, unknown> = {};
      for (const k of ["name", "trigger", "blocks", "type", "cmd", "op", "dir", "times", "body", "then", "else", "slot", "side", "constructor", "toString"]) {
        if (rnd() < 0.4) o[k] = shape(d + 1);
      }
      return o;
    };
    for (let i = 0; i < 3000; i++) {
      const p = shape(0);
      expect(() => validateProgram(p)).not.toThrow();
      expect(() => loadPrograms([p, p])).not.toThrow();
      expect(() => startProgram(p)).not.toThrow();
    }
  });

  it("the Agent dispatch returns a failure result for anything that isn't a command", () => {
    const w = new World(1);
    const a = createAgent(0, 60, 0);
    for (const op of PROTO_NAMES) {
      const r = runAgentCommand(w, a, { op } as unknown as AgentCommand);
      expect(r, op).toEqual({ ok: false, message: "Unknown command" });
    }
  });
});

describe("save loading is strict and total", () => {
  it("ids and stacks: prototype names are never known ids", () => {
    for (const name of PROTO_NAMES) expect(isKnownId(name as unknown as number), name).toBe(false);
    expect(sanitizeStack({ id: "__proto__", count: 1 })).toBeNull();
    expect(sanitizeStack({ id: 1, count: 1 })).toEqual({ id: 1, count: 1 });
    const inv = Inventory.fromJSON({ slots: [{ id: "constructor", count: 1 }, { id: 1, count: 3 }], selected: 0 });
    expect(inv.slots.slice(0, 2)).toEqual([null, { id: 1, count: 3 }]);
    expect(() => Inventory.fromJSON({ slots: "nope", selected: "x" } as never)).not.toThrow();
  });

  it("chalkboards with a prototype-name size (or bad fields) are dropped", () => {
    const ok = { x: 1, y: 51, z: 2, size: "slate", facing: 0, standing: false, text: "hi", locked: false };
    for (const size of PROTO_NAMES) {
      const r = sanitizeChalkboards(fromJson([{ ...ok, size }, ok]));
      expect(r.boards, size).toEqual([ok]);
      expect(r.dropped, size).toBe(1);
    }
    expect(sanitizeChalkboards([{ ...ok, facing: 7 }]).dropped).toBe(1);
    expect(sanitizeChalkboards("garbage").dropped).toBe(1);
  });

  it("Agent, furnaces, NPCs, hunger and edits: invalid shapes are rejected without throwing", () => {
    const agent = { x: 0, y: 51, z: 0, facing: 2, selected: 0, slots: [{ id: 5, count: 3 }, { id: "__proto__", count: 1 }] };
    expect(sanitizeAgent(agent)?.slots.slice(0, 2)).toEqual([{ id: 5, count: 3 }, null]);
    for (const facing of ["__proto__", "constructor", 4, -1, 1.5]) expect(sanitizeAgent({ ...agent, facing })).toBeNull();
    expect(sanitizeAgent("x")).toBeNull();
    const furnace = { x: 1, y: 2, z: 3, state: { input: { id: "toString", count: 1 }, fuel: null, output: null, burnLeft: 0, burnTotal: 0, progress: 0 } };
    expect(sanitizeFurnaces([furnace]).furnaces[0].state.input).toBeNull();
    expect(sanitizeFurnaces([{ ...furnace, state: "x" }]).dropped).toBe(1);
    expect(sanitizeNpcs([{ x: 0, y: 51, z: 0, yaw: 0, name: "Guide", dialogue: "Hi" }, { x: "a" }, null])).toHaveLength(1);
    expect(sanitizeHunger({ food: 10, saturation: 1, exhaustion: 0, timer: 0 })).toEqual({ food: 10, saturation: 1, exhaustion: 0, timer: 0 });
    expect(sanitizeHunger({ food: "__proto__" })).toBeNull();
    expect(sanitizeEdits([[1, 51, 2, 3], [1, 51, 2, "__proto__"], ["a", 1, 1, 1], "x"])).toEqual([[1, 51, 2, 3]]);
  });

  it("parseSave rejects non-numeric player data; chat commands don't resolve prototype names", () => {
    const base = { name: "w", seed: 1, mode: "creative", timeOfDay: 0, inventory: new Inventory().toJSON(), edits: [] };
    // Non-numeric player data is repaired: no position (the game uses the spawn point).
    expect(parseSave(JSON.stringify({ version: 1, ...base, player: { position: { x: "a", y: 1, z: 1 }, yaw: 0, pitch: 0, flying: false } })).player.position).toBeNull();
    expect(parseSave(serializeSave({ ...base, mode: "creative", player: { position: { x: 0, y: 60, z: 0 }, yaw: 0, pitch: 0, flying: false } })).seed).toBe(1);
    for (const name of ["constructor", "toString", "__proto__", "valueOf"]) {
      expect(parseCommand(`/time set ${name}`), name).toEqual({ type: "error", message: expect.any(String) });
    }
  });
});

describe("review 8d7fc44b: every chat command, the save's top level and the portfolio", () => {
  const COMMANDS = ["gamemode", "gm", "time", "tp", "teleport", "give", "summon", "gamerule", "agent", "code", "seed", "help", "?"];

  it("no chat command accepts a prototype name as an argument (or as the command itself)", () => {
    for (const name of PROTO_NAMES) {
      expect(parseCommand(`/${name}`), name).toEqual({ type: "error", message: `Unknown command "${name}". Type /help` });
      for (const cmd of COMMANDS) {
        for (const args of [[name], ["set", name], [name, name], [name, "1", "1"], ["1", name, "1"]]) {
          const line = `/${cmd} ${args.join(" ")}`;
          let r: ReturnType<typeof parseCommand> | undefined;
          expect(() => (r = parseCommand(line)), line).not.toThrow();
          const parsed = r!;
          if (parsed.type === "gamemode") expect(["creative", "survival"], line).toContain(parsed.mode);
          if (parsed.type === "time") expect(Number.isFinite(parsed.timeOfDay), line).toBe(true);
          if (parsed.type === "give") expect(isKnownId(parsed.id), line).toBe(true);
          if (parsed.type === "summon") expect(["pig", "sheep", "chicken", "npc", "zombie"], line).toContain(parsed.kind);
          if (parsed.type === "gamerule") expect(["doMobSpawning", "doDaylightCycle"], line).toContain(parsed.rule);
          if (parsed.type === "tp") expect([parsed.x, parsed.y, parsed.z].every(Number.isFinite), line).toBe(true);
          // /code takes a free word; it is only ever compared against validated program triggers.
          if (parsed.type === "code") expect(typeof parsed.command, line).toBe("string");
        }
      }
    }
    expect(parseCommand("/gamemode constructor")).toEqual({ type: "error", message: 'Unknown game mode "constructor". Usage: /gamemode <creative|survival>' });
    expect(parseCommand("/gamemode __proto__")).toEqual({ type: "error", message: 'Unknown game mode "__proto__". Usage: /gamemode <creative|survival>' });
    expect(parseCommand("/gamemode")).toEqual({ type: "error", message: "Usage: /gamemode <creative|survival>" });
    expect(parseCommand("/gamemode s")).toEqual({ type: "gamemode", mode: "survival" });
  });

  it("parseSave repairs every top-level field (prototype names, wrong types) and never yields an invalid mode", () => {
    const good = { version: 1, name: "W", seed: 7, mode: "survival", timeOfDay: 0.3,
      player: { position: { x: 1, y: 60, z: 2 }, yaw: 1, pitch: 0.2, flying: true },
      inventory: { slots: [], selected: 3 }, edits: [], gamerules: { doMobSpawning: false, doDaylightCycle: true } };
    const ok = parseSave(JSON.stringify(good));
    expect(ok).toMatchObject({ name: "W", seed: 7, mode: "survival", timeOfDay: 0.3, gamerules: { doMobSpawning: false, doDaylightCycle: true } });
    for (const bad of [...PROTO_NAMES, 42, null, { x: 1 }, [], true, "SURVIVAL"]) {
      const corrupt = fromJson({
        version: 1, seed: 7, name: bad, mode: bad, timeOfDay: bad, gamerules: { doMobSpawning: bad, doDaylightCycle: bad },
        player: { position: { x: bad, y: 60, z: 2 }, yaw: bad, pitch: bad, flying: bad }, inventory: bad, edits: bad,
      });
      let s: ReturnType<typeof parseSave> | undefined;
      expect(() => (s = parseSave(JSON.stringify(corrupt))), String(bad)).not.toThrow();
      expect(s!.mode, String(bad)).toBe("creative");
      expect(typeof s!.name).toBe("string");
      expect(Number.isFinite(s!.timeOfDay)).toBe(true);
      expect(s!.gamerules).toEqual({ doMobSpawning: true, doDaylightCycle: true });
      // (Numbers and booleans are valid position/yaw/pitch/flying values; other kinds must be repaired.)
      if (typeof bad !== "number" && typeof bad !== "boolean") expect(s!.player).toEqual({ position: null, yaw: 0, pitch: 0, flying: false });
      expect(Array.isArray(s!.inventory.slots) && Array.isArray(s!.edits)).toBe(true);
    }
    // Only unusable saves are rejected, with a clear message.
    expect(() => parseSave("{nope")).toThrow("Save is not valid JSON");
    expect(() => parseSave(JSON.stringify({ ...good, version: 2 }))).toThrow(/Unsupported save version/);
    expect(() => parseSave(JSON.stringify({ ...good, seed: "__proto__" }))).toThrow(/seed/);
    expect(() => parseSave("[]")).toThrow(/Malformed/);
  });

  it("portfolio entries from storage are checked strictly", () => {
    const photo = { id: "a1", dataUrl: "data:image/jpeg;base64,AAAA", caption: "Hi", takenAt: "2026-11-02T00:00:00.000Z" };
    expect(sanitizePhotos([photo])).toEqual({ photos: [photo], dropped: 0 });
    for (const name of PROTO_NAMES) {
      const r = sanitizePhotos(fromJson([photo, { ...photo, id: name, dataUrl: name }, { [name]: 1 }]));
      expect(r.photos, name).toEqual([photo]);
      expect(r.dropped, name).toBe(2);
    }
    expect(sanitizePhotos([{ ...photo, dataUrl: "javascript:alert(1)" }]).dropped).toBe(1);
    expect(sanitizePhotos([{ ...photo, caption: 5, takenAt: "never" }]).photos[0]).toMatchObject({ caption: "", takenAt: new Date(0).toISOString() });
    expect(sanitizePhotos("junk")).toEqual({ photos: [], dropped: 1 });
    expect(sanitizePhotos(undefined)).toEqual({ photos: [], dropped: 0 });
  });
});
