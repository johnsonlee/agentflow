import { expect, it } from "vitest";
import { emptyCaneGrowthState, readCaneGrowthState } from "../src/persistence/cane-growth-state";

it("legacy absence is distinct from corruption and valid clocks detach", () => {
  expect(readCaneGrowthState(undefined)).toEqual({ kind: "absent" });
  const source = { version: 1, tick: 1e9, accumulator: 86400, cursor: 1e9 };
  const checked = readCaneGrowthState(source); expect(checked.kind).toBe("valid");
  if (checked.kind === "valid") { checked.data.tick = 0; expect(source.tick).toBe(1e9); }
  const first = emptyCaneGrowthState(); first.cursor = 9; expect(emptyCaneGrowthState().cursor).toBe(0);
});
it.each([null, [], {}, { ...emptyCaneGrowthState(), version: 2 }, { ...emptyCaneGrowthState(), tick: -1 },
  { ...emptyCaneGrowthState(), tick: 1e9 + 1 }, { ...emptyCaneGrowthState(), tick: .5 },
  { ...emptyCaneGrowthState(), accumulator: NaN }, { ...emptyCaneGrowthState(), accumulator: Infinity },
  { ...emptyCaneGrowthState(), accumulator: -.1 }, { ...emptyCaneGrowthState(), accumulator: 86400.1 },
  { ...emptyCaneGrowthState(), cursor: "0" }, { ...emptyCaneGrowthState(), cursor: 1e9 + 1 },
  { ...emptyCaneGrowthState(), extra: 1 }])("present invalid clock refuses before normalization: %j", raw => {
  expect(readCaneGrowthState(raw).kind).toBe("invalid");
});
it("unknown symbols, hidden properties and getters refuse without invoking data access", () => {
  let calls = 0; const raw = emptyCaneGrowthState();
  Object.defineProperty(raw, "tick", { enumerable: true, get() { calls++; return 1; } });
  expect(readCaneGrowthState(raw).kind).toBe("invalid"); expect(calls).toBe(0);
  expect(readCaneGrowthState({ ...emptyCaneGrowthState(), [Symbol("age")]: 1 }).kind).toBe("invalid");
  const hidden = emptyCaneGrowthState(); Object.defineProperty(hidden, "cursor", { value: 0, enumerable: false });
  expect(readCaneGrowthState(hidden).kind).toBe("invalid");
  expect(readCaneGrowthState(Object.assign(Object.create(null), emptyCaneGrowthState())).kind).toBe("valid");
});
