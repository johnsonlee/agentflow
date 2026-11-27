import * as THREE from "three";
import type { CameraViewState, PlacedCamera, Vec3 } from "@craft/engine";
function part(size:[number,number,number],at:[number,number,number],color:number):THREE.Mesh{const p=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshBasicMaterial({color}));p.position.set(...at);return p;}
/** Original procedural camera/subject, no native artwork or geometry equivalence claim. */
export class PlacedCameraView {
 private models=new Map<number,THREE.Group>();private subject=new THREE.Group();
 constructor(private scene:THREE.Scene){
  this.subject.add(part([.48,.7,.24],[0,1.02,0],0x278c9e),part([.4,.4,.4],[0,1.57,0],0xd9b68c),part([.18,.65,.22],[-.14,.325,0],0x344d72),part([.18,.65,.22],[.14,.325,0],0x344d72),part([.16,.65,.22],[-.34,1.04,0],0xd9b68c),part([.16,.65,.22],[.34,1.04,0],0xd9b68c));this.subject.visible=false;scene.add(this.subject);
 }
 update(records:CameraViewState[],player:Vec3):void{
  for(const[key,m]of this.models)if(!records.some(r=>r.key===key)){this.disposeGroup(m);this.models.delete(key);}
  for(const r of records){let m=this.models.get(r.key);if(!m){m=new THREE.Group();m.add(part([.62,.4,.32],[0,.85,0],0x414b55),part([.26,.22,.1],[0,.85,-.2],0x7ad5e5),part([.06,.65,.06],[0,.32,0],0xa2aab0),part([.48,.05,.4],[0,.03,0],0x414b55));this.models.set(r.key,m);this.scene.add(m);}m.position.set(r.x+.5,r.y,r.z+.5);m.lookAt(player.x,r.y,player.z);m.rotateY(Math.PI);const body=m.children[0]as THREE.Mesh;(body.material as THREE.MeshBasicMaterial).color.setHex(r.remaining===null?0x414b55:Math.floor(r.remaining*4)%2?0xe4bd53:0x59a79a);}
 }
 camera(r:PlacedCamera,player:Vec3):THREE.PerspectiveCamera{const c=new THREE.PerspectiveCamera(65,4/3,.05,200);c.position.set(r.x+.5,r.y+.9,r.z+.5);c.lookAt(player.x,player.y+.95,player.z);return c;}
 withSubject<T>(key:number,player:Vec3,yaw:number,capture:()=>T):T{const model=this.models.get(key);const visible=model?.visible;if(model)model.visible=false;this.subject.position.set(player.x,player.y,player.z);this.subject.rotation.y=yaw;this.subject.visible=true;try{return capture();}finally{this.subject.visible=false;if(model)model.visible=visible!;}}
 private disposeGroup(m:THREE.Group):void{m.removeFromParent();m.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const x of Array.isArray(o.material)?o.material:[o.material])x.dispose();}});m.clear();}
 dispose():void{for(const m of this.models.values())this.disposeGroup(m);this.models.clear();this.disposeGroup(this.subject);}
}
