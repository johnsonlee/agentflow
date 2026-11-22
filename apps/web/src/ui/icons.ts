import { BREWING_STAND_PARTS, blockById, isItem, itemById, inspectSparklerState, isSparklerId, SPARKLER_COLORS, sparklerColor, type ItemStack } from "@craft/engine";
import type { TextureAtlas } from "@craft/textures";

const cache = new WeakMap<TextureAtlas, Map<string, string>>();

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
    l.fillRect(0, 0, img.width, img.height);
  }
  ctx.drawImage(layer, 0, 0);
}

/**
 * Inventory icon for a stack id as a data URL: an isometric cube for blocks, or a flat sprite
 * for plants and items (sticks, tools).
 */
export function blockIcon(atlas: TextureAtlas, id: number, size = 64, stack?: ItemStack): string {
  let icons = cache.get(atlas);
  if (!icons) { icons = new Map(); cache.set(atlas, icons); }
  const activeIcon = stack && isSparklerId(id) && inspectSparklerState(stack).kind === "active"
    ? SPARKLER_COLORS.find(color => color.color === sparklerColor(id))?.iconActive : undefined;
  const key = `${id}:${size}${activeIcon ? `:${activeIcon}` : ""}`;
  const cached = icons.get(key);
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
    ctx.drawImage(tileCanvas(atlas, activeIcon ?? itemById(id).icon), 0, 0, size, size);
  } else if (def.shape === "cross" || def.shape === "torch") {
    ctx.drawImage(tileCanvas(atlas, def.faces.side), size * 0.1, size * 0.1, size * 0.8, size * 0.8);
  } else if (def.shape === "brewing_stand") {
    // Project the same original multipart world model, instead of showing a misleading full cube.
    const project=(x:number,y:number,z:number):[number,number]=>[size*.5+(x-z)*size*.45,size*.84+(x+z-1)*size*.22-y*size*.7];
    for(const part of [...BREWING_STAND_PARTS].sort((a,b)=>(a.box[0]+a.box[2]+a.box[3]+a.box[5])-(b.box[0]+b.box[2]+b.box[3]+b.box[5]))){
      const [x0,y0,z0,x1,y1,z1]=part.box,dx=(x1-x0)/atlas.tileSize,dy=(y1-y0)/atlas.tileSize,dz=(z1-z0)/atlas.tileSize,img=tileCanvas(atlas,part.texture);
      const top=project(x0,y1,z0),front=project(x0,y1,z1),right=project(x1,y1,z1);
      face(ctx,img,[dx*size*.45,dx*size*.22,-dz*size*.45,dz*size*.22,...top],0);
      face(ctx,img,[dx*size*.45,dx*size*.22,0,dy*size*.7,...front],.18);
      face(ctx,img,[dz*size*.45,-dz*size*.22,0,dy*size*.7,...right],.32);
    }
  } else if (def.shape === "fence") {
    // Original two-post inventory silhouette using the same local plank tile as the world model.
    const plank = tileCanvas(atlas, def.faces.side);
    for (const y of [.29, .59]) ctx.drawImage(plank, size * .12, size * y, size * .76, size * .13);
    for (const x of [.17, .65]) {
      ctx.drawImage(plank, size * x, size * .08, size * .18, size * .84);
      ctx.fillStyle = "rgba(0,0,0,.22)";
      ctx.fillRect(size * (x + .14), size * .08, size * .04, size * .84);
    }
  } else if (def.shape === "box") {
    // Flat redstone parts (plates, buttons, repeaters): their top texture.
    ctx.drawImage(tileCanvas(atlas, def.faces.top), size * 0.15, size * 0.15, size * 0.7, size * 0.7);
  } else {
    const s = size;
    const k = s / (2 * atlas.tileSize);
    const top = tileCanvas(atlas, def.faces.top);
    const side = tileCanvas(atlas, def.faces.side);
    face(ctx, top, [k, k / 2, -k, k / 2, s / 2, 0], 0);
    face(ctx, side, [k, k / 2, 0, k, 0, s / 4], 0.2);
    face(ctx, side, [k, -k / 2, 0, k, s / 2, s / 2], 0.4);
  }
  const url = canvas.toDataURL();
  icons.set(key, url);
  return url;
}
