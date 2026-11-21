import * as THREE from "three";
import { MOB_SPECS, type LeashRecord, type Mob, type Vec3 } from "@craft/engine";

/** Original rope view. It only reads detached owners and live poses; disposal never refunds items. */
export class LeashView {
  private readonly lines = new Map<number, THREE.Line>();
  private readonly material = new THREE.LineBasicMaterial({ color: 0x765137 });
  constructor(private readonly scene: THREE.Scene) {}

  update(records: readonly LeashRecord[], mobs: readonly Mob[], player: Vec3): void {
    const visible = new Set<number>();
    for (const record of records) {
      if (record.phase !== "active") continue;
      const mob = mobs.find(m => m.id === record.targetMobId);
      if (!mob) continue;
      const start = { x: mob.position.x, y: mob.position.y + MOB_SPECS[mob.kind].height * .65, z: mob.position.z };
      const anchor = record.anchor.kind === "player"
        ? { x: player.x + .16, y: player.y + 1, z: player.z }
        : { x: record.anchor.x + .5, y: record.anchor.y + .85, z: record.anchor.z + .5 };
      if (![start.x, start.y, start.z, anchor.x, anchor.y, anchor.z].every(Number.isFinite)) continue;
      visible.add(record.key);
      let line = this.lines.get(record.key);
      if (!line) {
        line = new THREE.Line(new THREE.BufferGeometry(), this.material);
        line.userData.leashKey = record.key; this.lines.set(record.key, line); this.scene.add(line);
      }
      const distance = Math.hypot(anchor.x - start.x, anchor.y - start.y, anchor.z - start.z);
      const points = Array.from({ length: 13 }, (_, i) => {
        const t = i / 12;
        return new THREE.Vector3(start.x + (anchor.x - start.x) * t,
          start.y + (anchor.y - start.y) * t - Math.sin(Math.PI * t) * Math.min(.6, distance * .03),
          start.z + (anchor.z - start.z) * t);
      });
      line.geometry.setFromPoints(points); line.geometry.computeBoundingSphere();
    }
    for (const [key, line] of this.lines) if (!visible.has(key)) {
      this.scene.remove(line); line.geometry.dispose(); this.lines.delete(key);
    }
  }

  dispose(): void {
    for (const line of this.lines.values()) { this.scene.remove(line); line.geometry.dispose(); }
    this.lines.clear(); this.material.dispose();
  }
}
