/**
 * Minecraft: Education Edition chalkboards: Slate (1x1), Poster (2x1) and Board (3x2). A board is
 * a record anchored at its bottom-left cell (as seen from the front) and occupies `w x h` cells,
 * each holding the board's block (for targeting and breaking). It hangs on a wall or stands on the
 * ground, faces the player who placed it, and holds multi-line text that can be locked so only
 * world builders (creative players) can edit it.
 */
import { AIR, BLOCKS, blockId } from "./blocks";
import type { BlockGetter } from "./physics";
import type { Vec3 } from "./math";

export type ChalkboardSize = "slate" | "poster" | "board";

export const CHALKBOARD_SIZES: Record<ChalkboardSize, { w: number; h: number; block: string; maxChars: number }> = {
  slate: { w: 1, h: 1, block: "chalkboard_slate", maxChars: 120 },
  poster: { w: 2, h: 1, block: "chalkboard_poster", maxChars: 240 },
  board: { w: 3, h: 2, block: "chalkboard_board", maxChars: 480 },
};

/** Horizontal directions the board front can face: 0 = +Z (south), 1 = -X (west), 2 = -Z (north), 3 = +X (east). */
export const FACING_DIRS: ReadonlyArray<readonly [number, number]> = [[0, 1], [-1, 0], [0, -1], [1, 0]];

export interface Chalkboard {
  x: number;
  y: number;
  z: number;
  size: ChalkboardSize;
  facing: number;
  /** Standing on the ground (true) or hanging on a wall (false). */
  standing: boolean;
  text: string;
  locked: boolean;
}

export function chalkboardSizeOf(id: number): ChalkboardSize | null {
  const name = BLOCKS[id]?.name;
  for (const [size, spec] of Object.entries(CHALKBOARD_SIZES)) if (spec.block === name) return size as ChalkboardSize;
  return null;
}

export function isChalkboard(id: number): boolean {
  return chalkboardSizeOf(id) !== null;
}

/** Facing that points back at a viewer looking along `yaw` (the board faces the player). */
export function facingTowards(yaw: number): number {
  // Look direction is (-sin yaw, -cos yaw); the board faces the opposite way.
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  if (Math.abs(fz) >= Math.abs(fx)) return fz > 0 ? 0 : 2;
  return fx > 0 ? 3 : 1;
}

/** The viewer's right-hand direction when looking at the board's front. */
export function rightOf(facing: number): readonly [number, number] {
  const [fx, fz] = FACING_DIRS[facing];
  return [fz, -fx];
}

/** Cells a board occupies: `w` to the viewer's right of the anchor, `h` upwards. */
export function chalkboardCells(b: Pick<Chalkboard, "x" | "y" | "z" | "size" | "facing">): Vec3[] {
  const { w, h } = CHALKBOARD_SIZES[b.size];
  const [rx, rz] = rightOf(b.facing);
  const cells: Vec3[] = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) cells.push({ x: b.x + rx * i, y: b.y + j, z: b.z + rz * i });
  return cells;
}

/** True if every cell the board would occupy is free (air or a replaceable plant). */
export function canPlaceChalkboard(get: BlockGetter, b: Pick<Chalkboard, "x" | "y" | "z" | "size" | "facing">): boolean {
  return chalkboardCells(b).every((c) => {
    const id = get(c.x, c.y, c.z);
    return id === AIR || BLOCKS[id]?.replaceable === true;
  });
}

/** Clamps text to the board's capacity. */
export function clampChalkText(size: ChalkboardSize, text: string): string {
  return text.slice(0, CHALKBOARD_SIZES[size].maxChars);
}

/** Who may edit: anyone if unlocked; only creative players (world builders) if locked. */
export function canEditChalkboard(b: Chalkboard, mode: "creative" | "survival"): boolean {
  return !b.locked || mode === "creative";
}

export const chalkboardKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

export const CHALKBOARD_BLOCK_IDS = (Object.keys(CHALKBOARD_SIZES) as ChalkboardSize[]).map((s) => () => blockId(CHALKBOARD_SIZES[s].block));
