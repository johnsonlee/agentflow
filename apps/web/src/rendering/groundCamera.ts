import * as THREE from 'three';
import {blockSelectionBoxes,isSolid,WORLD_DROP_PROFILE,type DroppedItemRecord,type Vec3,type World} from '@craft/engine';

/** Read-only application ground-contact witness. Unknown support never becomes generated air. */
export function supportedGroundPhoto(world:World,drop:DroppedItemRecord):boolean{
 if(drop.velocity.y!==0||![drop.position.x,drop.position.y,drop.position.z].every(Number.isFinite))return false;
 const p=drop.position,half=WORLD_DROP_PROFILE.bodySize/2;let unknown=false,supported=false;
 const get=(x:number,y:number,z:number)=>{const id=world.getLoadedBlock(x,y,z);if(id===undefined){unknown=true;return 0;}return id;};
 for(let x=Math.floor(p.x-half);x<=Math.floor(p.x+half);x++)for(let z=Math.floor(p.z-half);z<=Math.floor(p.z+half);z++)for(let y=Math.floor(p.y)-2;y<=Math.floor(p.y);y++){
  const id=get(x,y,z);if(!isSolid(id))continue;
  for(const b of blockSelectionBoxes(get,x,y,z,id))if(Math.abs(p.y-(y+b[4]))<.02&&p.x+half>x+b[0]&&p.x-half<x+b[3]&&p.z+half>z+b[2]&&p.z-half<z+b[5])supported=true;
 }
 return supported&&!unknown;
}
/** Original focused framing, not native FOV/zoom calibration. No player/item transform is changed. */
export function groundPhotoCamera(eye:Vec3,bounds:THREE.Box3):THREE.PerspectiveCamera{
 const sphere=bounds.getBoundingSphere(new THREE.Sphere()),from=new THREE.Vector3(eye.x,eye.y,eye.z),direction=from.clone().sub(sphere.center),available=direction.length();
 if(!Number.isFinite(sphere.radius)||sphere.radius<=0||!Number.isFinite(available)||available<=sphere.radius+.05)throw Error('Ground item has no safe focused viewpoint');
 const distance=Math.min(available,sphere.radius/Math.sin(THREE.MathUtils.degToRad(45/2))*1.25);
 const camera=new THREE.PerspectiveCamera(45,4/3,.02,200);camera.position.copy(sphere.center).addScaledVector(direction.normalize(),distance);camera.lookAt(sphere.center);camera.updateMatrixWorld();return camera;
}
