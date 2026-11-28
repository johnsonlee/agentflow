import * as THREE from "three";
import { blockById, isItem, itemById, inspectSparklerState, isSparklerId, SPARKLER_COLORS, sparklerColor, type ItemStack, type WorldDrops } from "@craft/engine";
import {groundPhotoCamera,supportedGroundPhoto} from './groundCamera';
import type {DroppedItemRecord,Vec3,World} from '@craft/engine';
import type { TextureAtlas } from "@craft/textures";

/** Original atlas art for world-owned items. View lifetime never controls store ownership. */
export class WorldDropsView {
  private readonly texture: THREE.DataTexture;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly geometry = new Map<string, THREE.BufferGeometry>();
  private readonly meshes = new Map<number, THREE.Mesh>();
  private disposed = false;
  constructor(private readonly scene: THREE.Scene, private readonly atlas: TextureAtlas, private readonly store: WorldDrops) {
    this.texture = new THREE.DataTexture(atlas.data, atlas.width, atlas.height, THREE.RGBAFormat);
    this.texture.magFilter = this.texture.minFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false;
    this.texture.needsUpdate = true;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, alphaTest: .05, transparent: true, side: THREE.DoubleSide });
  }
  update(time: number, camera: THREE.Vector3, distance: number): void {
    if (this.disposed) return;
    const wanted = new Set<number>();
    for (const drop of this.store.records) {
      if (Math.hypot(drop.position.x - camera.x, drop.position.z - camera.z) > distance) continue;
      wanted.add(drop.key);
      let mesh = this.meshes.get(drop.key);
      if (!mesh) {
        mesh = new THREE.Mesh(this.shape(drop.stack), this.material);
        mesh.userData.worldDropKey = drop.key;
        this.meshes.set(drop.key, mesh); this.scene.add(mesh);
      }
      mesh.geometry = this.shape(drop.stack);
      mesh.position.set(drop.position.x, drop.position.y + .12 + Math.sin(time * 2 + drop.key) * .035, drop.position.z);
      mesh.rotation.y = time + drop.key;
    }
    for (const [key, mesh] of this.meshes) if (!wanted.has(key)) { this.scene.remove(mesh); this.meshes.delete(key); }
  }
  /** Detached owner/view observation; photography never publishes or transforms a ground owner. */
  groundSubject(world:World,time:number,eye:Vec3,direction:Vec3,reach:number,occlusion:number):{record:DroppedItemRecord;camera:THREE.PerspectiveCamera;distance:number;center:Vec3}|null{
    if(this.disposed)return null;
    this.update(time,new THREE.Vector3(eye.x,eye.y,eye.z),reach+1);this.scene.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(eye.x,eye.y,eye.z),new THREE.Vector3(direction.x,direction.y,direction.z).normalize(),0,reach);
    const hits=ray.intersectObjects([...this.meshes.values()],false);
    for(const hit of hits){
      if(hit.distance>=occlusion-1e-8)return null;
      const key=hit.object.userData.worldDropKey as number,record=this.store.records.find(r=>r.key===key);
      if(!record||!supportedGroundPhoto(world,record))return null;
      const bounds=new THREE.Box3().setFromObject(hit.object);
      try{return{record,camera:groundPhotoCamera(eye,bounds),distance:hit.distance,center:bounds.getCenter(new THREE.Vector3())};}catch{return null;}
    }
    return null;
  }
  private shape(stack: ItemStack): THREE.BufferGeometry {
    const id = stack.id;
    const icon = isSparklerId(id) && inspectSparklerState(stack).kind === "active"
      ? SPARKLER_COLORS.find(row => row.color === sparklerColor(id))?.iconActive : undefined;
    const cacheKey = `${id}:${icon ?? ""}`;
    const old = this.geometry.get(cacheKey); if (old) return old;
    const def = isItem(id) ? null : blockById(id);
    const cube = def?.shape === "cube";
    const g = cube ? new THREE.BoxGeometry(.25, .25, .25) : new THREE.PlaneGeometry(.3, .3);
    const keys = cube ? [def!.faces.side, def!.faces.side, def!.faces.top, def!.faces.bottom, def!.faces.side, def!.faces.side] : [def?.faces.side ?? icon ?? itemById(id).icon];
    const uv = g.getAttribute("uv");
    for (let face = 0; face < keys.length; face++) {
      const [u0, v0, u1, v1] = this.atlas.uv(keys[face]);
      for (let i = face * 4; i < face * 4 + 4; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    }
    this.geometry.set(cacheKey, g); return g;
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const mesh of this.meshes.values()) this.scene.remove(mesh);
    this.meshes.clear();
    for (const geometry of this.geometry.values()) geometry.dispose();
    this.geometry.clear(); this.material.dispose(); this.texture.dispose();
  }
}
