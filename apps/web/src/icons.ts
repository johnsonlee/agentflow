import { blockById } from "@craft/engine";
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

/** Inventory icon for a block as a data URL: an isometric cube, or a flat sprite for plants. */
export function blockIcon(atlas: TextureAtlas, id: number, size = 64): string {
  const cached = cache.get(id);
  if (cached) return cached;
  const def = blockById(id);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  if (def.shape === "cross") {
    ctx.drawImage(tileCanvas(atlas, def.faces.side), size * 0.1, size * 0.1, size * 0.8, size * 0.8);
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
