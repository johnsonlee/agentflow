import { BLOCKS } from "./blocks";
import type { GameMode } from "./rules";

export type Command =
  | { type: "gamemode"; mode: GameMode }
  | { type: "time"; timeOfDay: number }
  | { type: "tp"; x: number; y: number; z: number; relative: [boolean, boolean, boolean] }
  | { type: "give"; id: number; count: number }
  | { type: "seed" }
  | { type: "help" }
  | { type: "error"; message: string };

/** Minecraft ticks per day; tick 0 is sunrise. */
const TICKS_PER_DAY = 24000;
const NAMED_TIMES: Record<string, number> = { day: 1000, noon: 6000, sunset: 12000, night: 13000, midnight: 18000, sunrise: 23000 };

export const COMMAND_HELP = [
  "/gamemode <creative|survival>",
  "/time set <day|noon|night|midnight|ticks>",
  "/tp <x> <y> <z>  (~ for relative)",
  "/give <block> [count]",
  "/seed",
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
      const ticks = NAMED_TIMES[args[1].toLowerCase()] ?? Number(args[1]);
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
      const def = BLOCKS.find((b) => b.name === blockName && b.creative);
      if (!def) return { type: "error", message: `Unknown block "${args[0] ?? ""}"` };
      const count = args[1] === undefined ? 1 : Number(args[1]);
      if (!Number.isInteger(count) || count < 1 || count > 2304) return { type: "error", message: "Count must be 1-2304" };
      return { type: "give", id: def.id, count };
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
