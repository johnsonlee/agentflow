import { expect, it } from "vitest";
import { COMPOUNDS, ELEMENTS, ITEMS, LAB_REACTIONS, createCompound, labReaction, planLabExperiment, stackId, Inventory, parseSave, serializeSave, type ItemStack, type SaveData } from "../src/index";
const item = (name: string, count = 1) => ({ id: stackId(name), count });
const grid = (...s: ItemStack[]) => [...s, ...new Array(9 - s.length).fill(null)];
for (const r of LAB_REACTIONS) it(`explicit plan preserves ${r.product} recipe, position independence and inputs`, () => {
  const g = grid(...r.ingredients.map(([n, c]) => item(n, c))), before = structuredClone(g);
  for (const cells of [g, [...g].reverse()]) {
    const p = planLabExperiment(cells, null); expect(p).toMatchObject({ ok: true, kind: "product", id: stackId(r.product), cursor: item(r.product) });
    if (p.ok) expect(p.grid).toEqual(new Array(9).fill(null));
  }
  expect(g).toEqual(before); expect(labReaction(g)).toEqual({ id: stackId(r.product) });
});
it('35 Compound Creator formulas and118 elements are untouched; new product appends after Camera', () => {
  expect(COMPOUNDS).toHaveLength(35); expect(ELEMENTS.map(e => e.z)).toEqual(Array.from({ length: 118 }, (_, i) => i + 1));
  for (const c of COMPOUNDS) expect(createCompound(c.recipe.map(([s, count]) => ({ id: stackId(ELEMENTS.find(e => e.symbol === s)!.name.toLowerCase()), count })))).toEqual({ id: stackId(c.name) });
  expect(stackId('camera')).toBe(860); expect(stackId('garbage')).toBe(861); expect(ITEMS.at(-1)?.name).toBe('garbage');
});
it('ordinary eligible unmatched/extra-quantity mixtures plan one Garbage without mutating source', () => {
  for (const g of [grid(item('oxygen')), grid(item('iron', 2), item('water_compound'), item('salt'), item('charcoal'))]) {
    const before = structuredClone(g), p = planLabExperiment(g, item('garbage', 63));
    expect(p).toMatchObject({ ok: true, kind: 'garbage', cursor: item('garbage', 64) }); expect(g).toEqual(before);
  }
});
for (const [label, raw] of [['empty', new Array(9).fill(null)], ['block', grid(item('dirt'))], ['product', grid(item('bleach'))], ['book', grid(item('book_and_quill'))], ['unknown', grid({ id: 99999, count: 1 })], ['count0', grid(item('oxygen', 0))], ['count65', grid(item('oxygen', 65))], ['fraction', grid(item('oxygen', 1.5))], ['hole', new Array(9)], ['wronglength', []], ['frozen', Object.freeze(grid(item('oxygen')))]] as const)
  it(`refuses ${label} instead of consuming it as garbage`, () => { expect(planLabExperiment(raw, null).ok).toBe(false); });
it('rejects getters/unsupported metadata/proxies without reading accessor values', () => {
  let reads = 0; const raw = Object.defineProperty({ id: stackId('oxygen') }, 'count', { get() { reads++; throw Error('foreign getter'); }, enumerable: true });
  expect(planLabExperiment(grid(raw as ItemStack), null).ok).toBe(false); expect(reads).toBe(0);
  expect(planLabExperiment(grid({ ...item('oxygen'), damage: 0 }), null).ok).toBe(false);
  expect(planLabExperiment(grid(new Proxy(item('oxygen'), {})), null).ok).toBe(false);
  expect(planLabExperiment(new Proxy(grid(item('oxygen')), {}), null).ok).toBe(false);
});
for (const cursor of [item('garbage', 64), item('salt'), { ...item('garbage'), book: { pages: ['keep'] } }]) it('incompatible/full/metadata cursor refuses without a plan', () => { expect(planLabExperiment(grid(item('oxygen')), cursor).ok).toBe(false); });
it('ordinary Garbage bag and pending owners survive real serialize/parse and Inventory load unchanged', () => {
  const bag = new Inventory(); bag.setSlot(0, item('garbage', 63)); bag.setSlot(1, item('antidote'));
  const save: SaveData = { version: 1, name: 'Lab ownership', seed: 1, generatorVersion: 3, mode: 'survival', timeOfDay: .25, player: { position: { x: .5, y: 80, z: .5 }, yaw: 0, pitch: 0, flying: false }, inventory: bag.toJSON(), inventoryPending: [item('garbage'), item('oxygen', 2)], edits: [] };
  const cold = parseSave(serializeSave(save)); expect(cold.inventoryPending).toEqual(save.inventoryPending); expect(Inventory.fromJSON(cold.inventory).toJSON()).toEqual(bag.toJSON());
});
