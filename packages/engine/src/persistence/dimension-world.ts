import type { SaveData } from "./save";

/** World-local owners only. Player health/status/bags and Agent remain global.
 * Callers must validate the complete save before partitioning it. This is not a
 * parser for untrusted inactive-world archives and does not initiate travel. */
export const DIMENSION_WORLD_KEYS = [
  "seed", "generatorVersion", "player", "edits", "npcs", "chalkboards",
  "furnaces", "redstone", "farming", "fire", "fluids", "portals",
  "gravelHarvests", "worldDrops", "mobs", "leashes", "balloons",
  "snowballProjectiles",
] as const satisfies readonly (keyof SaveData)[];
export type DimensionWorldState = Pick<SaveData, typeof DIMENSION_WORLD_KEYS[number]>;
const allowed = new Set<string>(DIMENSION_WORLD_KEYS);
const required = ["seed", "player", "edits"] as const;
const sourceDiagnostics = [
  "generatorVersionInvalid", "fluidsInvalid", "portalsInvalid", "portalOwnershipIssues",
  "playerStateOwnershipInvalid", "glowOwnershipIssues", "sparklerOwnershipIssues",
  "bottleOwnershipIssues", "bucketOwnershipIssues", "cowStateInvalid", "playerStatusInvalid",
  "fireInvalid", "ignitionOwnershipIssues", "gravelHarvestInvalid",
] as const satisfies readonly (keyof SaveData)[];
function assertNoSourceDiagnostics(save: SaveData): void {
  for (const key of sourceDiagnostics) {
    const descriptor = Object.getOwnPropertyDescriptor(save, key);
    if (!descriptor) continue;
    if (!("value" in descriptor)) throw new Error("Accessor in dimension source diagnostic");
    const value: unknown = descriptor.value;
    if (Array.isArray(value) ? value.length > 0 : value !== undefined && value !== false) {
      throw new Error(`Unresolved source diagnostic ${key}`);
    }
  }
}


function assertWorldEnvelope(world: DimensionWorldState): void {
  if (!world || typeof world !== "object" || Array.isArray(world) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(world))) {
    throw new Error("Invalid dimension world envelope");
  }
  for (const key of Reflect.ownKeys(world)) {
    const descriptor = Object.getOwnPropertyDescriptor(world, key)!;
    if (typeof key !== "string" || !allowed.has(key) || !descriptor.enumerable ||
        !("value" in descriptor)) {
      throw new Error("Foreign owner, accessor or non-enumerable field in dimension world");
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(world, key) || world[key] === undefined) {
      throw new Error(`Missing dimension world ${key}`);
    }
  }
}

/** Detached world snapshot contains no player/Agent bag or player status owner. */
export function captureDimensionWorld(save: SaveData): DimensionWorldState {
  assertNoSourceDiagnostics(save);
  const world: Record<string, unknown> = {};
  for (const key of DIMENSION_WORLD_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(save, key);
    if (!descriptor) continue;
    if (!("value" in descriptor)) throw new Error("Accessor in dimension source");
    if (descriptor.value !== undefined) world[key] = descriptor.value;
  }
  assertWorldEnvelope(world as DimensionWorldState);
  return structuredClone(world) as DimensionWorldState;
}

/** Replaces the entire world partition. Absence in the target must never retain
 * an old realm's furnace/drop/portal owner. Inputs and output share no aliases. */
export function replaceDimensionWorld(globalSave: SaveData, target: DimensionWorldState): SaveData {
  assertNoSourceDiagnostics(globalSave);
  assertWorldEnvelope(target);
  const next = structuredClone(globalSave);
  for (const key of DIMENSION_WORLD_KEYS) Reflect.deleteProperty(next, key);
  Object.assign(next, structuredClone(target));
  return next;
}

export type DimensionId = "overworld" | "nether";
export interface DimensionArchiveState {
  version: 1;
  active: DimensionId;
  inactive: Partial<Record<DimensionId, DimensionWorldState>>;
}
export interface DimensionTransition {
  /** Detached destination for preparation; changing it never changes archive data. */
  destination: DimensionWorldState;
  /** Call only after a destination context is ready, using a fresh current-world
   * snapshot. This data transaction does not activate a Game or move global bags. */
  commit(currentWorld: DimensionWorldState): { world: DimensionWorldState; archive: DimensionArchiveState } | null;
  cancel(): void;
}
const dimensionId = (id: unknown): id is DimensionId => id === "overworld" || id === "nether";

/** Ownership partition transaction over already validated world states. No live
 * Game callbacks, raw archive sanitation, linking, generation or travel here. */
export class DimensionWorldArchive {
  private current: DimensionId;
  private inactive: Partial<Record<DimensionId, DimensionWorldState>>;
  private pending: symbol | null = null;
  constructor(active: DimensionId, inactive: Partial<Record<DimensionId, DimensionWorldState>> = {}) {
    if (!dimensionId(active) || !inactive || typeof inactive !== "object" || Array.isArray(inactive) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(inactive))) throw new Error("Invalid dimension archive");
    for (const key of Reflect.ownKeys(inactive)) {
      const descriptor = Object.getOwnPropertyDescriptor(inactive, key)!;
      if (!dimensionId(key) || key === active || !descriptor.enumerable || !("value" in descriptor)) {
        throw new Error("Duplicate active world, non-enumerable or invalid inactive dimension");
      }
      assertWorldEnvelope(inactive[key]!);
    }
    this.current = active;
    this.inactive = structuredClone(inactive);
  }
  get active(): DimensionId { return this.current; }
  exportState(): DimensionArchiveState {
    return { version: 1, active: this.current, inactive: structuredClone(this.inactive) };
  }
  begin(target: DimensionId, created?: DimensionWorldState): DimensionTransition | null {
    if (!dimensionId(target) || target === this.current || this.pending) return null;
    const existing = this.inactive[target];
    // Never overwrite an already owned inactive world with generated data.
    if (existing && created !== undefined || !existing && created === undefined) return null;
    const selected = existing ?? created!;
    assertWorldEnvelope(selected);
    const destination = structuredClone(selected), token = Symbol("dimension-transition"), source = this.current;
    this.pending = token;
    let done = false;
    const cancel = () => { if (done) return; done = true; if (this.pending === token) this.pending = null; };
    return {
      destination: structuredClone(destination),
      cancel,
      commit: currentWorld => {
        if (done || this.pending !== token || this.current !== source) return null;
        try {
          assertWorldEnvelope(currentWorld);
          // Complete all copies before changing any archive owner. A failed clone
          // or invalid source leaves both realms unchanged and releases the lease.
          const sourceCopy = structuredClone(currentWorld), world = structuredClone(destination);
          const next = structuredClone(this.inactive);
          delete next[target];
          next[source] = sourceCopy;
          this.inactive = next;
          this.current = target;
          return { world, archive: this.exportState() };
        } finally { cancel(); }
      },
    };
  }
}
