import * as THREE from 'three';
import {expect,it,vi} from 'vitest';
import {skyAt} from '@craft/engine';
import {WorldRenderer,type PlayerStatusViewEffects} from '../src/rendering/renderer';
function view(){
 const v=Object.create(WorldRenderer.prototype) as WorldRenderer;
 const fog=new THREE.Fog(0x123456,20,100),camera=new THREE.PerspectiveCamera();camera.position.set(3,40,5);camera.rotation.set(.1,.2,.3);
 const draw=vi.fn((_scene:THREE.Scene,_camera:THREE.PerspectiveCamera)=>{});
 Object.assign(v,{world:{dimension:'overworld'},scene:new THREE.Scene(),camera,fog,skyColor:new THREE.Color(),renderDistance:6,sun:new THREE.Object3D(),moon:new THREE.Object3D(),clouds:new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial()),cloudOffset:0,daylight:{value:0},renderer:{render:draw}});
 return {v,fog,camera,draw};
}
it('actual draw clamps blindness after ordinary fog reset and cures to the exact3argument legacy distances',()=>{
 const {v,fog,draw}=view(),sky=skyAt(.3);v.render(sky,false,0,{blindness:true});expect(draw).toHaveBeenCalledOnce();expect(fog.near).toBe(1);expect(fog.far).toBe(6);expect(v.scene.background).toBe((v as unknown as {skyColor:THREE.Color}).skyColor);const color=fog.color.clone();v.render(sky,false,0);expect(fog.near).toBe(96*.55);expect(fog.far).toBe(96*.95);expect(fog.color.equals(color)).toBe(true);expect(v.lastStatusView).toEqual({blindness:false,roll:0,fogNear:96*.55,fogFar:96*.95});
});
it('underwater blindness retains underwater color/background and clearing restores24block underwater fog',()=>{
 const {v,fog}=view();v.render(skyAt(.3),true,0);const color=fog.color.clone(),background=v.scene.background;v.render(skyAt(.3),true,0,{blindness:true});expect(fog.near).toBe(1);expect(fog.far).toBe(6);expect(fog.color.equals(color)).toBe(true);expect(v.scene.background).toBe(background);v.render(skyAt(.3),true,0,{});expect(fog.far).toBe(24);expect(fog.near).toBe(1);
});
it.each([[-4,-.015],[4,.015],[.004,.004],[NaN,0],[Infinity,0]] as const)('actual draw bounds roll%s and restores camera without changing position or look axes', (requested,expected)=>{
 const {v,camera,draw}=view(),position=camera.position.clone(),before=camera.rotation.clone();draw.mockImplementation((_s,c)=>{expect(c.rotation.z).toBeCloseTo(before.z+expected);expect(c.rotation.x).toBe(before.x);expect(c.rotation.y).toBe(before.y);});v.render(skyAt(.3),false,0,{nauseaRoll:requested});expect(draw).toHaveBeenCalledOnce();expect(camera.rotation.equals(before)).toBe(true);expect(camera.position.equals(position)).toBe(true);expect(v.lastStatusView.roll).toBe(expected);
});
it('finally restores original camera roll when the actual renderer throws; diagnostics are detached',()=>{
 const {v,camera,draw}=view(),before=camera.rotation.z;draw.mockImplementation(()=>{expect(camera.rotation.z).toBeCloseTo(before+.015);throw Error('GPU draw failed');});expect(()=>v.render(skyAt(.3),false,0,{blindness:true,nauseaRoll:1})).toThrow('GPU draw failed');expect(camera.rotation.z).toBe(before);const diagnostic=v.lastStatusView;diagnostic.roll=99;diagnostic.fogFar=99;expect(v.lastStatusView).toEqual({blindness:true,roll:.015,fogNear:1,fogFar:6});
});
it('three-argument and empty effects calls never write camera roll',()=>{
 const {v,camera}=view(),rotation=camera.rotation;let writes=0,current=rotation.z;Object.defineProperty(rotation,'z',{get:()=>current,set:(n:number)=>{writes++;current=n;}});v.render(skyAt(.3),false,0);v.render(skyAt(.3),false,0,{} as PlayerStatusViewEffects);expect(writes).toBe(0);
});
