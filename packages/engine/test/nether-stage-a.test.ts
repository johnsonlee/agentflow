import {expect,it} from "vitest";
import {blockId,BLOCKS,blockById} from "../src/catalog/blocks";
import {itemId,ITEMS,isKnownId,dropCount,placedBlockOf} from "../src/catalog/items";
import {RECIPES,craftOnce} from "../src/crafting/crafting";
import {smeltResult,createFurnace,tickFurnace} from "../src/crafting/smelting";
import {NATIVE_MATERIAL_REDUCTIONS} from "../src/crafting/native-reductions";
import {NetherGenerator} from "../src/world/nether-generator";
import {WORLD_HEIGHT} from "../src/world/chunk";
import {reduceMaterial} from "../src/crafting/chemistry";
import {elementBlockId} from "../src/catalog/blocks";
import baseline from "./fixtures/nether-7c-baseline.json";
it("appends distinct material and item identities without altering prior registries",()=>{
 expect(BLOCKS.find(b=>b.name==="netherrack")?.id).toBe(194);
 expect(BLOCKS.find(b=>b.name==="soul_sand")?.id).toBe(195);
 expect(BLOCKS.find(b=>b.name==="nether_bricks")?.id).toBe(196);
 expect(ITEMS.find(b=>b.name==="nether_brick")?.id).toBe(841);
 expect(JSON.parse(JSON.stringify(BLOCKS.slice(0,313)))).toEqual(baseline.blocks);
 expect(JSON.parse(JSON.stringify(ITEMS.slice(0,585)))).toEqual(baseline.items);
});
it("excludes hidden Wart physical ages from every generic inventory/drop/placement path",()=>{
 for(let age=0;age<4;age++){const b=BLOCKS.find(b=>b.name===`nether_wart_${age}`);expect(b?.id).toBe(197+age);expect(b?.creative).toBe(false);expect(isKnownId(197+age)).toBe(false);expect(dropCount(197+age)).toBe(0);expect(placedBlockOf(197+age)).toBeNull();}
 expect(placedBlockOf(itemId("nether_wart"))).toBeNull();
});
it("uses real smelting/crafting and ordered retained reducer declarations",()=>{
 expect(smeltResult(blockId("netherrack"))).toBe(itemId("nether_brick"));
 expect(RECIPES.find(r=>r.id==="blaze_powder")).toMatchObject({ingredients:["blaze_rod"],result:["blaze_powder",2]});
 expect(RECIPES.find(r=>r.id==="nether_bricks")).toMatchObject({pattern:["##","##"],key:{"#":"nether_brick"},result:["nether_bricks",1]});
 expect(RECIPES.slice(0,168)).toEqual(baseline.recipes);
 expect(NATIVE_MATERIAL_REDUCTIONS.find(r=>r.input==="soul_sand")?.output).toEqual([[14,37],[8,3],[0,29],[0,1],[0,30]]);
});
it("generates real roofed caverns and Lava inside the existing96-block buffer",()=>{
 const g=new NetherGenerator(12345),c=g.generate(0,0);expect(WORLD_HEIGHT).toBe(96);expect(c.blocks.length).toBe(24576);
 for(let x=0;x<16;x++)for(let z=0;z<16;z++){expect(c.get(x,95,z)).toBe(blockId("bedrock"));expect(c.get(x,0,z)).toBe(blockId("bedrock"));}
 expect([...c.blocks].filter(id=>id===0).length).toBeGreaterThan(3000);let lava=0;for(let cx=-2;cx<=2;cx++)for(let cz=-2;cz<=2;cz++)lava+=[...g.generate(cx,cz).blocks].filter(id=>id===190).length;expect(lava).toBeGreaterThan(500);
 expect(g.biomeAt(0,0)).toBe("nether_wastes");
});
it("provides real detached fortress and supported natural spawn descriptors",()=>{
 const g=new NetherGenerator(12345),f=g.fortressAt(0,0);expect(f).not.toBeNull();const p=g.findNaturalSpawn(0,0,32);expect(p).not.toBeNull();
});

it("executes actual craft/smelt/reduce paths without treating hidden Wart as an ingredient",()=>{
 const rods=[{id:itemId("blaze_rod"),count:1},null,null,null];expect(craftOnce(rods,2)).toEqual({id:itemId("blaze_powder"),count:2});expect(rods.every(s=>s===null)).toBe(true);
 const bricks=Array.from({length:4},()=>({id:itemId("nether_brick"),count:1}));expect(craftOnce(bricks,2)).toEqual({id:196,count:1});expect(bricks.every(s=>s===null)).toBe(true);
 const f=createFurnace();f.input={id:194,count:1};f.fuel={id:itemId("coal"),count:1};tickFurnace(f,10);expect(f.output).toEqual({id:841,count:1});expect(f.input).toBeNull();
 const reduced=reduceMaterial(195)!;expect(reduced.slice(-3)).toEqual([{id:elementBlockId(0),count:29},{id:elementBlockId(0),count:1},{id:elementBlockId(0),count:30}]);
 for(let age=197;age<=200;age++){expect(reduceMaterial(age)).toBeNull();expect(craftOnce([{id:age,count:1},null,null,null],2)).toBeNull();}
});
