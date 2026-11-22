import{WORLD_BORDER}from'../core/math';
import{WORLD_HEIGHT}from'./chunk';
/** Placement never rounds coordinates. Match writable world cells, not the wider read halo.
 * Validate the complete oriented batch before any query, generation, write or item debit.
 */
export function writablePlacementCell(x:number,y:number,z:number):boolean{
 return [x,y,z].every(Number.isSafeInteger)&&y>=0&&y<WORLD_HEIGHT&&Math.abs(x)<=WORLD_BORDER&&Math.abs(z)<=WORLD_BORDER;
}
export function placementCellsWithinWorld(cells:ReadonlyArray<readonly[number,number,number,number]>):boolean{
 return cells.every(([x,y,z])=>writablePlacementCell(x,y,z));
}
