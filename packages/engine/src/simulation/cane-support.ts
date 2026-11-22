import {AIR,blockId} from '../catalog/blocks';
import {CANE_PLANT_ID,SUGAR_CANE_ITEM_ID} from '../catalog/cane-profile';
import {CHUNK_SIZE,WORLD_HEIGHT} from '../world/chunk';
import type {World,WorldCellSnapshot,BlockEdit} from '../world/world';
import type {DropSink} from '../ownership/world-drops';

const SOIL=new Set([blockId('sand'),blockId('dirt'),blockId('grass')]);
const WATER=blockId('water');
export const CANE_SUPPORT_INTERVAL=.1;
export const CANE_SUPPORT_BATCH_LIMIT=256;
export type CaneSupportResult='absent'|'unknown'|'supported'|'refused'|'released';
interface Column {
 root:readonly[number,number,number];cells:readonly WorldCellSnapshot[];
 expected:readonly WorldCellSnapshot[];support:'unknown'|'supported'|'unsupported';
}
/** All reads are loaded-only. Unknown water cannot prove invalidity; a known water source proves support. */
function inspect(world:World,x:number,y:number,z:number):Column|'unknown'|null {
 if(![x,y,z].every(Number.isSafeInteger)||y<0||y>=WORLD_HEIGHT)return null;
 const first=world.getLoadedBlock(x,y,z);if(first===undefined)return'unknown';if(first!==CANE_PLANT_ID)return null;
 let base=y;while(base>0&&world.getLoadedBlock(x,base-1,z)===CANE_PLANT_ID)base--;
 const cells:WorldCellSnapshot[]=[],expected:WorldCellSnapshot[]=[];
 for(let by=base;by<WORLD_HEIGHT&&world.getLoadedBlock(x,by,z)===CANE_PLANT_ID;by++){
  const cell=world.captureCell(x,by,z);if(!cell||cell.id!==CANE_PLANT_ID)return'unknown';cells.push(Object.freeze(cell));
 }
 expected.push(...cells);const root=Object.freeze([x,base,z]as const);
 if(base===0)return{root,cells:Object.freeze(cells),expected:Object.freeze(expected),support:'unsupported'};
 const soil=world.captureCell(x,base-1,z);if(!soil)return'unknown';expected.push(Object.freeze(soil));
 if(!SOIL.has(soil.id))return{root,cells:Object.freeze(cells),expected:Object.freeze(expected),support:'unsupported'};
 let water=false,unknown=false;
 for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){
  const cell=world.captureCell(x+dx,base-1,z+dz);if(!cell){unknown=true;continue;}
  expected.push(Object.freeze(cell));if(cell.id===WATER)water=true;
 }
 return{root,cells:Object.freeze(cells),expected:Object.freeze(expected),support:water?'supported':unknown?'unknown':'unsupported'};
}
/** Complete natural release. False/throw/reentry never removes source or wears any actor's tool. */
export function settleUnsupportedCane(world:World,sink:DropSink,x:number,y:number,z:number):CaneSupportResult {
 if(world.blockSourceLeaseBusy)return'refused';const column=inspect(world,x,y,z);
 if(column===null)return'absent';if(column==='unknown'||column.support==='unknown')return'unknown';if(column.support==='supported')return'supported';
 const edits:BlockEdit[]=column.cells.map(c=>[c.x,c.y,c.z,AIR]);
 const lease=world.reserveBlockBatch(edits);if(!lease)return'refused';
 const valid=()=>lease.valid()&&column.expected.every(c=>world.cellUnchanged(c));
 try{
  if(!valid())return'refused';
  const items=Object.freeze(column.cells.map(()=>Object.freeze({id:SUGAR_CANE_ITEM_ID,count:1})));
  const at=Object.freeze({x:column.root[0]+.5,y:column.root[1]+.5,z:column.root[2]+.5});
  const batch=sink(items,at);if(!batch||!valid()||batch.commit()!==true)return'refused';
  return lease.commit()?'released':'refused';
 }catch{return'refused';}finally{lease.release();}
}

/** Original loaded-area .1s settlement model, not native timing/growth calibration. Queues reconstruct from cells. */
export class CaneSupportSystem {
 private readonly pending=new Set<string>();private readonly chunks=new Set<string>();
 private readonly unsubscribe:readonly (()=>void)[];private elapsed=0;private updating=false;private disposed=false;
 constructor(private readonly world:World,private readonly sink:DropSink){
  for(const[cx,cz]of world.loadedChunkCoordinates())this.chunks.add(`${cx},${cz}`);
  for(const[x,y,z,id]of world.exportEdits())if(id===CANE_PLANT_ID)this.pending.add(`${x},${y},${z}`);
  this.unsubscribe=[world.onChunkChanged((cx,cz)=>{if(world.hasChunk(cx,cz))this.chunks.add(`${cx},${cz}`);}),world.onBlockChanged((x,y,z)=>{
   for(const[dx,dy,dz]of[[0,0,0],[0,1,0],[1,1,0],[-1,1,0],[0,1,1],[0,1,-1]]){
    const by=y+dy;if(by>=0&&by<WORLD_HEIGHT&&world.getLoadedBlock(x+dx,by,z+dz)===CANE_PLANT_ID)this.pending.add(`${x+dx},${by},${z+dz}`);
   }
  })];
 }
 dispose():void{if(this.disposed)return;this.disposed=true;for(const stop of this.unsubscribe)stop();this.pending.clear();this.chunks.clear();}
 update(dt:number):void{
  if(this.disposed||this.updating||this.world.blockSourceLeaseBusy||!Number.isFinite(dt)||dt<0||dt>86400)return;
  this.elapsed=Math.min(1,this.elapsed+dt);if(this.elapsed+1e-9<CANE_SUPPORT_INTERVAL)return;this.elapsed=0;this.updating=true;
  try{
   // One detached loaded chunk per settlement; nearby real edits queue directly without waiting for this scan.
   const next=this.chunks.values().next().value as string|undefined;
   if(next!==undefined){this.chunks.delete(next);const[cx,cz]=next.split(',').map(Number);
    if(this.world.hasChunk(cx,cz))for(let x=cx*CHUNK_SIZE;x<(cx+1)*CHUNK_SIZE;x++)for(let z=cz*CHUNK_SIZE;z<(cz+1)*CHUNK_SIZE;z++)for(let y=0;y<WORLD_HEIGHT;y++)if(this.world.getLoadedBlock(x,y,z)===CANE_PLANT_ID)this.pending.add(`${x},${y},${z}`);
   }
   const candidates=[...this.pending];this.pending.clear();const seen=new Set<string>();
   for(let i=0;i<candidates.length;i++){
    if(this.disposed)break;
    const key=candidates[i];if(i>=CANE_SUPPORT_BATCH_LIMIT){this.pending.add(key);continue;}
    const[x,y,z]=key.split(',').map(Number),column=inspect(this.world,x,y,z);
    if(column===null)continue;if(column==='unknown'){this.pending.add(key);continue;}
    const rootKey=column.root.join(',');if(seen.has(rootKey))continue;seen.add(rootKey);
    if(column.support==='supported')continue;
    const result=settleUnsupportedCane(this.world,(items,at,velocity)=>{
     if(this.disposed)return null;
     const batch=this.sink(items,at,velocity);
     return batch?{commit:()=>!this.disposed&&batch.commit()}:null;
    },...column.root);
    if(this.disposed)break;
    if(result==='unknown'||result==='refused')this.pending.add(rootKey);
   }
  }finally{this.updating=false;}
 }
}
