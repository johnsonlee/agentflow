import type { WorldSaveImport } from "@craft/engine";

export const WORLD_IMPORT_BACKUP_KEY = "craft.save.import.previous.v1";
export interface WorldImportStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
/** Two synchronous Web Storage writes, not a cross-tab transaction/CAS. A successful backup
 * rotation may remain if the final setItem fails; the active world is never removed first.
 * Native Storage.setItem failures are atomic for that key. No rollback overwrites a changed world. */
export function commitWorldSaveImport(storage: WorldImportStorage, saveKey: string, expectedCurrent: string | null, candidate: WorldSaveImport, stillCurrent: () => boolean): void {
  const unchanged = () => stillCurrent() && storage.getItem(saveKey) === expectedCurrent;
  if (!unchanged()) throw new Error("Your current world changed. Return to the title and open Import again.");
  if (expectedCurrent !== null) storage.setItem(WORLD_IMPORT_BACKUP_KEY, expectedCurrent);
  if (!unchanged()) throw new Error("Your current world changed. Return to the title and open Import again.");
  storage.setItem(saveKey, candidate.raw);
}
