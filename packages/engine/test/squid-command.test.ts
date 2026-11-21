import { describe, expect, it } from "vitest";
import { COMMAND_HELP, parseCommand } from "../src/automation/commands";

describe("adult ordinary squid summon command", () => {
  it("accepts ordinary and namespaced squid with names", () => {
    expect(parseCommand("/summon squid")).toEqual({ type: "summon", kind: "squid" });
    expect(parseCommand("/summon minecraft:SQUID Inky Friend")).toEqual({ type: "summon", kind: "squid", name: "Inky Friend" });
  });
  it("keeps unsupported glow squid refused and advertises the actual added kind", () => {
    expect(parseCommand("/summon glow_squid").type).toBe("error");
    expect(COMMAND_HELP.join(" ")).toContain("spider|squid|npc");
    expect(parseCommand("/summon")).toEqual({ type: "error", message: "Usage: /summon <pig|sheep|chicken|zombie|spider|squid|npc> [name]" });
  });
});
