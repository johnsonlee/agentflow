import * as THREE from "three";
import { FACING_DIRS, type AgentState } from "@craft/engine";

/** Original design: a small teal-and-grey robot with a visor, hovering over its block cell. */
function part(size: [number, number, number], at: [number, number, number], color: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ color }));
  m.position.set(...at);
  return m;
}

export class AgentView {
  readonly group = new THREE.Group();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private fromYaw = 0;
  private toYaw = 0;
  private t = 1;

  constructor(scene: THREE.Scene, agent: AgentState) {
    this.group.add(
      part([0.56, 0.42, 0.42], [0, 0.42, 0], "#7d8a92"),
      part([0.5, 0.36, 0.4], [0, 0.82, 0], "#a7b4bb"),
      part([0.42, 0.12, 0.04], [0, 0.84, -0.21], "#2dd4c4"),
      part([0.14, 0.16, 0.3], [-0.16, 0.12, 0], "#4b555b"),
      part([0.14, 0.16, 0.3], [0.16, 0.12, 0], "#4b555b"),
      part([0.04, 0.16, 0.04], [0, 1.08, 0], "#2dd4c4"),
    );
    this.group.userData.agent = true;
    scene.add(this.group);
    this.snap(agent);
  }

  private yawOf(agent: AgentState): number {
    const [fx, fz] = FACING_DIRS[agent.facing];
    // The model's face points -Z; turn it to the facing direction.
    return Math.atan2(-fx, -fz);
  }

  /** Jumps straight to the Agent's state. */
  snap(agent: AgentState): void {
    this.to.set(agent.x + 0.5, agent.y, agent.z + 0.5);
    this.from.copy(this.to);
    this.toYaw = this.fromYaw = this.yawOf(agent);
    this.t = 1;
    this.apply();
  }

  /** Starts animating towards the Agent's new state over the next step. */
  moveTo(agent: AgentState): void {
    this.from.copy(this.group.position);
    this.fromYaw = this.group.rotation.y;
    this.to.set(agent.x + 0.5, agent.y, agent.z + 0.5);
    let yaw = this.yawOf(agent);
    while (yaw - this.fromYaw > Math.PI) yaw -= Math.PI * 2;
    while (yaw - this.fromYaw < -Math.PI) yaw += Math.PI * 2;
    this.toYaw = yaw;
    this.t = 0;
  }

  update(dt: number, stepSeconds: number, time: number): void {
    this.t = Math.min(1, this.t + dt / Math.max(0.05, stepSeconds * 0.8));
    this.apply();
    // A gentle hover.
    this.group.position.y += 0.05 + Math.sin(time * 3) * 0.03;
  }

  private apply(): void {
    const e = this.t * this.t * (3 - 2 * this.t);
    this.group.position.lerpVectors(this.from, this.to, e);
    this.group.rotation.y = this.fromYaw + (this.toYaw - this.fromYaw) * e;
  }
}
