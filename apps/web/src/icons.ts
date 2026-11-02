import { blockById, isItem, itemById } from "@craft/engine";
import type { TextureAtlas } from "@craft/textures";

const cache = new Map<number, string>();

function tileCanvas(atlas: TextureAtlas, name: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = atlas.tileSize;
  c.height = atlas.tileSize;
  const ctx = c.getContext("2d")!;
  ctx.putImageData(new ImageData(atlas.tilePixels(name), atlas.tileSize, atlas.tileSize), 0, 0);
  return c;
}

/** Draws one face of an isometric cube, then darkens it for directional shading. */
function face(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, m: [number, number, number, number, number, number], darken: number): void {
  const layer = document.createElement("canvas");
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  const l = layer.getContext("2d")!;
  l.imageSmoothingEnabled = false;
  l.setTransform(...m);
  l.drawImage(img, 0, 0);
  if (darken > 0) {
    l.globalCompositeOperation = "source-atop";
    l.fillStyle = `rgba(0,0,0,${darken})`;
    l.fillRect(0, 0, 16, 16);
  }
  ctx.drawImage(layer, 0, 0);
}

/**
 * Inventory icon for a stack id as a data URL: an isometric cube for blocks, or a flat sprite
 * for plants and items (sticks, tools).
 */
export function blockIcon(atlas: TextureAtlas, id: number, size = 64): string {
  const cached = cache.get(id);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const def = isItem(id) ? null : blockById(id);
  if (def?.name.startsWith("chalkboard_")) {
    // Chalkboards: a framed dark slate, wider for posters and boards.
    const wide = def.name.endsWith("slate") ? 0.6 : def.name.endsWith("poster") ? 0.8 : 0.9;
    const w = size * wide;
    const h = size * (def.name.endsWith("board") ? 0.6 : 0.5);
    const x = (size - w) / 2;
    const y = (size - h) / 2;
    ctx.fillStyle = "#8a6236";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#24382c";
    ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = "#f2f2ea";
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 7, y + 8 + i * 6, (w - 14) * (1 - i * 0.25), 2);
  } else if (!def) {
    ctx.drawImage(tileCanvas(atlas, itemById(id).icon), 0, 0, size, size);
  } else if (def.shape === "cross" || def.shape === "torch") {
    ctx.drawImage(tileCanvas(atlas, def.faces.side), size * 0.1, size * 0.1, size * 0.8, size * 0.8);
  } else if (def.shape === "box") {
    // Flat redstone parts (plates, buttons, repeaters): their top texture.
    ctx.drawImage(tileCanvas(atlas, def.faces.top), size * 0.15, size * 0.15, size * 0.7, size * 0.7);
  } else {
    const s = size;
    const k = s / 32;
    const top = tileCanvas(atlas, def.faces.top);
    const side = tileCanvas(atlas, def.faces.side);
    face(ctx, top, [k, k / 2, -k, k / 2, s / 2, 0], 0);
    face(ctx, side, [k, k / 2, 0, k, 0, s / 4], 0.2);
    face(ctx, side, [k, -k / 2, 0, k, s / 2, s / 2], 0.4);
  }
  const url = canvas.toDataURL();
  cache.set(id, url);
  return url;
}
