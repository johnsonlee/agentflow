import * as THREE from "three";
import type {Mob} from "@craft/engine";
/** Original procedural head and twelve orbiting rods, without native raster imports. */
export function buildBlazeModel():THREE.Group{
 const group=new THREE.Group(),head=new THREE.Mesh(new THREE.BoxGeometry(.45,.45,.45),new THREE.MeshBasicMaterial({color:0xe1ac37}));head.position.y=1.25;group.add(head);
 for(const x of [-.1,.1]){const eye=new THREE.Mesh(new THREE.BoxGeometry(.07,.055,.012),new THREE.MeshBasicMaterial({color:0x572719}));eye.position.set(x,1.29,-.23);group.add(eye);}
 const mouth=new THREE.Mesh(new THREE.BoxGeometry(.16,.035,.012),new THREE.MeshBasicMaterial({color:0x783a20}));mouth.position.set(0,1.17,-.23);group.add(mouth);
 for(let i=0;i<12;i++){const rod=new THREE.Mesh(new THREE.BoxGeometry(.11,.5,.11),new THREE.MeshBasicMaterial({color:i%2?0xffd966:0xc78922}));rod.userData.blazeRod=i;group.add(rod);}
 group.traverse(o=>{if(o instanceof THREE.Mesh){const mat=o.material as THREE.MeshBasicMaterial;mat.userData.baseColor=mat.color.clone();}});return group;
}
export function animateBlazeModel(group:THREE.Group,mob:Mob):void{
 const phase=mob.blazeState?.hoverSeconds??0;group.traverse(o=>{if(typeof o.userData.blazeRod!=="number")return;const i=o.userData.blazeRod,ring=Math.floor(i/4),angle=phase*(ring%2?-1:1)+i*Math.PI/2;o.position.set(Math.cos(angle)*(.38+ring*.06),.35+ring*.45+Math.sin(angle+phase)*.08,Math.sin(angle)*(.38+ring*.06));});
}
