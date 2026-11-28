import { AGENT_DIRECTIONS, agentStep, type AgentDirection, type AgentState } from '../automation/agent';
import { blockId } from '../catalog/blocks';
import { redstoneInfo } from '../simulation/redstone';
import { writablePlacementCell } from '../world/placement-bounds';
import type { World, WorldCellSnapshot, BlockEdit } from '../world/world';
import { reserveInventoryMutation } from './inventory-lease';
import { ownedCargoFingerprint } from './owned-placement-cargo';

/** Decode once from own data descriptors; never reread a live command property.
 * This rejects ordinary accessors, not every Proxy reflection trap JavaScript permits. */
function readInteractDirection(value: unknown): AgentDirection | undefined {
  try {
    if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return undefined;
    const fields = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(fields).length !== 2 || !['op', 'dir'].every(k => fields[k]?.enumerable && 'value' in fields[k])) return undefined;
    const op = fields.op.value, dir = fields.dir.value;
    return op === 'interact' && AGENT_DIRECTIONS.includes(dir) ? dir : undefined;
  } catch { return undefined; }
}
export function isAgentInteractCommand(value: unknown): value is { op: 'interact'; dir: AgentDirection } {
  return readInteractDirection(value) !== undefined;
}

/** App survival Allow/Deny policy, with every loaded permission source captured.
 * Native Agent use permissions are not calibrated; no terrain generation is allowed. */
function permitted(world: World, x: number, y: number, z: number, expected: WorldCellSnapshot[]): boolean {
  for (let below = y - 1; below >= 0; below--) {
    const cell = world.captureCell(x, below, z);
    if (!cell) return false;
    expected.push(cell);
    if (cell.id === blockId('deny')) return false;
    if (cell.id === blockId('allow')) return true;
  }
  return true;
}

/** Bounded application subset of MakeCode's door example: coherent wooden doors only.
 * Toggling, refusal and protection semantics are app choices, not native calibration.
 * The old hand-use/redstone path is deliberately unchanged. No cargo is consumed. */
export function interactOwnedAgentDoor(world: World, agent: AgentState, command: unknown, lifecycleValid: () => boolean = () => true): boolean {
  const dir = readInteractDirection(command);
  if (dir === undefined || world.blockSourceLeaseBusy) return false;
  const lease = reserveInventoryMutation(agent);
  if (!lease) return false;
  let committed = false;
  try {
    const snapshot = () => ownedCargoFingerprint(agent, lease.slots), before = snapshot();
    const [dx, dy, dz] = agentStep(agent, dir);
    const x = agent.x + dx, y = agent.y + dy, z = agent.z + dz;
    if (!writablePlacementCell(agent.x, agent.y, agent.z) || !writablePlacementCell(x, y, z)) return false;
    const clicked = world.captureCell(x, y, z), info = clicked && redstoneInfo(clicked.id);
    if (!info || info.kind !== 'door' || info.material !== 'wooden') return false;
    const lowerY = info.upper ? y - 1 : y;
    const lower = world.captureCell(x, lowerY, z), upper = world.captureCell(x, lowerY + 1, z);
    if (!lower || !upper) return false;
    const l = redstoneInfo(lower.id), u = redstoneInfo(upper.id);
    if (!l || !u || l.kind !== 'door' || u.kind !== 'door' || l.upper || !u.upper ||
        l.material !== 'wooden' || u.material !== l.material || l.facing !== u.facing || l.open !== u.open) return false;
    const expected = [lower, upper];
    if (!permitted(world, x, lowerY, z, expected) || !permitted(world, x, lowerY + 1, z, expected)) return false;
    const edits: BlockEdit[] = [
      [x, lowerY, z, blockId(`door_wooden_lower_${l.facing}_${l.open ? 0 : 1}`)],
      [x, lowerY + 1, z, blockId(`door_wooden_upper_${l.facing}_${l.open ? 0 : 1}`)],
    ];
    world.commitBlockBatch(edits, () => { lease.cancel(); committed = true; }, expected,
      () => lifecycleValid() === true && lease.valid() && snapshot() === before);
    return committed;
  } catch { return committed; }
  finally { lease.cancel(); }
}
