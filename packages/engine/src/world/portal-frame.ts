import { blockId } from "../catalog/blocks";
import { WORLD_BORDER } from "../core/math";
import { WORLD_HEIGHT } from "./chunk";
import type { WorldCellSnapshot } from "./world";

export interface PortalCell { x: number; y: number; z: number }
/** Origin is the lowest interior cell, at the smaller horizontal coordinate. */
export interface PortalFrame extends PortalCell { axis: "x" | "z"; width: number; height: number }
export interface PortalDependency extends PortalCell { id: number }
export type PortalCellReader = (cell: PortalCell) => number | undefined;
export type PortalFrameInspection =
  | { status: "valid"; frame: PortalFrame; interior: PortalCell[]; boundary: PortalCell[]; dependencies: PortalDependency[] }
  | { status: "invalid" | "unknown"; reason: string };
export interface PortalFrameWorld {
  captureCell(x: number, y: number, z: number): WorldCellSnapshot | undefined;
  cellUnchanged(snapshot: WorldCellSnapshot): boolean;
}
export type CapturedPortalFrame = PortalFrameInspection & {
  /** Empty on refusal; valid plans include all interior and structural cells. */
  expected: readonly WorldCellSnapshot[];
  unchanged(): boolean;
};

// Bounded application support. Current Education's exact size limits still need
// runtime calibration; these constants do not assert native equivalence.
const MAX_INTERIOR = 21;
const OBSIDIAN = blockId("obsidian"), FIRE = blockId("fire");
const empty = (id: number | undefined) => id === 0 || id === FIRE;
const integer = Number.isSafeInteger;
function supported(f: PortalFrame): boolean {
  return (f.axis === "x" || f.axis === "z") && [f.x, f.y, f.z, f.width, f.height].every(integer)
    && f.width >= 2 && f.width <= MAX_INTERIOR && f.height >= 3 && f.height <= MAX_INTERIOR
    && f.y >= 1 && f.y + f.height < WORLD_HEIGHT
    && Math.abs(f.x) <= WORLD_BORDER && Math.abs(f.z) <= WORLD_BORDER
    && (f.axis === "x" ? f.x - 1 >= -WORLD_BORDER && f.x + f.width <= WORLD_BORDER
      : f.z - 1 >= -WORLD_BORDER && f.z + f.width <= WORLD_BORDER);
}
function cell(f: PortalFrame, u: number, v: number): PortalCell {
  return { x: f.x + (f.axis === "x" ? u : 0), y: f.y + v, z: f.z + (f.axis === "z" ? u : 0) };
}

/** Pure loaded-cell inspection. Never generates chunks, edits blocks or owns a tool.
 * Corners are not structural dependencies. Callers must revalidate all returned
 * observations plus their cell/chunk revisions before committing any activation. */
export function inspectPortalFrame(read: PortalCellReader, input: PortalFrame): PortalFrameInspection {
  const frame: PortalFrame = { axis: input.axis, x: input.x, y: input.y, z: input.z, width: input.width, height: input.height };
  if (!supported(frame)) return { status: "invalid", reason: "unsupported-frame" };
  const interior: PortalCell[] = [], boundary: PortalCell[] = [], dependencies: PortalDependency[] = [];
  for (let v = 0; v < frame.height; v++) for (let u = 0; u < frame.width; u++) interior.push(cell(frame, u, v));
  for (let u = 0; u < frame.width; u++) boundary.push(cell(frame, u, -1), cell(frame, u, frame.height));
  for (let v = 0; v < frame.height; v++) boundary.push(cell(frame, -1, v), cell(frame, frame.width, v));
  let unknown = false;
  for (const [positions, edge] of [[interior, false], [boundary, true]] as const) {
    for (const p of positions) {
      const id = read({ ...p });
      if (id === undefined) { unknown = true; continue; }
      if (edge ? id !== OBSIDIAN : !empty(id)) return { status: "invalid", reason: edge ? "incomplete-obsidian-boundary" : "occupied-interior" };
      dependencies.push({ ...p, id });
    }
  }
  if (unknown) return { status: "unknown", reason: "unloaded-dependency" };
  return { status: "valid", frame: { ...frame }, interior, boundary, dependencies };
}

/** Find a bounded rectangle containing a supplied ignition cell on one axis.
 * Undefined reads stop discovery; an unloaded area must not become implicit Air. */
export function findPortalFrame(read: PortalCellReader, input: PortalCell, axis: "x" | "z"): PortalFrameInspection {
  const point: PortalCell = { x: input.x, y: input.y, z: input.z };
  if (![point.x, point.y, point.z].every(integer) || (axis !== "x" && axis !== "z")
    || Math.abs(point.x) > WORLD_BORDER || Math.abs(point.z) > WORLD_BORDER || point.y < 1 || point.y >= WORLD_HEIGHT - 1)
    return { status: "invalid", reason: "invalid-origin" };
  const unknown = (): PortalFrameInspection => ({ status: "unknown", reason: "unloaded-dependency" });
  const invalid = (): PortalFrameInspection => ({ status: "invalid", reason: "no-bounded-frame" });
  const start = read({ ...point }); if (start === undefined) return unknown(); if (!empty(start)) return invalid();
  const origin = { ...point };
  let floor = false;
  for (let distance = 0; distance < MAX_INTERIOR; distance++) {
    if (origin.y < 1) return invalid();
    const id = read({ ...origin, y: origin.y - 1 });
    if (id === undefined) return unknown();
    if (id === OBSIDIAN) { floor = true; break; }
    if (!empty(id)) return invalid();
    origin.y--;
  }
  if (!floor) return invalid();
  let left = false;
  for (let distance = 0; distance < MAX_INTERIOR; distance++) {
    const next = { ...origin, [axis]: origin[axis] - 1 };
    if (Math.abs(next[axis]) > WORLD_BORDER) return invalid();
    const id = read(next); if (id === undefined) return unknown();
    if (id === OBSIDIAN) { left = true; break; }
    if (!empty(id)) return invalid();
    origin[axis]--;
  }
  if (!left) return invalid();
  let width = 0, height = 0;
  for (let u = 1; u <= MAX_INTERIOR; u++) {
    const p = { ...origin, [axis]: origin[axis] + u };
    if (Math.abs(p[axis]) > WORLD_BORDER) return invalid();
    const id = read(p); if (id === undefined) return unknown();
    if (id === OBSIDIAN) { width = u; break; }
    if (!empty(id)) return invalid();
  }
  for (let v = 1; v <= MAX_INTERIOR; v++) {
    if (origin.y + v >= WORLD_HEIGHT) return invalid();
    const id = read({ ...origin, y: origin.y + v }); if (id === undefined) return unknown();
    if (id === OBSIDIAN) { height = v; break; }
    if (!empty(id)) return invalid();
  }
  return inspectPortalFrame(read, { ...origin, axis, width, height });
}

/** Bind discovery to actual loaded chunk/cell identities for a later atomic batch.
 * A same-ID replacement or unload/reload invalidates the plan. No chunk generation
 * or block/owner writes occur here; this does not activate or travel a portal. */
export function capturePortalFrame(world: PortalFrameWorld, point: PortalCell, axis: "x" | "z"): CapturedPortalFrame {
  const observations = new Map<string, WorldCellSnapshot | undefined>();
  const key = (p: PortalCell) => `${p.x},${p.y},${p.z}`;
  const result = findPortalFrame(p => {
    const k = key(p);
    if (!observations.has(k)) observations.set(k, world.captureCell(p.x, p.y, p.z));
    return observations.get(k)?.id;
  }, point, axis);
  const refusal = (r: PortalFrameInspection): CapturedPortalFrame => ({ ...r, expected: Object.freeze([]), unchanged: () => false });
  if (result.status !== "valid") return refusal(result);
  Object.freeze(result.frame);
  for (const positions of [result.interior, result.boundary, result.dependencies]) {
    positions.forEach(p => Object.freeze(p));
    Object.freeze(positions);
  }
  const expected = Object.freeze(result.dependencies.map(p => Object.freeze({ ...observations.get(key(p))! })));
  const unchanged = () => expected.every(p => world.cellUnchanged(p));
  if (!unchanged()) return refusal({ status: "invalid", reason: "source-changed-during-inspection" });
  return Object.freeze({ ...result, expected, unchanged });
}
