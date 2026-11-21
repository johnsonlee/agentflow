import baseline from "../../textures/test/fixtures/fluids-8635914.json";
import { canHarvest } from "../src/world/rules";
import { toolOf } from "../src/catalog/items";
import { expect, it } from "vitest";
import { BLOCKS, blockById, isSolid } from "../src/catalog/blocks";
import { ITEMS, itemId, itemById, isKnownId, placedBlockOf, dropOf, durabilityOf } from "../src/catalog/items";
it("registers source-only Lava outside inventory and solid harvestable Obsidian at append-only IDs",()=>{
 expect(BLOCKS.find(b=>b.name==="lava")?.id).toBe(190);expect(BLOCKS.find(b=>b.name==="obsidian")?.id).toBe(191);
 expect(blockById(190)).toMatchObject({shape:"liquid",solid:false,transparent:true,creative:false,light:15,hardness:Infinity});
 expect(isKnownId(190)).toBe(false);expect(placedBlockOf(190)).toBeNull();
 expect(isSolid(191)).toBe(true);expect(placedBlockOf(191)).toBe(191);expect(dropOf(191)).toBe(191);
 expect(blockById(191)).toMatchObject({tool:"pickaxe",harvestTier:4,hardness:35});
});
it("adds whole fluid vessels without tool wear or direct block placement",()=>{
 expect(ITEMS.find(i=>i.name==="water_bucket")?.id).toBe(839);expect(ITEMS.find(i=>i.name==="lava_bucket")?.id).toBe(840);
 for(const name of ["water_bucket","lava_bucket"]){const id=itemId(name);expect(itemById(id).maxStack).toBe(1);expect(placedBlockOf(id)).toBeNull();expect(durabilityOf(id)).toBeNull();}
});

it("keeps every previously published item and block definition and enforces player Diamond harvest",()=>{
 expect(JSON.parse(JSON.stringify(ITEMS.slice(0,baseline.items.length)))).toEqual(baseline.items);
 expect(JSON.parse(JSON.stringify(BLOCKS.slice(0,baseline.blocks.length)))).toEqual(baseline.blocks);
 for(const tool of [null,...["wooden_pickaxe","stone_pickaxe","iron_pickaxe","golden_pickaxe"].map(n=>toolOf(itemId(n)))])expect(canHarvest(191,tool)).toBe(false);
 expect(canHarvest(191,toolOf(itemId("diamond_pickaxe")))).toBe(true);
});
