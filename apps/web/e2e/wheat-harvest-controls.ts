/** Artifact episode control policy only: never mutates Game, terrain, item ownership or RNG. */
export async function holdUntilCropAir(control:{press():Promise<unknown>;waitForAir():Promise<unknown>;release():Promise<unknown>}):Promise<void>{
 try{await control.press();await control.waitForAir();}finally{await control.release();}
}
export interface PickupSafety{health:number;dead:boolean;onGround:boolean;playerY:number;dropY:number;terrainClear:boolean}
export function pickupPulseMilliseconds(distance:number,safety:PickupSafety,expectedY:number,initialHealth:number):number{
 if(!Number.isFinite(distance)||distance<0||!Number.isFinite(safety.health)||safety.dead||safety.health<initialHealth||safety.health<8||!safety.onGround||
  !Number.isFinite(safety.playerY)||Math.abs(safety.playerY-expectedY)>.15||!Number.isFinite(safety.dropY)||Math.abs(safety.dropY-expectedY)>.25||!safety.terrainClear)throw Error('Unsafe actual Wheat pickup observation; no blind movement');
 if(distance<=.4)return 0;
 return Math.max(8,Math.min(70,(distance-.4)/4.317*1000*.35));
}

import{blockCollisionBoxes,bodyBox,boxCollides,isFluidBlock,PLAYER_WIDTH,PLAYER_HEIGHT,type Vec3}from'@craft/engine';
export type PickupCell=readonly[x:number,y:number,z:number,id:number|null];
/** Controlled fixture corridor only. Plane comes from the original floor row, not floor(actualFeetY).
 * Witnessed loaded floor identity AND actual collision top bind each proposed footprint.
 * No position is written: future surface heights only decide whether a real input pulse is safe. */
export function loadedPickupCorridorClear(cells:readonly PickupCell[],floorWitness:readonly PickupCell[],player:Vec3,drop:Vec3,expectedPlane:number):boolean{
 try{
  if(!Number.isSafeInteger(expectedPlane)||![player.x,player.y,player.z,drop.x,drop.y,drop.z].every(Number.isFinite)||Math.abs(player.y-expectedPlane)>.15)return false;
  const key=(x:number,y:number,z:number)=>`${x},${y},${z}`,actual=new Map(cells.map(c=>[key(c[0],c[1],c[2]),c[3]])),original=new Map(floorWitness.map(c=>[key(c[0],c[1],c[2]),c[3]]));
  const get=(x:number,y:number,z:number)=>{const id=actual.get(key(x,y,z));if(id===null||id===undefined||isFluidBlock(id))throw Error('Unknown or liquid corridor');return id;};
  const dx=drop.x-player.x,dz=drop.z-player.z,distance=Math.hypot(dx,dz),step=Math.min(.45,distance),half=PLAYER_WIDTH/2,soilY=expectedPlane-1;
  for(let i=0;i<=6;i++){
   const fraction=i/6*step/Math.max(.001,distance),x=player.x+dx*fraction,z=player.z+dz*fraction;let highest=-Infinity;
   for(let bx=Math.floor(x-half+1e-6);bx<=Math.floor(x+half-1e-6);bx++)for(let bz=Math.floor(z-half+1e-6);bz<=Math.floor(z+half-1e-6);bz++){
    const id=get(bx,soilY,bz);if(original.get(key(bx,soilY,bz))!==id)return false;
    // Require a supported top under the entire overlapping portion of this footprint.
    const left=Math.max(x-half,bx),right=Math.min(x+half,bx+1),near=Math.max(z-half,bz),far=Math.min(z+half,bz+1);
    const tops=blockCollisionBoxes(get,bx,soilY,bz,id).filter(b=>bx+b[0]<=left+1e-6&&bx+b[3]>=right-1e-6&&bz+b[2]<=near+1e-6&&bz+b[5]>=far-1e-6).map(b=>soilY+b[4]);
    if(!tops.length)return false;const top=Math.max(...tops);if(Math.abs(top-expectedPlane)>.15)return false;highest=Math.max(highest,top);
   }
   if(!Number.isFinite(highest)||i===0&&(Math.abs(player.y-highest)>.03||boxCollides(get,bodyBox(player))))return false;
   if(boxCollides(get,bodyBox({x,y:highest+1e-5,z},PLAYER_WIDTH,PLAYER_HEIGHT)))return false;
  }
  return true;
 }catch{return false;}
}
