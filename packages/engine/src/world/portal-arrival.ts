import {replaceDimensionWorld,type DimensionWorldState,type DimensionId} from '../persistence/dimension-world';
import type {SaveData} from '../persistence/save';
import {readDimensionArchive} from '../persistence/dimension-save';
import {createDimensionGeneratedBlockProbe} from './dimension-probe';
import {WORLD_BORDER,type Vec3} from '../core/math';
import {WORLD_HEIGHT} from './chunk';
import {World,type BlockEdit,type WorldCellSnapshot} from './world';
import type {PortalRecord} from '../simulation/portals';
import {findPortalLanding,type PortalLanding} from './portal-landing';
import {AIR,blockId,tryBlockById} from '../catalog/blocks';
import {bodyBox,boxCollides} from '../simulation/physics';
import {canBuildAt,type GameMode} from './rules';
export interface PreparedPortalArrival {readonly world:World;readonly state:DimensionWorldState;readonly position:Readonly<Vec3>;readonly agentPosition:Readonly<Vec3>;readonly frame:Readonly<PortalRecord>;readonly created:boolean;readonly unchanged:()=>boolean}
const same=(a:PortalRecord,b:PortalRecord)=>a.axis===b.axis&&a.x===b.x&&a.y===b.y&&a.z===b.z&&a.width===b.width&&a.height===b.height;
/** Original bounded arrival policy. Only this newly allocated private World is changed.
 * No excavation: new frame/landing blocks replace Air only (existing Obsidian is reusable).
 * Searches at most25 columns across the fixed current height. This is not native search calibration.
 */
export function preparePortalArrival(input:DimensionWorldState,dimension:DimensionId,point:Vec3,linked?:PortalRecord,reserved:readonly PortalRecord[]=[],mode:GameMode="survival"):PreparedPortalArrival|null{
 try{
  if((mode!=='survival'&&mode!=='creative')||(dimension!=='overworld'&&dimension!=='nether')||![point.x,point.y,point.z].every(Number.isFinite)||Math.abs(point.x)>WORLD_BORDER||Math.abs(point.z)>WORLD_BORDER||point.y<0||point.y>=WORLD_HEIGHT)return null;
  const detached=replaceDimensionWorld({} as SaveData,input);
  if(readDimensionArchive({version:1,active:dimension,inactive:{},links:[]},detached,createDimensionGeneratedBlockProbe()).kind!=='valid')return null;
  const state=structuredClone(input),world=new World(state.seed,state.generatorVersion??1,dimension);
  world.importEdits(state.edits);
  if(world.gravelHarvests.restore(state.gravelHarvests).invalid||world.fires.restore(state.fire,state.edits).invalid||world.fluids.restore(state.fluids).invalid||world.portals.restore(state.portals,state.edits).invalid)return null;
  const finish=(landing:PortalLanding,created:boolean):PreparedPortalArrival|null=>{
   const p=landing.position,cells:WorldCellSnapshot[]=[];
   const get=(x:number,y:number,z:number)=>{const s=world.captureCell(x,y,z);if(!s)return undefined;cells.push(s);return s.id;};
   let agent:Vec3|null=null;
   for(const dz of [-1,0,1,-2,2])for(const dx of [-1,1,-2,2,0]){
    if(agent)continue;const x=Math.floor(p.x)+dx,z=Math.floor(p.z)+dz,y=p.y;
    if(x< -WORLD_BORDER||x>=WORLD_BORDER||z< -WORLD_BORDER||z>=WORLD_BORDER||Math.hypot(x+.5-p.x,z+.5-p.z)<.9)continue;
    const support=get(x,y-1,z),def=support===undefined?undefined:tryBlockById(support);
    if(!def?.solid||def.shape!=='cube'||def.collisionBox||get(x,y,z)!==AIR||get(x,y+1,z)!==AIR)continue;
    const box=bodyBox({x:x+.5,y,z:z+.5},.6,1);let unknown=false;
    if(boxCollides((a,b,c)=>{const id=get(a,b,c);if(id===undefined)unknown=true;return id??AIR;},box)||unknown)continue;
    agent={x,y,z};
   }
   if(!agent)return null;
   const unchanged=()=>landing.unchanged()&&!world.blockSourceLeaseBusy&&cells.every(s=>world.cellUnchanged(s));
   if(!unchanged())return null;
   const next:DimensionWorldState={...state,player:{...state.player,position:{...p}},edits:world.exportEdits(),portals:world.portals.exportState()};
   if(state.fire)next.fire=world.fires.exportState();if(state.fluids)next.fluids=world.fluids.exportState();if(state.gravelHarvests)next.gravelHarvests=world.gravelHarvests.exportState();
   if(readDimensionArchive({version:1,active:dimension,inactive:{},links:[]},next,createDimensionGeneratedBlockProbe()).kind!=="valid")return null;
   return Object.freeze({world,state:next,position:p,agentPosition:Object.freeze(agent),frame:landing.frame,created,unchanged});
  };
  const load=(f:PortalRecord)=>{
   const minX=Math.max(-WORLD_BORDER,f.x-4),maxX=Math.min(WORLD_BORDER,f.x+(f.axis==='x'?f.width:1)+4),minZ=Math.max(-WORLD_BORDER,f.z-4),maxZ=Math.min(WORLD_BORDER,f.z+(f.axis==='z'?f.width:1)+4);
   for(let cx=Math.floor(minX/16);cx<=Math.floor(maxX/16);cx++)for(let cz=Math.floor(minZ/16);cz<=Math.floor(maxZ/16);cz++)world.getBlock(Math.max(minX,cx*16),f.y,Math.max(minZ,cz*16));
  };
  const records=world.portals.exportState().records;
  if(linked){const frame=records.find(f=>same(f,linked));if(!frame)return null;load(frame);const landing=findPortalLanding(world,frame);return landing?finish(landing,false):null;}
  for(const frame of records.filter(f=>!reserved.some(r=>same(r,f))&&Math.hypot(f.x-point.x,f.z-point.z)<=128).sort((a,b)=>Math.hypot(a.x-point.x,a.z-point.z)-Math.hypot(b.x-point.x,b.z-point.z))){load(frame);const landing=findPortalLanding(world,frame);if(landing){const found=finish(landing,false);if(found)return found;}}
  if(!world.portals.hasCapacity())return null;
  const heights=Array.from({length:WORLD_HEIGHT-5},(_,i)=>i+2).sort((a,b)=>Math.abs(a-point.y)-Math.abs(b-point.y));
  const centerX=Math.max(-WORLD_BORDER+10,Math.min(WORLD_BORDER-10,Math.floor(point.x))),centerZ=Math.max(-WORLD_BORDER+10,Math.min(WORLD_BORDER-10,Math.floor(point.z))),obsidian=blockId('obsidian');
  for(const dx of [0,-4,4,-8,8])for(const dz of [0,-4,4,-8,8])for(const y of heights){
   const f:PortalRecord={axis:'x',x:centerX+dx,y,z:centerZ+dz,width:2,height:3},edits=new Map<string,BlockEdit>(),expected=new Map<string,WorldCellSnapshot>();let valid=true;
   const place=(x:number,by:number,z:number,id:number,platform=false)=>{
    const current=world.getBlock(x,by,z),s=world.captureCell(x,by,z);if(!s){valid=false;return;}
    const k=`${x},${by},${z}`;expected.set(k,s);
    if(platform&&current!==AIR){const def=tryBlockById(current);if(!def?.solid||def.shape!=='cube'||def.collisionBox||current===blockId('lava')||current===blockId('fire'))valid=false;return;}
    if(current!==AIR&&current!==id){valid=false;return;}
    if(current!==id){if(!canBuildAt(world,mode,x,by,z)){valid=false;return;}edits.set(k,[x,by,z,id]);}
   };
   for(let u=-1;u<=2;u++)for(let side=-1;side<=1;side++)place(f.x+u,y-1,f.z+side,obsidian,true);
   for(let u=0;u<2;u++){place(f.x+u,y-1,f.z,obsidian);place(f.x+u,y+3,f.z,obsidian);for(let v=0;v<3;v++)place(f.x+u,y+v,f.z,192);}
   for(let v=0;v<3;v++){place(f.x-1,y+v,f.z,obsidian);place(f.x+2,y+v,f.z,obsidian);}
   for(const side of [-1,1])for(let u=-1;u<=2;u++)for(let v=0;v<2;v++){const id=world.getBlock(f.x+u,y+v,f.z+side),s=world.captureCell(f.x+u,y+v,f.z+side);if(id!==AIR||!s)valid=false;else expected.set(`${s.x},${s.y},${s.z}`,s);}
   if(!valid)continue;
   if(!world.commitBlockBatch([...edits.values()],()=>world.portals.commit(f),[...expected.values()],()=>world.portals.hasCapacity()))continue;
   const landing=findPortalLanding(world,f);return landing?finish(landing,true):null;
  }
  return null;
 }catch{return null;}
}
