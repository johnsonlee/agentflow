import { inspectRecyclingEquipment } from "../ownership/metal-recycling";
export interface RecyclingOwnershipIssue { path: string; reason: string }

/** Only known owner locations and count/wear and concrete own enchantments on the supported18 gear identities.
 * Other legacy fields and metadata policies are unchanged; the original raw JSON is the backup owner.
 */
export function diagnoseRawRecyclingOwnership(raw: unknown): RecyclingOwnershipIssue[] {
  const issues: RecyclingOwnershipIssue[] = [];
  const own = (value: unknown, key: PropertyKey): unknown => {
    if (!value || typeof value !== "object") return undefined;
    const field = Object.getOwnPropertyDescriptor(value, key);
    return field && "value" in field ? field.value : undefined;
  };
  const check = (value: unknown, path: string) => {
    const state = inspectRecyclingEquipment(value);
    if (state.kind === "invalid") issues.push({path,reason:state.reason});
  };
  const list = (value: unknown, path: string, visit: (value: unknown, path: string) => void = check) => {
    if (!Array.isArray(value)) return;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)) continue;
      visit(own(value, key), `${path}[${key}]`);
    }
  };
  const world = (value: unknown, prefix: string) => {
    const path = (name: string) => prefix ? `${prefix}.${name}` : name;
    list(own(value, "furnaces"), path("furnaces"), (f, p) => {
      const state = own(f, "state");
      for (const slot of ["input", "fuel", "output"]) check(own(state, slot), `${p}.state.${slot}`);
    });
    list(own(value, "chests"), path("chests"), (c, p) => list(own(own(c, "state"), "slots"), `${p}.state.slots`));
    list(own(own(value, "worldDrops"), "records"), path("worldDrops.records"), (r, p) => check(own(r, "stack"), `${p}.stack`));
    list(own(own(value, "mobs"), "records"), path("mobs.records"), (m, p) => list(own(m, "pendingLoot"), `${p}.pendingLoot`));
  };
  try {
  const inventory = own(raw, "inventory");
  list(own(inventory, "slots"), "inventory.slots");
  check(own(inventory, "offhand"), "inventory.offhand");
  const equipment = own(inventory, "equipment");
  if (equipment && typeof equipment === "object") for (const key of Reflect.ownKeys(equipment)) check(own(equipment, key), `inventory.equipment.${String(key)}`);
  list(own(raw, "inventoryPending"), "inventoryPending");
  const agent = own(raw, "agent");
  list(own(agent, "slots"), "agent.slots"); check(own(agent, "offhand"), "agent.offhand");
  world(raw, "");
  const inactive = own(own(raw, "dimensions"), "inactive");
  for (const realm of ["overworld", "nether"]) world(own(inactive, realm), `dimensions.inactive.${realm}`);
  } catch { issues.push({path:"ownedItems",reason:"Unreadable recycling equipment ownership"}); }
  return issues;
}
