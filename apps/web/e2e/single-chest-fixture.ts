import { Inventory, createAgent, blockId, stackId, serializeSave, parseSave, type ItemStack, type SaveData, type BlockEdit } from '@craft/engine';
export const CHEST_A = { x: 1, y: 80, z: 0 }, CHEST_B = { x: -3, y: 80, z: 0 };
export const metadata: ItemStack[] = [{ id: stackId('iron_axe'), count: 1, damage: 13 }, { id: stackId('written_book'), count: 1, book: { pages: ['Edited storage page', 'β second page'], title: 'Chest record', author: 'User' } }, { id: stackId('glow_stick'), count: 1, glow: { state: 'active' } }, { id: stackId('orange_sparkler'), count: 2, sparkler: { state: 'inactive' } }, { id: stackId('tonic'), count: 1 }];
/** Initial kit only: no crafted Chest or subsequent outcomes. Prior-owned portal is a navigation fixture. */
export function chestFixture(): SaveData {
    const bag = new Inventory();
    for (let i = 0; i < 36; i++)
        bag.slots[i] = { id: blockId('cobblestone'), count: 64 };
    bag.slots[0] = { id: blockId('oak_planks'), count: 12 };
    bag.slots[1] = { id: blockId('birch_planks'), count: 4 };
    metadata.forEach((s, i) => bag.slots[i + 2] = structuredClone(s));
    bag.slots[7] = { id: stackId('iron_axe'), count: 1, damage: 3 };
    bag.slots[8] = { id: blockId('stone'), count: 60 };
    bag.slots[9] = { id: blockId('stone'), count: 8 };
    const agent = createAgent(-3, 80, 1, 2);
    for (let i = 0; i < 27; i++)
        agent.slots[i] = { id: blockId('cobblestone'), count: 64 };
    const cells = new Map<string, BlockEdit>(), put = (x: number, y: number, z: number, id: number) => cells.set(`${x},${y},${z}`, [x, y, z, id]);
    for (let x = -12; x <= 12; x++)
        for (let z = -12; z <= 12; z++) {
            put(x, 79, z, blockId('stone'));
            for (let y = 80; y <= 84; y++)
                put(x, y, z, 0);
        }
    put(0, 80, -3, blockId('crafting_table'));
    for (let x = 8; x <= 9; x++) {
        put(x, 79, -6, blockId('obsidian'));
        put(x, 83, -6, blockId('obsidian'));
        for (let y = 80; y <= 82; y++)
            put(x, y, -6, 192);
    }
    for (let y = 80; y <= 82; y++) {
        put(7, y, -6, blockId('obsidian'));
        put(10, y, -6, blockId('obsidian'));
    }
    return { version: 1, name: 'Single Chest raw full-bag browser scope', seed: 7, generatorVersion: 2, mode: 'survival', timeOfDay: .25, player: { position: { x: .5, y: 80, z: 4.5 }, yaw: 0, pitch: 0, flying: false }, playerState: { health: 20 }, inventory: bag.toJSON(), agent, programs: [], edits: [...cells.values()], portals: { version: 1, records: [{ axis: 'x', x: 8, y: 80, z: -6, width: 2, height: 3 }] }, gamerules: { doMobSpawning: false, doDaylightCycle: false, keepInventory: false } };
}
export function fixtureContract() { const initial = chestFixture(), keys = initial.edits.map(e => e.slice(0, 3).join(',')); if (keys.length !== new Set(keys).size)
    throw Error('Duplicate physical fixture cell'); if (initial.inventory.slots.filter(Boolean).length !== 36 || initial.agent!.slots.filter(Boolean).length !== 27)
    throw Error('Expected full fixture bags'); if (initial.edits.some(e => e[3] === 203) || initial.inventory.slots.some(s => s?.id === 203) || initial.agent!.slots.some(s => s?.id === 203) || initial.chests !== undefined)
    throw Error('Chest outcome cannot be granted'); const raw = serializeSave(initial), cold = parseSave(raw); if (cold.chestOwnershipIssues?.length || cold.dimensionsInvalid || cold.portalOwnershipIssues?.length || cold.glowOwnershipIssues?.length || cold.sparklerOwnershipIssues?.length || cold.brewingOwnershipIssues?.length)
    throw Error('Actual codec rejected fixture'); if (JSON.stringify(cold.edits) !== JSON.stringify(initial.edits) || cold.chests !== undefined)
    throw Error('Codec repaired physical fixture'); if (JSON.stringify(cold.inventory) !== JSON.stringify(initial.inventory) || JSON.stringify(cold.agent) !== JSON.stringify(initial.agent))
    throw Error('Codec repaired fixture metadata'); return { initial, raw, uniquePhysicalCells: keys.length, metadata: structuredClone(metadata) }; }
