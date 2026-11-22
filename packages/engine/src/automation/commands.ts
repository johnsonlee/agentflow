import { TIMED_STATUS, type TimedStatusKind, type PlayerStatusKind } from "../simulation/status-effects";
import { ITEMS } from "../catalog/items";
import { BLOCKS } from "../catalog/blocks";
import { WORLD_BORDER } from "../core/math";
import { MOB_SPECS, type MobKind } from "../simulation/entities";
import type { GameMode } from "../world/rules";

export type Command =
  | { type: "gamemode"; mode: GameMode }
  | { type: "time"; timeOfDay: number }
  | { type: "tp"; x: number; y: number; z: number; relative: [boolean, boolean, boolean] }
  | { type: "give"; id: number; count: number }
  | { type: "summon"; kind: MobKind; name?: string }
  | { type: "gamerule"; rule: "doMobSpawning" | "doDaylightCycle" | "keepInventory"; value: boolean }
  | { type: "effect"; action: "apply"; effect: TimedStatusKind; seconds: number; amplifier: number }
  | { type: "effect"; action: "clear"; effect?: PlayerStatusKind }
  | { type: "seed" }
  | { type: "agent"; action: "tp" }
  | { type: "code"; command: string }
  | { type: "help" }
  | { type: "error"; message: string };

/** Minecraft ticks per day; tick 0 is sunrise. */
const TICKS_PER_DAY = 24000;
const NAMED_TIMES: Record<string, number> = { day: 1000, noon: 6000, sunset: 12000, night: 13000, midnight: 18000, sunrise: 23000 };

const SUMMON_KINDS=Object.keys(MOB_SPECS) as MobKind[];
const SUMMON_HELP=`/summon <${SUMMON_KINDS.join("|")}> [name]`;
const isSummonKind=(kind:string):kind is MobKind=>SUMMON_KINDS.some(registered=>registered===kind);

export const COMMAND_HELP = [
  "/gamemode <creative|survival>",
  "/time set <day|noon|night|midnight|ticks>",
  "/tp <x> <y> <z>  (~ for relative)",
  "/give <block|item> [count]",
  SUMMON_HELP,
  "/effect <@s|@p|@a> <weakness|blindness|nausea> [seconds] [amplifier]",
  "/effect <@s|@p|@a> clear [poison|weakness|blindness|nausea]",
  "/gamerule <doMobSpawning|doDaylightCycle|keepInventory> <true|false>",
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
      // An explicit allow-list (a switch, not an object lookup, so names like "constructor" never match).
      switch ((args[0] ?? "").toLowerCase()) {
        case "creative":
        case "c":
        case "1":
          return { type: "gamemode", mode: "creative" };
        case "survival":
        case "s":
        case "0":
          return { type: "gamemode", mode: "survival" };
        default:
          // Naming the argument makes each reply distinct (and clearer).
          return {
            type: "error",
            message: args[0] ? `Unknown game mode "${args[0].slice(0, 32)}". Usage: /gamemode <creative|survival>` : "Usage: /gamemode <creative|survival>",
          };
      }
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
      // The world border (also for ~ offsets, which can't move further than the world is wide).
      if (Math.abs(values[0]) > 2 * WORLD_BORDER || Math.abs(values[2]) > 2 * WORLD_BORDER || (!relative[0] && Math.abs(values[0]) > WORLD_BORDER) || (!relative[2] && Math.abs(values[2]) > WORLD_BORDER)) {
        return { type: "error", message: `Coordinates must be within the world border (±${WORLD_BORDER})` };
      }
      if (Math.abs(values[1]) > 4096) return { type: "error", message: "Height is out of range" };
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
      if (!isSummonKind(kind)) {
        return { type: "error", message: `Usage: ${SUMMON_HELP}` };
      }
      const name = args.slice(1).join(" ").trim().slice(0, 64);
      return name ? { type: "summon", kind, name } : { type: "summon", kind };
    }
    case "effect": {
      const usage = "Usage: /effect <@s|@p|@a> <weakness|blindness|nausea> [seconds] [amplifier], or /effect <@s|@p|@a> clear [effect]";
      const bad = (): Command => ({ type: "error", message: usage });
      if (!["@s", "@p", "@a"].includes(args[0] ?? "")) return bad();
      const kind = (args[1] ?? "").toLowerCase().replace(/^minecraft:/, "");
      const kinds: readonly TimedStatusKind[] = ["weakness", "blindness", "nausea"];
      if (kind === "clear") {
        const effect = args[2]?.toLowerCase().replace(/^minecraft:/, "");
        if (args.length > 3 || effect !== undefined && !["poison", ...kinds].includes(effect)) return bad();
        return effect === undefined ? { type: "effect", action: "clear" } : { type: "effect", action: "clear", effect: effect as PlayerStatusKind };
      }
      if (!kinds.includes(kind as TimedStatusKind) || args.length > 4) return bad();
      const seconds = args[2] === undefined ? TIMED_STATUS.defaultSeconds : Number(args[2]);
      const amplifier = args[3] === undefined ? 0 : Number(args[3]);
      if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > TIMED_STATUS.maximumSeconds || !Number.isSafeInteger(amplifier) || amplifier < 0 || amplifier > TIMED_STATUS.maximumAmplifier) return bad();
      return seconds === 0 ? { type: "effect", action: "clear", effect: kind as TimedStatusKind } : { type: "effect", action: "apply", effect: kind as TimedStatusKind, seconds, amplifier };
    }
    case "gamerule": {
      const rule = args[0] === "keepinventory" ? "keepInventory" : args[0] === "doMobSpawning" || args[0] === "doDaylightCycle" || args[0] === "keepInventory" ? args[0] : null;
      const value = args[1] === "true" ? true : args[1] === "false" ? false : null;
      if (!rule || value === null) return { type: "error", message: "Usage: /gamerule <doMobSpawning|doDaylightCycle|keepInventory> <true|false>" };
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
