import * as THREE from "three";
import { balloonColorOf, type BalloonRecord } from "@craft/engine";

/** Original low-poly artwork. Detached snapshots are its only ownership input. */
export class BalloonView {
  private readonly objects = new Map<number, THREE.Group>();
  private readonly materials = new Map<number, THREE.MeshBasicMaterial>();
  private readonly body = new THREE.SphereGeometry(.2, 12, 8).toNonIndexed();
  private readonly knot = new THREE.ConeGeometry(.035, .06, 5).toNonIndexed();
  private readonly highlight = new THREE.SphereGeometry(.035, 6, 4);
  private readonly shine = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55 });
  private readonly thread = new THREE.LineBasicMaterial({ color: 0xddd6bf });
  private disposed = false;
  constructor(private readonly scene: THREE.Scene) {
    // Original fixed vertex shading works in the existing unlit scene without global lights.
    const direction = new THREE.Vector3(-.4, .8, .5).normalize();
    for (const geometry of [this.body, this.knot]) {
      geometry.computeVertexNormals();
      const normals = geometry.getAttribute("normal"), colors = new Float32Array(normals.count * 3);
      for (let i = 0; i < normals.count; i++) {
        const shade = .65 + .35 * Math.max(0, normals.getX(i) * direction.x + normals.getY(i) * direction.y + normals.getZ(i) * direction.z);
        colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
  }

  update(records: readonly BalloonRecord[]): void {
    if (this.disposed) return;
    const visible = new Set<number>();
    for (const record of records) {
      const color = balloonColorOf(record.itemId), p = record.position, a = record.lastAnchor;
      if (!color || ![p.x, p.y, p.z, a.x, a.y, a.z].every(Number.isFinite)) continue;
      visible.add(record.key);
      let group = this.objects.get(record.key);
      if (!group) {
        group = new THREE.Group(); group.userData.balloonKey = record.key;
        this.objects.set(record.key, group); this.scene.add(group);
        const sphere = new THREE.Mesh(this.body, this.shine); sphere.scale.set(.9, 1, .9); sphere.position.y = .2; group.add(sphere);
        const knot = new THREE.Mesh(this.knot, this.shine); knot.rotation.z = Math.PI; knot.position.y = -.015; group.add(knot);
        const shine = new THREE.Mesh(this.highlight, this.shine); shine.scale.set(.55, 1.7, .35); shine.position.set(-.09, .29, .13); group.add(shine);
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), this.thread));
      }
      let material = this.materials.get(record.itemId);
      if (!material) { material = new THREE.MeshBasicMaterial({ color: color.colorhex, vertexColors: true }); this.materials.set(record.itemId, material); }
      (group.children[0] as THREE.Mesh).material = material; (group.children[1] as THREE.Mesh).material = material;
      group.position.set(p.x, p.y, p.z);
      const geometry = (group.children[3] as THREE.Line).geometry;
      const points = geometry.getAttribute("position") as THREE.BufferAttribute;
      points.setXYZ(0, 0, 0, 0); points.setXYZ(1, a.x - p.x, a.y - p.y, a.z - p.z); points.needsUpdate = true; geometry.computeBoundingSphere();
    }
    for (const [key, group] of this.objects) if (!visible.has(key)) { this.remove(group); this.objects.delete(key); }
  }

  private remove(group: THREE.Group): void { this.scene.remove(group); (group.children[3] as THREE.Line).geometry.dispose(); }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const group of this.objects.values()) this.remove(group);
    this.objects.clear(); for (const material of this.materials.values()) material.dispose(); this.materials.clear();
    this.body.dispose(); this.knot.dispose(); this.highlight.dispose(); this.shine.dispose(); this.thread.dispose();
  }
}
