import { WORLD_BORDER, type Vec3 } from "../core/math";
import { WORLD_HEIGHT } from "../world/chunk";
import { AIR, blockById } from "../catalog/blocks";
import { stackId } from "../catalog/items";
import { canBuildAt, type GameMode } from "../world/rules";
import type { World } from "../world/world";
import type { Inventory } from "../ownership/inventory";

export const CAMERA_SECONDS = 5;
export const CAMERA_LIMIT = 32;
export interface PlacedCamera { key: number; x: number; y: number; z: number }
export interface CameraViewState extends PlacedCamera { remaining: number | null }
export interface CamerasData { version: 1; nextKey: number; records: PlacedCamera[] }
const plain = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && [Object.prototype,null].includes(Object.getPrototypeOf(x));
const exact = (x: Record<string, unknown>, keys: string[]) => Reflect.ownKeys(x).length===keys.length && keys.every(k => {const d=Object.getOwnPropertyDescriptor(x,k);return !!d&&d.enumerable&&"value"in d;});
export function readCameras(raw: unknown): CamerasData | null {
  if (raw === undefined) return { version: 1, nextKey: 1, records: [] };
  if (!plain(raw) || !exact(raw,["version","nextKey","records"]) || raw.version !== 1 || !Number.isSafeInteger(raw.nextKey) || (raw.nextKey as number) < 1 || !Array.isArray(raw.records) || raw.records.length > CAMERA_LIMIT || Reflect.ownKeys(raw.records).length!==raw.records.length+1) return null;
  const keys=new Set<number>(), cells=new Set<string>(), records:PlacedCamera[]=[];
  for(let i=0;i<raw.records.length;i++) {
    const entry=Object.getOwnPropertyDescriptor(raw.records,String(i));if(!entry||!("value"in entry))return null;const r:unknown=entry.value;
    if(!plain(r)||!exact(r,["key","x","y","z"])||![r.key,r.x,r.y,r.z].every(Number.isSafeInteger))return null;
    const p=r as unknown as PlacedCamera,cell=`${p.x},${p.y},${p.z}`;
    if(p.key<1||p.key>=(raw.nextKey as number)||keys.has(p.key)||cells.has(cell)||Math.abs(p.x)>=WORLD_BORDER||Math.abs(p.z)>=WORLD_BORDER||p.y<0||p.y>=WORLD_HEIGHT)return null;
    keys.add(p.key);cells.add(cell);records.push({...p});
  }
  return {version:1,nextKey:raw.nextKey as number,records};
}
/** Local policy: five active-play seconds; pause/UI freezes, cold load restores idle.
 * No timers/callbacks outlive the store. Countdown is deliberately not serialized. */
export class CameraStore {
  private data:CamerasData; private countdown=new Map<number,number>(); private disposed=false; private capturing=false; private placing=false;
  readonly loadIssues:boolean;
  constructor(raw?:unknown){const data=readCameras(raw);this.loadIssues=!data;this.data=data??{version:1,nextKey:1,records:[]};}
  get busy():boolean{return this.capturing||this.placing;}
  get records():CameraViewState[]{return this.data.records.map(r=>({...r,remaining:this.countdown.get(r.key)??null}));}
  toJSON():CamerasData{if(this.loadIssues||this.capturing||this.placing)throw Error("Unresolved Camera ownership");return structuredClone(this.data);}
  place(world:World,inventory:Inventory,mode:GameMode,p:Vec3,player:Vec3):boolean {
    if(this.disposed||this.capturing||this.placing||this.loadIssues)return false;
    this.placing=true;try{return this.placeOwned(world,inventory,mode,p,player);}finally{this.placing=false;}
  }
  private placeOwned(world:World,inventory:Inventory,mode:GameMode,p:Vec3,player:Vec3):boolean {
    if(this.disposed||this.capturing||this.loadIssues||inventory.busy||this.data.records.length>=CAMERA_LIMIT||this.data.nextKey>=Number.MAX_SAFE_INTEGER)return false;
    const x=p.x,y=p.y,z=p.z;
    const selected=inventory.selected,slots=inventory.slots,held=slots[selected];
    const slotDescriptor=Object.getOwnPropertyDescriptor(slots,String(selected));
    if(!slotDescriptor||!("value"in slotDescriptor)||!slotDescriptor.writable)return false;
    if(selected<0||selected>=9||!Number.isInteger(selected)||!held||held.id!==stackId("camera")||held.count!==1||Object.keys(held).some(k=>k!=="id"&&k!=="count")||Object.isFrozen(held)||Object.isFrozen(slots))return false;
    if(![x,y,z].every(Number.isInteger)||Math.abs(x)>=WORLD_BORDER||Math.abs(z)>=WORLD_BORDER||y<1||y>=WORLD_HEIGHT)return false;
    if(this.data.records.some(r=>r.x===x&&r.y===y&&r.z===z)||Math.abs(player.x-(x+.5))<.8&&Math.abs(player.z-(z+.5))<.8&&Math.abs(player.y-y)<1.8)return false;
    const worldVersion=world.blockMutationVersion;
    const empty=world.getLoadedBlock(x,y,z),support=world.getLoadedBlock(x,y-1,z);
    if(empty!==AIR||support===undefined||!blockById(support).solid&&blockById(support).solid!==undefined||support===AIR||!canBuildAt(world,mode,x,y,z))return false;
    if(inventory.slots!==slots||inventory.selected!==selected||world.blockMutationVersion!==worldVersion||slots[selected]!==held||held.id!==stackId("camera")||held.count!==1||this.disposed||this.capturing)return false;
    // All world/permission/owner reads above may call observers. Revalidate the
    // captured destination last, with no callbacks between this check and commit.
    const sourceDescriptors=Object.getOwnPropertyDescriptors(held);
    if(Reflect.ownKeys(sourceDescriptors).length!==2||!["id","count"].every(k=>{const d=sourceDescriptors[k];return !!d&&d.enumerable&&"value"in d;})||sourceDescriptors.id.value!==stackId("camera")||sourceDescriptors.count.value!==1)return false;
    const destination=Object.getOwnPropertyDescriptor(slots,String(selected));
    if(!destination||!("value"in destination)||!destination.writable||destination.value!==held)return false;
    this.data.records.push({key:this.data.nextKey++,x,y,z});if(mode==="survival")slots[selected]=null;return true;
  }
  captureCheckpoint(key:number):CamerasData{if(!this.capturing||this.countdown.get(key)!==0)throw Error("No Camera capture lease");return{...structuredClone(this.data),records:this.data.records.filter(r=>r.key!==key).map(r=>({...r}))};}
  activate(key:number):boolean {if(this.disposed||this.capturing||this.placing||this.loadIssues||this.countdown.has(key)||!this.data.records.some(r=>r.key===key))return false;this.countdown.set(key,CAMERA_SECONDS);return true;}
  update(dt:number,capture:(camera:PlacedCamera)=>boolean):void {
    if(this.disposed||this.capturing||this.placing||this.loadIssues||!Number.isFinite(dt)||dt<=0)return;
    for(const r of [...this.data.records]){
      const left=this.countdown.get(r.key);if(left===undefined)continue;
      const remaining=Math.max(0,left-dt),next=remaining<=1e-9?0:remaining;this.countdown.set(r.key,next);if(next>0)continue;
      this.capturing=true;let ok=false;try{ok=capture({...r})===true;}catch{/* Retain failed Camera for an explicit retry. */}finally{this.capturing=false;}
      this.countdown.delete(r.key);if(ok)this.data.records=this.data.records.filter(q=>q.key!==r.key);
      if(this.disposed)return;
    }
  }
  dispose():void{this.disposed=true;this.countdown.clear();}
}
/** Physical camera box, independent from terrain; nearer terrain/actors must occlude it. */
export function raycastCameras(eye:Vec3,dir:Vec3,records:readonly PlacedCamera[],reach:number):{key:number;distance:number}|null{
  let best:{key:number;distance:number}|null=null;
  for(const r of records){let near=0,far=reach;for(const axis of ["x","y","z"]as const){const lo=r[axis]+(axis==="y"?0:.15),hi=r[axis]+(axis==="y"?1.1:.85),v=dir[axis];if(Math.abs(v)<1e-9){if(eye[axis]<lo||eye[axis]>hi){far=-1;break;}}else{const a=(lo-eye[axis])/v,b=(hi-eye[axis])/v;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}}if(near<=far&&near>=0&&(!best||near<best.distance))best={key:r.key,distance:near};}
  return best;
}
