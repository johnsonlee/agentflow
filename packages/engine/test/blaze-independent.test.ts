import {expect,it} from 'vitest';
import {World} from '../src/world/world';
import {BlazeFireballs,sanitizeBlazeFireballs} from '../src/simulation/blaze-fireballs';
it('rejects overflowing finite direction before allocating an unsavable projectile owner',()=>{
 const world=new World(7);world.getChunk(0,0);const pool=new BlazeFireballs(world),before=pool.exportState();
 expect(pool.trySpawn(1,{x:8,y:90,z:8},{x:Number.MAX_VALUE,y:Number.MAX_VALUE,z:0})).toBe(false);expect(pool.exportState()).toEqual(before);expect(sanitizeBlazeFireballs(pool.exportState()).invalid).toBe(false);
});
