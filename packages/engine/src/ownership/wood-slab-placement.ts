import{cloneStack}from './stack';
import{WORLD_HEIGHT}from '../world/chunk';
import{ownedCargoFingerprint}from './owned-placement-cargo';
import{AIR,blockId,tryBlockById}from'../catalog/blocks';
import{woodSlabState,type SlabHalf}from'../catalog/wood-slabs';
import{boxIntersectsBlockGeometry}from'../catalog/block-geometry';
import{bodyBox}from'../simulation/physics';
import type{Vec3}from'../core/math';
import type{World,WorldCellSnapshot,BlockEdit}from'../world/world';
import{writablePlacementCell}from'../world/placement-bounds';
import{Inventory,type ItemStack}from'./inventory';
import{inspectWoodSlabItemOwner}from'./wood-slab-items';
import{labCanonical}from'./lab-inventory-snapshot';
import{reserveInventoryMutation}from'./inventory-lease';
import type{AgentState}from'../automation/agent';
export interface WoodSlabHit{x:number;y:number;z:number;normal:Vec3;id?:number}
export interface WoodSlabPlan{edits:readonly BlockEdit[];expected:readonly WorldCellSnapshot[]}
const data=(o:object,key:string)=>{const d=Object.getOwnPropertyDescriptor(o,key);if(!d?.enumerable||!('value'in d))throw Error('Unreadable slab placement field');return d.value;};
function vector(raw:Vec3):Vec3{if(!raw||typeof raw!=='object'||Reflect.ownKeys(raw).length!==3)throw Error('Missing actor position');const out={x:data(raw,'x'),y:data(raw,'y'),z:data(raw,'z')};if(!Object.values(out).every(Number.isFinite))throw Error('Invalid actor position');structuredClone(raw);return out;}
export interface WoodSlabActor{feet:Vec3;height?:number}
function actorData(actor:WoodSlabActor):{feet:Vec3;height:number}{const feet=vector(data(actor,'feet')),d=Object.getOwnPropertyDescriptor(actor,'height');if(d&&(!d.enumerable||!('value'in d)))throw Error('Unreadable actor height');const height=d?.value??1.8;if(typeof height!=='number'||!Number.isFinite(height)||height<=0||height>WORLD_HEIGHT)throw Error('Invalid actor height');return{feet,height};}
/** Loaded-only expected-cell plan; no terrain generation or item mutation. */
export function planWoodSlabPlacement(world:World,canonical:number,mode:'survival'|'creative',x:number,y:number,z:number,half:SlabHalf,actors:readonly{feet:Vec3;height?:number}[]):WoodSlabPlan|null{
 try{if(world.blockSourceLeaseBusy||!writablePlacementCell(x,y,z)||!['survival','creative'].includes(mode)||half!=='lower'&&half!=='upper')return null;
 const state=woodSlabState(canonical);if(!state||state.id!==state.canonical)return null;
 const expected:WorldCellSnapshot[]=[],target=world.captureCell(x,y,z);if(!target)return null;expected.push(target);const here=woodSlabState(target.id);
 let placed:number;
 if(here){if(here.canonical!==canonical||here.half==='double'||here.half===half)return null;placed=canonical+2;}
 else{if(target.id!==AIR&&!tryBlockById(target.id)?.replaceable)return null;placed=canonical+(half==='upper'?1:0);}
 if(mode==='survival')for(let by=y-1;by>=0;by--){const permission=world.captureCell(x,by,z);if(!permission)return null;expected.push(permission);if(permission.id===blockId('deny'))return null;if(permission.id===blockId('allow'))break;}
 const prospective=(bx:number,by:number,bz:number)=>bx===x&&by===y&&bz===z?placed:world.getLoadedBlock(bx,by,bz)??AIR;
 for(const actor of actors){const{feet,height}=actorData(actor);if(boxIntersectsBlockGeometry(prospective,bodyBox(feet,.6,height),x,y,z,placed))return null;}
 return{edits:[[x,y,z,placed]],expected};}catch{return null;}
}

function owned(world:World,owner:Inventory|AgentState,mode:'survival'|'creative',x:number,y:number,z:number,half:SlabHalf,actors:readonly{feet:Vec3;height?:number}[],lifecycleValid:()=>boolean,extraExpected:readonly WorldCellSnapshot[]=[]):boolean{
 if(world.blockSourceLeaseBusy)return false;const lease=reserveInventoryMutation(owner);if(!lease)return false;let committed=false;
 try{const snapshot=()=>ownedCargoFingerprint(owner,lease.slots),before=snapshot(),index=data(owner,'selected'),cell=Object.getOwnPropertyDescriptor(lease.slots,String(index));if(!cell||!('value'in cell)||!cell.writable)return false;const source=cell.value as ItemStack|null;if(!source||inspectWoodSlabItemOwner(source).kind!=='valid')return false;const canonical=source.id,replacement=mode==='survival'?(source.count===1?null:cloneStack(source,source.count-1)):source,staged=lease.prepare(index,replacement);if(!staged)return false;
 const plan=planWoodSlabPlacement(world,canonical,mode,x,y,z,half,actors);if(!plan)return false;const actorBefore=actors.map(a=>labCanonical(actorData(a)));
 const valid=()=>lifecycleValid()&&lease.valid()&&staged.valid()&&data(owner,'selected')===index&&Object.getOwnPropertyDescriptor(lease.slots,String(index))?.value===source&&snapshot()===before&&actors.length===actorBefore.length&&actors.every((a,i)=>labCanonical(actorData(a))===actorBefore[i]);
 world.commitBlockBatch(plan.edits,()=>{if(mode==='survival')staged.commit();else lease.cancel();committed=true;},[...plan.expected,...extraExpected],valid);return committed;
 }catch{return committed;}finally{lease.cancel();}
}
/** Safe default-lower dispatch for generic engine/player placement without a ray hit. */
export function placeWoodSlabAt(world:World,inventory:Inventory,mode:'survival'|'creative',x:number,y:number,z:number,feet:Vec3,half:SlabHalf='lower',lifecycleValid:()=>boolean=()=>true,additionalActors:readonly WoodSlabActor[]=[]):boolean{return owned(world,inventory,mode,x,y,z,half,[{feet},...additionalActors],lifecycleValid);}
/** Actual hitLocalY is world ray hitY minus clicked cellY; exact .5 chooses upper. */
export function useOwnedWoodSlab(world:World,inventory:Inventory,mode:'survival'|'creative',hit:WoodSlabHit,hitLocalY:number,feet:Vec3,lifecycleValid:()=>boolean=()=>true,additionalActors:readonly WoodSlabActor[]=[]):boolean{
 try{if(!Number.isFinite(hitLocalY)||hitLocalY<0||hitLocalY>1)return false;for(const key of Reflect.ownKeys(hit)){if(typeof key!=='string'||!['x','y','z','normal','id','distance'].includes(key))return false;data(hit,key);}const x=data(hit,'x'),y=data(hit,'y'),z=data(hit,'z'),normal=vector(data(hit,'normal'));structuredClone(hit);if(![normal.x,normal.y,normal.z].every(Number.isInteger)||Math.abs(normal.x)+Math.abs(normal.y)+Math.abs(normal.z)!==1)return false;const clicked=world.captureCell(x,y,z);if(!clicked)return false;const id=Object.getOwnPropertyDescriptor(hit,'id');if(id&&(!('value'in id)||id.value!==clicked.id))return false;const selected=data(inventory,'selected'),slots=data(inventory,'slots'),source=Object.getOwnPropertyDescriptor(slots,String(selected))?.value as ItemStack|null;if(inspectWoodSlabItemOwner(source).kind!=='valid')return false;const state=woodSlabState(clicked.id),canonical=Object.getOwnPropertyDescriptor(source!,'id')!.value;
 if(state&&state.canonical===canonical&&(state.half==='lower'&&normal.y===1||state.half==='upper'&&normal.y===-1))return owned(world,inventory,mode,x,y,z,state.half==='lower'?'upper':'lower',[{feet},...additionalActors],lifecycleValid,[clicked]);
 const half:SlabHalf=normal.y===1?'lower':normal.y===-1?'upper':hitLocalY>=.5?'upper':'lower';return owned(world,inventory,mode,x+normal.x,y+normal.y,z+normal.z,half,[{feet},...additionalActors],lifecycleValid,[clicked]);
 }catch{return false;}
}
/** Agent owns exactly27 slots; no temporary Inventory or ambient selected debit. */
export function placeAgentWoodSlabAt(world:World,agent:AgentState,x:number,y:number,z:number,playerFeet?:Vec3,lifecycleValid:()=>boolean=()=>true):boolean{try{return owned(world,agent,'survival',x,y,z,'lower',[{feet:{x:data(agent,'x')+.5,y:data(agent,'y'),z:data(agent,'z')+.5},height:1},...(playerFeet?[{feet:playerFeet}]:[])],lifecycleValid);}catch{return false;}}
