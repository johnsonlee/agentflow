import type {Vec3} from '../core/math';
/** Canonical bag identity plus hidden axis states, persisted by existing Uint16 world edits.
 * Recipe declarations are pinned Education facts; hit-face orientation and numeric harvest
 * policy are application behavior, not current Education runtime calibration.
 */
export const HAY_BLOCK_ID = 208;
export const HAY_AXIS_STATES = Object.freeze([
  Object.freeze({id:HAY_BLOCK_ID,name:'hay_block',axis:'y' as const,creative:true}),
  Object.freeze({id:209,name:'hay_block_x',axis:'x' as const,creative:false}),
  Object.freeze({id:210,name:'hay_block_z',axis:'z' as const,creative:false}),
]);
export function hayAxisOf(id:number):'x'|'y'|'z'|null{return HAY_AXIS_STATES.find(row=>row.id===id)?.axis??null;}
/** The clicked face's perpendicular axis. Omitted legacy normal keeps upright placement. */
export function hayPlacementId(normal?:Vec3):number|null{
 if(normal===undefined)return HAY_BLOCK_ID;
 try {
  if(!normal||typeof normal!=='object'||Array.isArray(normal)||![Object.prototype,null].includes(Object.getPrototypeOf(normal)))return null;
  const keys=Reflect.ownKeys(normal);if(keys.length!==3||keys.some(k=>k!=='x'&&k!=='y'&&k!=='z'))return null;
  const values=['x','y','z'].map(key=>{const d=Object.getOwnPropertyDescriptor(normal,key);return d&&'value'in d?d.value:NaN;});
  if(!values.every(Number.isInteger)||values.reduce((n,v)=>n+Math.abs(v),0)!==1)return null;
  return values[0]?209:values[2]?210:HAY_BLOCK_ID;
 }catch{return null;}
}
/** End caps follow the pillar axis; longitudinal side grain/bindings rotate with the block. */
export function hayFaceAppearance(id:number,normal:readonly[number,number,number]):{texture:string;rotateUV:boolean}|null{
 const axis=hayAxisOf(id);if(axis===null)return null;
 const end=normal[axis==='x'?0:axis==='y'?1:2]!==0;
 return {texture:end?'hay_block_top':'hay_block_side',rotateUV:!end&&axis!=='y'&&(normal[1]===0||axis==='x')};
}
