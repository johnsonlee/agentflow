import {expect,it} from "vitest";
import {allAtlasTextureNames,DYE_COLORS} from "@craft/engine";
import {buildAtlas,generateTile,TILE_NAMES} from "../src/index";
import oldNames from "./fixtures/hardened-glass-base-5f-atlas.json";

it("appends sixteen distinct original translucent reinforcement tiles without moving any prior atlas UV",()=>{
 const names=allAtlasTextureNames(),newNames=DYE_COLORS.map(c=>`hardened_${c.name}_stained_glass`);
 expect(names).toHaveLength(936);expect(names.slice(0,920)).toEqual(oldNames);expect(names.slice(920)).toEqual(newNames);
 expect(TILE_NAMES).toHaveLength(345);expect(TILE_NAMES.slice(329)).toEqual(newNames);
 const old=buildAtlas(oldNames),current=buildAtlas(names);expect([current.width,current.height]).toEqual([old.width,old.height]);
 for(const name of oldNames){expect(current.uv(name)).toEqual(old.uv(name));expect(current.tilePixels(name)).toEqual(old.tilePixels(name));}
 const distinct=new Set<string>();
 for(const [i,name]of newNames.entries()){
  const pixels=generateTile(name);expect(pixels).toHaveLength(1024);expect(pixels).toEqual(generateTile(name));expect(pixels).not.toEqual(generateTile(`${DYE_COLORS[i].name}_stained_glass`));
  expect([...pixels].some((n,j)=>j%4===3&&n>0&&n<255)).toBe(true);expect(current.tilePixels(name)).toEqual(pixels);distinct.add(Buffer.from(pixels).toString('base64'));
 }
 expect(distinct.size).toBe(16);
});
