/** Original half-block application geometry and face placement policy; native Education
 * geometry, hit thresholds, waterlogging and half-step pathfinding are not calibrated. */
export const WOOD_SLAB_STATES = Object.freeze(([
 {id:211,name:'oak_slab',species:'oak',half:'lower',canonical:211},
 {id:212,name:'oak_slab_upper',species:'oak',half:'upper',canonical:211},
 {id:213,name:'oak_double_slab',species:'oak',half:'double',canonical:211},
 {id:214,name:'birch_slab',species:'birch',half:'lower',canonical:214},
 {id:215,name:'birch_slab_upper',species:'birch',half:'upper',canonical:214},
 {id:216,name:'birch_double_slab',species:'birch',half:'double',canonical:214},
] as const).map(state=>Object.freeze(state)));
export type WoodSlabState = typeof WOOD_SLAB_STATES[number];
export type SlabHalf = 'lower'|'upper';
export function woodSlabState(id:number):WoodSlabState|undefined{return WOOD_SLAB_STATES.find(row=>row.id===id);}
export function woodSlabBounds(id:number):readonly[number,number,number,number,number,number]|undefined{const state=woodSlabState(id);return state?state.half==='lower'?[0,0,0,1,.5,1]:state.half==='upper'?[0,.5,0,1,1,1]:[0,0,0,1,1,1]:undefined;}
