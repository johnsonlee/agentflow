import * as THREE from "three";
import type { Mob } from "@craft/engine";

/** Original procedural adult design: a mantle, two eyes and eight radial tentacles.
 * No native geometry, textures or animation payloads are used. */
export function buildSquidModel(): THREE.Group {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = .475;
  pivot.userData.squidPivot = true;
  root.add(pivot);
  const part = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) => {
    const material = new THREE.MeshBasicMaterial({ color });
    material.userData.baseColor = material.color.clone();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    pivot.add(mesh);
    return mesh;
  };
  part(.64, .58, .64, 0, .15, 0, 0x355e70);
  part(.54, .13, .54, 0, -.205, 0, 0x264b60);
  for (const x of [-.19, .19]) {
    part(.15, .15, .025, x, .17, -.333, 0xe2e9db);
    part(.065, .09, .025, x, .16, -.352, 0x19232f);
  }
  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI / 4;
    const mesh = part(.105, .27, .105, Math.cos(angle) * .24, -.27, Math.sin(angle) * .24, 0x477889);
    mesh.geometry.translate(0, -.135, 0);
    mesh.position.y = -.14;
    mesh.userData.tentacle = index;
  }
  return root;
}

/** Pitch is taken from the actual aquatic steering state; tentacles pulse independently of legs. */
export function animateSquidModel(model: THREE.Group, mob: Mob, time: number): void {
  const speed = Math.hypot(mob.velocity.x, mob.velocity.y, mob.velocity.z);
  model.traverse(object => {
    if (object.userData.squidPivot) object.rotation.x = mob.squidState?.pitch ?? 0;
    if (object.userData.tentacle !== undefined) {
      const index = object.userData.tentacle as number;
      const spread = .15 + Math.sin(time * (3 + Math.min(2, speed)) + mob.id + index * .2) * .22;
      object.rotation.x = Math.sin(index * Math.PI / 4) * spread;
      object.rotation.z = -Math.cos(index * Math.PI / 4) * spread;
    }
  });
}
