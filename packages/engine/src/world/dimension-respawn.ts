import {replaceDimensionWorld,type DimensionWorldState} from '../persistence/dimension-world';
import type {SaveData} from '../persistence/save';
import {readDimensionArchive} from '../persistence/dimension-save';
import {createDimensionGeneratedBlockProbe} from './dimension-probe';
import {WORLD_BORDER,type Vec3} from '../core/math';
import {WORLD_HEIGHT} from './chunk';
import {World,type WorldCellSnapshot} from './world';
import {AIR,blockId,isKnownBlockId,tryBlockById} from '../catalog/blocks';
import {bodyBox,boxCollides} from '../simulation/physics';
export interface PreparedOverworldRespawn {readonly world:World;readonly state:DimensionWorldState;readonly position:Readonly<Vec3>;readonly agentPosition:Readonly<Vec3>;readonly unchanged:()=>boolean}
const columns=[0,-4,4,-8,8] as const;
const forbidden=new Set([blockId('water'),blockId('lava'),blockId('fire'),192,193]);
/** Original application origin search:25 columns, current fixed world height, no excavation,
 * platform or portal creation. The private World may perform existing cold-fluid reconciliation.
 * This is not native bed/world-spawn selection or height calibration. */
export function prepareOverworldRespawn(input:DimensionWorldState):PreparedOverworldRespawn|null{
 try{
  const detached=replaceDimensionWorld({} as SaveData,input),probe=createDimensionGeneratedBlockProbe();
  if(readDimensionArchive({version:1,active:'overworld',inactive:{},links:[]},detached,probe).kind!=='valid')return null;
  const state=structuredClone(input),world=new World(state.seed,state.generatorVersion??1,'overworld');
  world.importEdits(state.edits,state.composters);
  if(world.gravelHarvests.restore(state.gravelHarvests).invalid||world.fires.restore(state.fire,state.edits).invalid||world.fluids.restore(state.fluids).invalid||world.portals.restore(state.portals,state.edits).invalid)return null;
  // Explicit bounded generation belongs to preparation, never to the later validity guard.
  for(const x of [-10,0])for(const z of [-10,0])world.getBlock(x,1,z);
  if(world.blockSourceLeaseBusy)return null;
  const safe=(p:Vec3,height:number,cells:Map<string,WorldCellSnapshot>):boolean=>{
   const box=bodyBox(p,.6,height);if(box.minX< -WORLD_BORDER||box.maxX>WORLD_BORDER||box.minZ< -WORLD_BORDER||box.maxZ>WORLD_BORDER||box.minY<1||box.maxY>WORLD_HEIGHT)return false;
   let unknown=false;
   const read=(x:number,y:number,z:number):number=>{
    const key=`${x},${y},${z}`;let cell=cells.get(key);
    if(!cell){cell=world.captureCell(x,y,z);if(!cell||!isKnownBlockId(cell.id)){unknown=true;return AIR;}cells.set(key,cell);}return cell.id;
   };
   let valid=true;
   for(let x=Math.floor(box.minX+1e-6);x<=Math.floor(box.maxX-1e-6);x++)for(let z=Math.floor(box.minZ+1e-6);z<=Math.floor(box.maxZ-1e-6);z++){
    const support=tryBlockById(read(x,p.y-1,z));if(!support?.solid||support.shape!=='cube'||support.collisionBox||support.name.endsWith('_leaves')||forbidden.has(support.id))valid=false;
    // Keep a full two-cell head clearance for both actors, even though the Agent is shorter.
    for(let y=p.y;y<=p.y+1;y++)if(forbidden.has(read(x,y,z)))valid=false;
   }
   return valid&&!boxCollides(read,bodyBox(p,.6,Math.max(1.8,height)))&&!unknown;
  };
  for(const x of columns)for(const z of columns)for(let y=WORLD_HEIGHT-2;y>=1;y--){
   const p={x:x+.5,y,z:z+.5},playerCells=new Map<string,WorldCellSnapshot>();if(!safe(p,1.8,playerCells))continue;
   for(const dz of [-1,0,1,-2,2])for(const dx of [-1,1,-2,2,0]){
    if(Math.hypot(dx,dz)<.9)continue;
    const agent={x:x+dx,y,z:z+dz},cells=new Map(playerCells);
    if(!safe({x:agent.x+.5,y:agent.y,z:agent.z+.5},1,cells))continue;
    const unchanged=()=>{try{return !world.blockSourceLeaseBusy&&[...cells.values()].every(s=>world.cellUnchanged(s));}catch{return false;}};
    if(!unchanged())continue;
    const next:DimensionWorldState={...state,player:{...state.player,position:{...p}},edits:world.exportEdits()};
    if(state.portals!==undefined)next.portals=world.portals.exportState();if(state.fire!==undefined)next.fire=world.fires.exportState();if(state.fluids!==undefined)next.fluids=world.fluids.exportState();if(state.gravelHarvests!==undefined)next.gravelHarvests=world.gravelHarvests.exportState();
    if(readDimensionArchive({version:1,active:'overworld',inactive:{},links:[]},next,probe).kind!=='valid'||!unchanged())return null;
    return Object.freeze({world,state:next,position:Object.freeze(p),agentPosition:Object.freeze(agent),unchanged});
   }
  }
  return null;
 }catch{return null;}
}
