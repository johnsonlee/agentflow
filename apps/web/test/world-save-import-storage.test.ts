import { describe, expect, it } from "vitest";
import { commitWorldSaveImport, WORLD_IMPORT_BACKUP_KEY } from "../src/persistence/worldSaveImport";
import type { WorldSaveImport } from "@craft/engine";
const candidate: WorldSaveImport = Object.freeze({ raw: '{"literal":"selected raw bytes"}\n', name: "Selected", mode: "survival", seed: 2, bytes: 34 });
const KEY = "world";
class Storage {
  values = new Map<string, string>(); calls: string[] = []; fail: string | null = null; afterBackup?: () => void;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.calls.push(key); if (key === this.fail) throw new Error("quota"); this.values.set(key, value); if (key === WORLD_IMPORT_BACKUP_KEY) this.afterBackup?.(); }
}
describe("explicit world replacement with a separately retained previous raw backup", () => {
  it("stores chosen raw exactly after backup, without parsing/repairing a damaged existing raw", () => {
    const s = new Storage(); s.values.set(KEY, 'damaged-original{\n');
    commitWorldSaveImport(s, KEY, 'damaged-original{\n', candidate, () => true);
    expect(s.calls).toEqual([WORLD_IMPORT_BACKUP_KEY, KEY]); expect(s.getItem(KEY)).toBe(candidate.raw); expect(s.getItem(WORLD_IMPORT_BACKUP_KEY)).toBe('damaged-original{\n');
  });
  it("does not invent a previous world when storage was empty", () => {
    const s = new Storage(); commitWorldSaveImport(s, KEY, null, candidate, () => true);
    expect(s.calls).toEqual([KEY]); expect(s.getItem(WORLD_IMPORT_BACKUP_KEY)).toBeNull();
  });
  it("backup quota failure leaves active world and earlier backup untouched", () => {
    const s = new Storage(); s.values.set(KEY, "current"); s.values.set(WORLD_IMPORT_BACKUP_KEY, "older"); s.fail = WORLD_IMPORT_BACKUP_KEY;
    expect(() => commitWorldSaveImport(s, KEY, "current", candidate, () => true)).toThrow();
    expect(s.getItem(KEY)).toBe("current"); expect(s.getItem(WORLD_IMPORT_BACKUP_KEY)).toBe("older");
  });
  it("final-key quota failure preserves active world; successful backup rotation is explicitly not rolled back", () => {
    const s = new Storage(); s.values.set(KEY, "current"); s.values.set(WORLD_IMPORT_BACKUP_KEY, "older"); s.fail = KEY;
    expect(() => commitWorldSaveImport(s, KEY, "current", candidate, () => true)).toThrow();
    expect(s.getItem(KEY)).toBe("current"); expect(s.getItem(WORLD_IMPORT_BACKUP_KEY)).toBe("current");
  });
  it.each([false, true])("refuses observable stale state or inactive screen before any write (%s)", changed => {
    const s = new Storage(); s.values.set(KEY, changed ? "another world" : "current");
    expect(() => commitWorldSaveImport(s, KEY, "current", candidate, () => changed)).toThrow(/changed/); expect(s.calls).toEqual([]);
  });
  it("rechecks storage after backup and does not overwrite another world", () => {
    const s = new Storage(); s.values.set(KEY, "current"); s.afterBackup = () => s.values.set(KEY, "another world");
    expect(() => commitWorldSaveImport(s, KEY, "current", candidate, () => true)).toThrow(/changed/); expect(s.calls).toEqual([WORLD_IMPORT_BACKUP_KEY]); expect(s.getItem(KEY)).toBe("another world");
  });
  it("read failures cannot remove or replace the active key", () => {
    const s = { getItem() { throw new Error("read denied"); }, setItem() { throw new Error("must not write"); } };
    expect(() => commitWorldSaveImport(s, KEY, "current", candidate, () => true)).toThrow(/read denied/);
  });
});
