import { it, expect } from "vitest";
import { createHash } from "node:crypto";
import fixture from "./fixtures/terrain-v1-8635914.json";
import { TerrainGenerator } from "../src/world/generator";
it.each(fixture.chunks)("preserves historical published863 v1 seed $seed chunk $cx,$cz", row=>{
 const generated=new TerrainGenerator(row.seed,1).generate(row.cx,row.cz),bytes=Buffer.alloc(generated.blocks.length*2);
 generated.blocks.forEach((id,i)=>bytes.writeUInt16LE(id,i*2));
 expect(generated.blocks.length).toBe(row.blockCount);expect(createHash("sha256").update(bytes).digest("hex")).toBe(row.blocksSHA256);
});
