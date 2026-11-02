import * as THREE from "three";
import { CHALKBOARD_SIZES, FACING_DIRS, chalkboardCells, chalkboardKey, rightOf, type Chalkboard } from "@craft/engine";

const PX = 128;

/** Draws a chalkboard face: wooden frame, dark slate, white chalk text wrapped to the width. */
export function drawChalkboard(board: Chalkboard): HTMLCanvasElement {
  const { w, h } = CHALKBOARD_SIZES[board.size];
  const c = document.createElement("canvas");
  c.width = w * PX;
  c.height = h * PX;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#8a6236";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#24382c";
  ctx.fillRect(8, 8, c.width - 16, c.height - 16);
  // Faint chalk dust.
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let i = 0; i < 40 * w * h; i++) ctx.fillRect((i * 37) % c.width, (i * 61) % c.height, 2, 2);
  ctx.fillStyle = "#f2f2ea";
  const font = 18;
  ctx.font = `${font}px monospace`;
  ctx.textBaseline = "top";
  const maxWidth = c.width - 32;
  const lines: string[] = [];
  for (const raw of board.text.split("\n")) {
    let line = "";
    for (const word of raw.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  const maxLines = Math.floor((c.height - 28) / (font + 4));
  lines.slice(0, maxLines).forEach((l, i) => ctx.fillText(l, 16, 14 + i * (font + 4)));
  if (board.locked) {
    ctx.fillStyle = "#e9c24a";
    ctx.fillRect(c.width - 24, c.height - 24, 12, 10);
    ctx.strokeStyle = "#e9c24a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.width - 18, c.height - 24, 4, Math.PI, 0);
    ctx.stroke();
  }
  return c;
}

/** Renders chalkboards as textured planes: flush against the wall, or upright in their cells when standing. */
export class ChalkboardViews {
  private readonly meshes = new Map<string, THREE.Mesh>();

  constructor(private readonly scene: THREE.Scene) {}

  update(board: Chalkboard): void {
    this.remove(board);
    const { w, h } = CHALKBOARD_SIZES[board.size];
    const texture = new THREE.CanvasTexture(drawChalkboard(board));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture, side: board.standing ? THREE.DoubleSide : THREE.FrontSide }),
    );
    const [fx, fz] = FACING_DIRS[board.facing];
    const [rx, rz] = rightOf(board.facing);
    // Centre of the occupied cells; wall boards sit just in front of the wall behind them.
    const back = board.standing ? 0 : 0.47;
    mesh.position.set(
      board.x + 0.5 + (rx * (w - 1)) / 2 - fx * back,
      board.y + h / 2,
      board.z + 0.5 + (rz * (w - 1)) / 2 - fz * back,
    );
    mesh.rotation.y = Math.atan2(fx, fz);
    mesh.userData.chalkboard = chalkboardKey(board.x, board.y, board.z);
    this.scene.add(mesh);
    this.meshes.set(chalkboardKey(board.x, board.y, board.z), mesh);
  }

  remove(board: Chalkboard): void {
    const key = chalkboardKey(board.x, board.y, board.z);
    const mesh = this.meshes.get(key);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    const m = mesh.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.dispose();
    this.meshes.delete(key);
  }

  /** Cells covered, for hit-testing (the blocks in those cells point back to the board). */
  static cells(board: Chalkboard) {
    return chalkboardCells(board);
  }
}
