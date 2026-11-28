/** Original application growth clock, not native Education crop age/timing. */
export interface CaneGrowthState { version: 1; tick: number; accumulator: number; cursor: number }
export type CaneGrowthStateRead = { kind: "absent" } | { kind: "invalid"; reason: string } | { kind: "valid"; data: CaneGrowthState };

export function emptyCaneGrowthState(): CaneGrowthState { return { version: 1, tick: 0, accumulator: 0, cursor: 0 }; }

/** Descriptor-only validation; callers must preserve invalid original saves before normalization. */
export function readCaneGrowthState(raw: unknown): CaneGrowthStateRead {
  if (raw === undefined) return { kind: "absent" };
  const invalid = (): CaneGrowthStateRead => ({ kind: "invalid", reason: "Invalid Cane growth clock shape, version or bounds" });
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return invalid();
    const fields = Object.getOwnPropertyDescriptors(raw), keys = Reflect.ownKeys(fields);
    if (keys.length !== 4 || keys.some(key => typeof key !== "string" || !["version", "tick", "accumulator", "cursor"].includes(key))) return invalid();
    for (const key of ["version", "tick", "accumulator", "cursor"]) if (!fields[key]?.enumerable || !("value" in fields[key])) return invalid();
    const version = fields.version.value, tick = fields.tick.value, accumulator = fields.accumulator.value, cursor = fields.cursor.value;
    const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1e9;
    if (version !== 1 || !integer(tick) || !integer(cursor) || typeof accumulator !== "number" || !Number.isFinite(accumulator) || accumulator < 0 || accumulator > 86400) return invalid();
    return { kind: "valid", data: { version: 1, tick, accumulator, cursor } };
  } catch { return invalid(); }
}
