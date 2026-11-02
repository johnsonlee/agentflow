import { ITEMS } from "./items";
import { BLOCKS } from "./blocks";
import type { MobKind } from "./entities";
import type { GameMode } from "./rules";

export type Command =
  | { type: "gamemode"; mode: GameMode }
  | { type: "time"; timeOfDay: number }
  | { type: "tp"; x: number; y: number; z: number; relative: [boolean, boolean, boolean] }
  | { type: "give"; id: number; count: number }
  | { type: "summon"; kind: MobKind; name?: string }
  | { type: "gamerule"; rule: "doMobSpawning" | "doDaylightCycle"; value: boolean }
  | { type: "seed" }
  | { type: "agent"; action: "tp" }
  | { type: "code"; command: string }
  | { type: "help" }
  | { type: "error"; message: string };

/** Minecraft ticks per day; tick 0 is sunrise. */
const TICKS_PER_DAY = 24000;
const NAMED_TIMES: Record<string, number> = { day: 1000, noon: 6000, sunset: 12000, night: 13000, midnight: 18000, sunrise: 23000 };

export const COMMAND_HELP = [
  "/gamemode <creative|survival>",
  "/time set <day|noon|night|midnight|ticks>",
  "/tp <x> <y> <z>  (~ for relative)",
  "/give <block|item> [count]",
  "/summon <pig|sheep|chicken|zombie|npc> [name]",
  "/gamerule <doMobSpawning|doDaylightCycle> <true|false>",
  "/seed",
  "/agent tp  (bring your Agent to you)",
  "/code <name>  (run a Code Builder program by its chat command)",
];

/** Parses a slash command typed into chat (a subset of Minecraft's commands). */
export function parseCommand(input: string): Command {
  const parts = input.trim().replace(/^\//, "").split(/\s+/).filter(Boolean);
  const [name, ...args] = parts;
  switch (name?.toLowerCase()) {
    case "gamemode":
    case "gm": {
      const mode = ({ creative: "creative", c: "creative", "1": "creative", survival: "survival", s: "survival", "0": "survival" } as const)[
        (args[0] ?? "").toLowerCase() as "creative"
      ];
      return mode ? { type: "gamemode", mode } : { type: "error", message: "Usage: /gamemode <creative|survival>" };
    }
    case "time": {
      if (args[0] !== "set" || args[1] === undefined) return { type: "error", message: "Usage: /time set <day|night|ticks>" };
      const named = args[1].toLowerCase();
      const ticks = Object.prototype.hasOwnProperty.call(NAMED_TIMES, named) ? NAMED_TIMES[named] : Number(args[1]);
      if (!Number.isFinite(ticks)) return { type: "error", message: `Invalid time "${args[1]}"` };
      return { type: "time", timeOfDay: (((ticks % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY) / TICKS_PER_DAY };
    }
    case "tp":
    case "teleport": {
      if (args.length !== 3) return { type: "error", message: "Usage: /tp <x> <y> <z>" };
      const relative = args.map((a) => a.startsWith("~")) as [boolean, boolean, boolean];
      const values = args.map((a) => (a.startsWith("~") ? Number(a.slice(1) || "0") : Number(a)));
      if (values.some((v) => !Number.isFinite(v))) return { type: "error", message: "Coordinates must be numbers" };
      return { type: "tp", x: values[0], y: values[1], z: values[2], relative };
    }
    case "give": {
      const blockName = (args[0] ?? "").toLowerCase().replace(/^minecraft:/, "");
      const def = BLOCKS.find((b) => b.name === blockName && b.creative) ?? ITEMS.find((i) => i.name === blockName);
      if (!def) return { type: "error", message: `Unknown block or item "${args[0] ?? ""}"` };
      const count = args[1] === undefined ? 1 : Number(args[1]);
      if (!Number.isInteger(count) || count < 1 || count > 2304) return { type: "error", message: "Count must be 1-2304" };
      return { type: "give", id: def.id, count };
    }
    case "agent":
      if (args[0] === undefined || args[0] === "tp" || args[0] === "summon") return { type: "agent", action: "tp" };
      return { type: "error", message: "Usage: /agent tp" };
    case "code":
      if (!args[0]) return { type: "error", message: "Usage: /code <name>" };
      return { type: "code", command: args[0].toLowerCase() };
    case "summon": {
      const kind = (args[0] ?? "").toLowerCase().replace(/^minecraft:/, "");
      if (kind !== "pig" && kind !== "sheep" && kind !== "chicken" && kind !== "npc" && kind !== "zombie") {
        return { type: "error", message: "Usage: /summon <pig|sheep|chicken|zombie|npc> [name]" };
      }
      const name = args.slice(1).join(" ").trim();
      return name ? { type: "summon", kind, name } : { type: "summon", kind };
    }
    case "gamerule": {
      const rule = args[0] === "doMobSpawning" || args[0] === "doDaylightCycle" ? args[0] : null;
      const value = args[1] === "true" ? true : args[1] === "false" ? false : null;
      if (!rule || value === null) return { type: "error", message: "Usage: /gamerule <doMobSpawning|doDaylightCycle> <true|false>" };
      return { type: "gamerule", rule, value };
    }
    case "seed":
      return { type: "seed" };
    case "help":
    case "?":
      return { type: "help" };
    default:
      return { type: "error", message: `Unknown command "${name ?? ""}". Type /help` };
  }
}
