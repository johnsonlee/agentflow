import * as THREE from "three";
import type { SnowballImpact, SnowballProjectiles } from "@craft/engine";
import type { TextureAtlas } from "@craft/textures";

/** Original atlas sprite rendering; engine records alone own consumed projectiles. */
export class SnowballProjectilesView {
  private readonly texture: THREE.DataTexture;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly geometry = new THREE.PlaneGeometry(.25, .25);
  private readonly particleGeometry = new THREE.PlaneGeometry(.065, .065);
  private readonly particleMaterial = new THREE.MeshBasicMaterial({ color: 0xf2f8ff, side: THREE.DoubleSide });
  private readonly meshes = new Map<number, THREE.Mesh>();
  private readonly particles: Array<{ mesh: THREE.Mesh; velocity: THREE.Vector3; age: number }> = [];
  private disposed = false;
  constructor(private readonly scene: THREE.Scene, atlas: TextureAtlas, private readonly store: SnowballProjectiles) {
    this.texture = new THREE.DataTexture(atlas.data, atlas.width, atlas.height, THREE.RGBAFormat);
    this.texture.magFilter = this.texture.minFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace; this.texture.flipY = false; this.texture.needsUpdate = true;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, alphaTest: .05, transparent: true, side: THREE.DoubleSide });
    const [u0, v0, u1, v1] = atlas.uv("item_snowball"), uv = this.geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  /** Six original visual particles; appearance, velocities and .3s duration are application choices. */
  impact(events: readonly SnowballImpact[]): void {
    if (this.disposed) return;
    for (const event of events) {
      if (event.kind !== "block" && event.kind !== "mob") continue;
      for (let i = 0; i < 6; i++) {
        // Bound visuals independently of physics/store ownership when many records hit at once.
        if (this.particles.length >= 192) { this.scene.remove(this.particles.shift()!.mesh); }
        const angle = i * Math.PI / 3, mesh = new THREE.Mesh(this.particleGeometry, this.particleMaterial);
        mesh.position.set(event.position.x, event.position.y, event.position.z);
        mesh.userData.snowballImpactKey = event.key;
        this.scene.add(mesh);
        this.particles.push({ mesh, velocity: new THREE.Vector3(Math.cos(angle) * .7, .4 + (i % 2) * .3, Math.sin(angle) * .7), age: 0 });
      }
    }
  }
  update(dt: number, camera: THREE.Camera, distance: number): void {
    if (this.disposed) return;
    const wanted = new Set<number>();
    for (const shot of this.store.records) {
      if (Math.hypot(shot.position.x - camera.position.x, shot.position.z - camera.position.z) > distance) continue;
      wanted.add(shot.key);
      let mesh = this.meshes.get(shot.key);
      if (!mesh) { mesh = new THREE.Mesh(this.geometry, this.material); mesh.userData.snowballProjectileKey = shot.key; this.meshes.set(shot.key, mesh); this.scene.add(mesh); }
      mesh.position.set(shot.position.x, shot.position.y, shot.position.z); mesh.quaternion.copy(camera.quaternion);
    }
    for (const [key, mesh] of this.meshes) if (!wanted.has(key)) { this.scene.remove(mesh); this.meshes.delete(key); }
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, .25) : 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.age += step;
      if (p.age >= .3) { this.scene.remove(p.mesh); this.particles.splice(i, 1); continue; }
      p.mesh.position.addScaledVector(p.velocity, step); p.velocity.y -= step * 2; p.mesh.quaternion.copy(camera.quaternion);
    }
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const mesh of this.meshes.values()) this.scene.remove(mesh);
    for (const p of this.particles) this.scene.remove(p.mesh);
    this.meshes.clear(); this.particles.length = 0;
    this.geometry.dispose(); this.particleGeometry.dispose(); this.material.dispose(); this.particleMaterial.dispose(); this.texture.dispose();
  }
}
