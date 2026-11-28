import { AIR, blockId, isKnownBlockId, tryBlockById } from "../catalog/blocks";
import { bodyBox, boxCollides } from "../simulation/physics";
import { WORLD_BORDER, type Vec3 } from "../core/math";
import { WORLD_HEIGHT } from "./chunk";
import { sanitizePortalState, type PortalRecord } from "../simulation/portals";
import type { World, WorldCellSnapshot } from "./world";

type LandingWorld = Pick<World, "captureCell" | "cellUnchanged" | "portals" | "blockSourceLeaseBusy">;
export interface PortalLanding {
  readonly position: Readonly<Vec3>;
  readonly frame: Readonly<PortalRecord>;
  /** Rechecks physical cell/chunk revisions and the actual frame owner. Does not reserve or write. */
  unchanged(): boolean;
}
const forbidden = new Set([blockId("water"), blockId("lava"), blockId("fire"), 192, 193]);

/** Conservative application landing policy, not native portal search/calibration.
 * Searches both sides, within three cells and at the frame's bottom height. Only
 * known, loaded, dry, collision-free space on full cube support can qualify.
 * It never loads chunks, clears obstructions, builds a platform or grants items.
 */
export function findPortalLanding(world: LandingWorld, input: PortalRecord): PortalLanding | null {
  try {
    const parsed = sanitizePortalState({ version: 1, records: [input] });
    if (parsed.invalid || world.blockSourceLeaseBusy) return null;
    const frame = Object.freeze({ ...parsed.data.records[0] });
    const owned = world.portals.captureOwner(frame);
    if (!owned || !owned()) return null;
    const frameCells = new Map<string, WorldCellSnapshot>();
    const capture = (into: Map<string, WorldCellSnapshot>, x: number, y: number, z: number) => {
      const key = `${x},${y},${z}`;
      if (into.has(key)) return into.get(key);
      const cell = world.captureCell(x,y,z);
      if (!cell || !isKnownBlockId(cell.id)) return undefined;
      into.set(key,cell); return cell;
    };
    const frameCell = (u: number,v: number,id: number) => capture(frameCells,frame.x+(frame.axis==="x"?u:0),frame.y+v,frame.z+(frame.axis==="z"?u:0))?.id===id;
    for(let u=0;u<frame.width;u++) {
      if(!frameCell(u,-1,blockId("obsidian"))||!frameCell(u,frame.height,blockId("obsidian")))return null;
      for(let v=0;v<frame.height;v++)if(!frameCell(u,v,frame.axis==="x"?192:193))return null;
    }
    for(let v=0;v<frame.height;v++)if(!frameCell(-1,v,blockId("obsidian"))||!frameCell(frame.width,v,blockId("obsidian")))return null;
    const columns=Array.from({length:frame.width},(_,u)=>u).sort((a,b)=>Math.abs(a+.5-frame.width/2)-Math.abs(b+.5-frame.width/2));
    for(const distance of [1,2,3])for(const u of columns)for(const side of [-1,1]) {
      const p={x:frame.x+(frame.axis==="x"?u+.5:.5+side*distance),y:frame.y,z:frame.z+(frame.axis==="z"?u+.5:.5+side*distance)},box=bodyBox(p);
      if(box.minX < -WORLD_BORDER||box.maxX>WORLD_BORDER||box.minZ < -WORLD_BORDER||box.maxZ>WORLD_BORDER||box.minY<1||box.maxY>WORLD_HEIGHT)continue;
      const expected=new Map(frameCells);let unknown=false;
      const read=(x:number,y:number,z:number):number=>{const cell=capture(expected,x,y,z);if(!cell){unknown=true;return AIR;}return cell.id;};
      let safe=true;
      for(let x=Math.floor(box.minX+1e-6);x<=Math.floor(box.maxX-1e-6);x++)for(let z=Math.floor(box.minZ+1e-6);z<=Math.floor(box.maxZ-1e-6);z++) {
        const support=tryBlockById(read(x,p.y-1,z));
        if(!support?.solid||support.shape!=="cube"||support.collisionBox||forbidden.has(support.id))safe=false;
        for(let y=p.y;y<=Math.floor(box.maxY-1e-6);y++)if(forbidden.has(read(x,y,z)))safe=false;
      }
      if(!safe||boxCollides(read,box)||unknown)continue;
      const unchanged=()=>{
        try { return owned()&&[...expected.values()].every(s=>world.cellUnchanged(s))&&owned(); }
        catch { return false; }
      };
      if(unchanged())return {position:Object.freeze({...p}),frame,unchanged};
    }
    return null;
  } catch { return null; }
}
