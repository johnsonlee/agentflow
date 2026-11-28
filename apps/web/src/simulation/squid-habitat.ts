import { MOB_SPECS, WORLD_BORDER, WORLD_HEIGHT, blockId, bodyBox, boxCollides, isSolid, type Vec3, type World } from "@craft/engine";

const bounded = (p: Vec3) => [p.x, p.y, p.z].every(Number.isFinite)
  && Math.abs(p.x) + MOB_SPECS.squid.width / 2 <= WORLD_BORDER
  && Math.abs(p.z) + MOB_SPECS.squid.width / 2 <= WORLD_BORDER
  && p.y >= 0 && p.y + MOB_SPECS.squid.height <= WORLD_HEIGHT;

/** Loaded, whole-body water only. The small extra vertical margin avoids floor/surface overlap.
 * Clearance and search bounds are application policy, not calibrated native spawning rules. */
export function isLoadedSquidWater(world: World, position: Vec3): boolean {
  if (!bounded(position)) return false;
  const spec = MOB_SPECS.squid;
  const box = bodyBox(position, spec.width, spec.height);
  const water = blockId("water");
  for (let x = Math.floor(box.minX); x <= Math.floor(box.maxX - 1e-6); x++)
    for (let y = Math.floor(box.minY - .15); y <= Math.floor(box.maxY + .15); y++)
      for (let z = Math.floor(box.minZ); z <= Math.floor(box.maxZ - 1e-6); z++)
        if (world.getLoadedBlock(x, y, z) !== water) return false;
  return true;
}

/** Read-only natural habitat gate: actual generated ocean biome plus existing loaded water. */
export function isNaturalSquidSpawnEligible(world: World, position: Vec3): boolean {
  return bounded(position) && world.generator.biomeAt(Math.floor(position.x), Math.floor(position.z)) === "ocean"
    && isLoadedSquidWater(world, position);
}

/** Bounded command search; a pool may support summon without claiming natural-ocean eligibility. */
export function findLoadedSquidWater(world: World, origin: Vec3): Vec3 | null {
  if (!bounded(origin)) return null;
  const top = Math.min(WORLD_HEIGHT - 2, Math.floor(origin.y) + 6);
  const bottom = Math.max(1, Math.floor(origin.y) - 6);
  for (let radius = 0; radius <= 8; radius += 2)
    for (let dx = -radius; dx <= radius; dx += 2)
      for (let dz = -radius; dz <= radius; dz += 2) {
        if (radius > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        for (let y = top; y >= bottom; y--) {
          const at = { x: Math.floor(origin.x) + dx + .5, y: y + .2, z: Math.floor(origin.z) + dz + .5 };
          if (isLoadedSquidWater(world, at)) return at;
        }
      }
  return null;
}

/** Command application policy: prefer loaded water, otherwise a loaded dry supported pose.
 * Dry placement intentionally exposes the squid to its ordinary air/exposure simulation. */
export function findLoadedSquidSummonSpot(world: World, origin: Vec3): Vec3 | null {
  if (!bounded(origin)) return null;
  const wet = findLoadedSquidWater(world, origin);
  if (wet) return wet;
  const spec = MOB_SPECS.squid;
  for (let radius = 0; radius <= 8; radius += 2)
    for (let dx = -radius; dx <= radius; dx += 2)
      for (let dz = -radius; dz <= radius; dz += 2) {
        if (radius > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        for (let dy = -6; dy <= 6; dy++) {
          const at = { x: Math.floor(origin.x) + dx + .5, y: Math.floor(origin.y) + dy + .01, z: Math.floor(origin.z) + dz + .5 };
          if (at.y < 1 || !bounded(at)) continue;
          const box = bodyBox(at, spec.width, spec.height);
          let safe = true;
          for (let x = Math.floor(box.minX); x <= Math.floor(box.maxX - 1e-6); x++)
            for (let z = Math.floor(box.minZ); z <= Math.floor(box.maxZ - 1e-6); z++) {
              const support = world.getLoadedBlock(x, Math.floor(at.y) - 1, z);
              if (support === undefined || !isSolid(support)) safe = false;
              for (let y = Math.floor(box.minY); y <= Math.floor(box.maxY + .15); y++)
                if (world.getLoadedBlock(x, y, z) !== 0) safe = false;
            }
          // Solid support can extend into the proposed body (notably a fence's1.5-high
          // shape). Check actual geometry, including every origin/neighbor it reads.
          let geometryKnown = true;
          const collides = safe && boxCollides((x, y, z) => {
            const id = world.getLoadedBlock(x, y, z);
            if (id === undefined) { geometryKnown = false; return blockId("stone"); }
            return id;
          }, box);
          if (safe && geometryKnown && !collides) return at;
        }
      }
  return null;
}
