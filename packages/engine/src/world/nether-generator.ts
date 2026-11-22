import { blockId, blockById } from "../catalog/blocks";
import { hash3 } from "../core/random";
import { WORLD_BORDER } from "../core/math";
import { CHUNK_SIZE, Chunk, WORLD_HEIGHT } from "./chunk";
import { SimplexNoise } from "./noise";

export interface NetherFortress {
 readonly x:number; readonly y:number; readonly z:number;
 readonly minX:number; readonly maxX:number; readonly minZ:number; readonly maxZ:number;
 readonly wartBed:Readonly<{x:number;y:number;z:number;width:3;depth:3}>;
 readonly blazeVolume:Readonly<{minX:number;maxX:number;minY:number;maxY:number;minZ:number;maxZ:number}>;
}
export interface NetherSpawn { readonly x:number;readonly y:number;readonly z:number }
const B={rack:blockId("netherrack"),sand:blockId("soul_sand"),brick:blockId("nether_bricks"),wart:blockId("nether_wart_3"),bedrock:blockId("bedrock"),lava:blockId("lava"),glow:blockId("glowstone")};
const valid=(x:number,z:number)=>Number.isSafeInteger(x)&&Number.isSafeInteger(z)&&Math.abs(x)<=WORLD_BORDER&&Math.abs(z)<=WORLD_BORDER;
/** Bounded app Nether v1, using the unchanged96-high chunk format. All geometry/rates are app choices. */
export class NetherGenerator {
 readonly dimension="nether" as const;
 private readonly floorNoise:SimplexNoise;
 private readonly roofNoise:SimplexNoise;
 private readonly caveNoise:SimplexNoise;
 constructor(readonly seed:number,readonly version:1=1){
  if(version!==1)throw new RangeError("Unsupported Nether generator version");
  this.floorNoise=new SimplexNoise(seed^0x4e455448);this.roofNoise=new SimplexNoise(seed^0x524f4f46);this.caveNoise=new SimplexNoise(seed^0x43415645);
 }
 /** Diagnostic candidate cavern floor, NOT an open-sky surface or a safe spawn guarantee. */
 heightAt(x:number,z:number):number{return 25+Math.floor(this.floorNoise.fbm2(x/85,z/85,3)*13)+(this.roofNoise.noise2(x/48,z/48)>0?10:0);}
 biomeAt(_x:number,_z:number,_height?:number):"nether_wastes"{return "nether_wastes";}
 /** Detached deterministic descriptor for the input256-cell. No world load, spawn or resource debit. */
 fortressAt(x:number,z:number):NetherFortress|null{
  if(!valid(x,z))return null;
  const gx=Math.floor(x/256),gz=Math.floor(z/256),cx=gx*256+96+Math.floor(hash3(this.seed,gx,711,gz)*64),cz=gz*256+96+Math.floor(hash3(this.seed,gx,712,gz)*64),y=48+Math.floor(hash3(this.seed,gx,713,gz)*10);
  if(!valid(cx-38,cz-24)||!valid(cx+38,cz+24))return null;
  return Object.freeze({x:cx,y,z:cz,minX:cx-38,maxX:cx+38,minZ:cz-24,maxZ:cz+24,wartBed:Object.freeze({x:cx+2,y,z:cz+2,width:3 as const,depth:3 as const}),blazeVolume:Object.freeze({minX:cx-5,maxX:cx+5,minY:y+1,maxY:y+5,minZ:cz-5,maxZ:cz+5})});
 }
 /** Pure generated cell, useful to root's realm-specific strict source probe. Saved edits still take precedence. */
 blockAt(x:number,y:number,z:number):number{
  if(!valid(x,z)||!Number.isSafeInteger(y)||y<0||y>=WORLD_HEIGHT)return 0;
  if(y===0||y===WORLD_HEIGHT-1)return B.bedrock;
  const floor=this.heightAt(x,z),ceiling=67+Math.floor(this.roofNoise.fbm2(x/105,z/105,3)*13);
  let id=B.rack;
  const sideCave=y>40&&y<84&&this.caveNoise.noise2(x/28+y/21,z/28-y/17)>.44;
  if(y>floor&&y<ceiling||sideCave)id=y<=30?B.lava:0;
  if(y===floor&&floor>=31&&this.caveNoise.noise2(x/34,z/34)<-.25)id=B.sand;
  if(y===ceiling-1&&id===0&&hash3(this.seed,Math.floor(x/3),733,Math.floor(z/3))<.12)id=B.glow;
  const f=this.fortressAt(x,z);if(!f)return id;
  const dx=x-f.x,dz=z-f.z,room=Math.abs(dx)<=7&&Math.abs(dz)<=7,bridge=Math.abs(dx)<=38&&Math.abs(dz)<=2||Math.abs(dz)<=24&&Math.abs(dx)<=2;
  if(!room&&!bridge)return id;
  if(y===f.y)return dx>=2&&dx<=4&&dz>=2&&dz<=4?B.sand:B.brick;
  if(y>f.y&&y<=f.y+6){
   if(room&&(Math.abs(dx)===7||Math.abs(dz)===7)&&(Math.abs(dx)>2&&Math.abs(dz)>2)||room&&y===f.y+6)return B.brick;
   if(y===f.y+1&&dx>=2&&dx<=4&&dz>=2&&dz<=4)return B.wart;
   return 0;
  }
  if(y<f.y&&y>=Math.max(1,f.y-18)&&Math.abs(dx)%12===0&&Math.abs(dz)<=2)return B.brick;
  return id;
 }
 generate(cx:number,cz:number):Chunk{
  if(!Number.isSafeInteger(cx)||!Number.isSafeInteger(cz)||cx*16>WORLD_BORDER||cz*16>WORLD_BORDER||cx*16+15< -WORLD_BORDER||cz*16+15< -WORLD_BORDER)throw new RangeError("Nether chunk outside world bounds");
  const c=new Chunk(cx,cz);for(let z=0;z<CHUNK_SIZE;z++)for(let x=0;x<CHUNK_SIZE;x++)for(let y=0;y<WORLD_HEIGHT;y++)c.set(x,y,z,this.blockAt(cx*16+x,y,cz*16+z));return c;
 }
 /** Bounded read-only natural-pose search. Caller must validate against actual loaded/edited World. */
 findNaturalSpawn(originX=0,originZ=0,radius=32):NetherSpawn|null{
  if(!valid(originX,originZ)||!Number.isInteger(radius)||radius<0||radius>128)return null;
  for(let r=0;r<=radius;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
   if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;const x=originX+dx,z=originZ+dz;if(!valid(x,z))continue;
   for(let y=31;y<84;y++){const id=this.blockAt(x,y,z),def=blockById(id);if(!def.solid||def.collisionBox||id===B.lava)continue;
    if(this.blockAt(x,y+1,z)===0&&this.blockAt(x,y+2,z)===0)return Object.freeze({x:x+.5,y:y+1,z:z+.5});
   }
  }return null;
 }
}
