import { isDimensionId } from "../core/dimensions";
import { WORLD_BORDER } from "../core/math";
import type { DimensionGeneratedBlockProbe } from "../persistence/dimension-save";
import { WORLD_HEIGHT, toChunkCoord, toLocalCoord, type Chunk } from "./chunk";
import { TerrainGenerator } from "./generator";
import { NetherGenerator } from "./nether-generator";

/** Private, bounded pure terrain caches. No World, listeners, simulation or saved
 * edits are created; the raw archive reader applies edited-cell precedence. */
export function createDimensionGeneratedBlockProbe(): DimensionGeneratedBlockProbe {
  const generators = new Map<string,TerrainGenerator|NetherGenerator>(), chunks = new Map<string,Chunk>();
  return (dimension,seed,version,x,y,z) => {
    if(!isDimensionId(dimension)||!Number.isInteger(seed)||seed < -2147483648||seed > 2147483647||![x,y,z].every(Number.isSafeInteger)||Math.abs(x)>WORLD_BORDER||Math.abs(z)>WORLD_BORDER||y<0||y>=WORLD_HEIGHT||version!==1&&version!==2&&version!==3||dimension==="nether"&&version!==1)return undefined;
    const identity=`${dimension}:${seed}:${version}`,cx=toChunkCoord(x),cz=toChunkCoord(z),key=`${identity}:${cx},${cz}`;
    try {
      let chunk=chunks.get(key);
      if(chunk){chunks.delete(key);chunks.set(key,chunk);}
      else {
        let generator=generators.get(identity);
        if(generator)generators.delete(identity);
        else generator=dimension==="nether"?new NetherGenerator(seed,1):new TerrainGenerator(seed,version);
        generators.set(identity,generator);
        while(generators.size>4)generators.delete(generators.keys().next().value!);
        chunk=generator.generate(cx,cz);chunks.set(key,chunk);
        while(chunks.size>8)chunks.delete(chunks.keys().next().value!);
      }
      return chunk.get(toLocalCoord(x),y,toLocalCoord(z));
    } catch { return undefined; }
  };
}
