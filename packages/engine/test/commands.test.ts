import { describe, expect, it } from "vitest";
import { blockId, parseCommand } from "../src";

describe("chat commands", () => {
  it("parses /gamemode", () => {
    expect(parseCommand("/gamemode creative")).toEqual({ type: "gamemode", mode: "creative" });
    expect(parseCommand("/gamemode 0")).toEqual({ type: "gamemode", mode: "survival" });
    expect(parseCommand("/gamemode hardcore").type).toBe("error");
  });

  it("parses /time set with names and ticks", () => {
    expect(parseCommand("/time set noon")).toEqual({ type: "time", timeOfDay: 0.25 });
    expect(parseCommand("/time set midnight")).toEqual({ type: "time", timeOfDay: 0.75 });
    expect(parseCommand("/time set 30000")).toEqual({ type: "time", timeOfDay: 0.25 });
    expect(parseCommand("/time set later").type).toBe("error");
  });

  it("parses absolute and relative /tp", () => {
    expect(parseCommand("/tp 1 64 -3")).toEqual({ type: "tp", x: 1, y: 64, z: -3, relative: [false, false, false] });
    expect(parseCommand("/tp ~ ~10 ~-2")).toEqual({ type: "tp", x: 0, y: 10, z: -2, relative: [true, true, true] });
    expect(parseCommand("/tp a b c").type).toBe("error");
  });

  it("parses /give with optional namespace and count", () => {
    expect(parseCommand("/give minecraft:glass 16")).toEqual({ type: "give", id: blockId("glass"), count: 16 });
    expect(parseCommand("/give bricks")).toEqual({ type: "give", id: blockId("bricks"), count: 1 });
    expect(parseCommand("/give water").type).toBe("error");
    expect(parseCommand("/give glass 0").type).toBe("error");
  });

  it("parses /summon for animals and Education Edition NPCs", () => {
    expect(parseCommand("/summon pig")).toEqual({ type: "summon", kind: "pig" });
    expect(parseCommand("/summon npc Professor Oak")).toEqual({ type: "summon", kind: "npc", name: "Professor Oak" });
    expect(parseCommand("/summon creeper").type).toBe("error");
  });

  it("handles help, seed and unknown commands", () => {
    expect(parseCommand("/help").type).toBe("help");
    expect(parseCommand("seed").type).toBe("seed");
    expect(parseCommand("/fly").type).toBe("error");
  });
});
