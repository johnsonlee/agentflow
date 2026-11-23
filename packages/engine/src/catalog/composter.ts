/** Bounded original application model; only the seven-slab recipe and generic Hay85%
 * compost example have retained primary support. Seed/Wheat probabilities, first-layer
 * behavior, timer, output count and geometry are not measured Education runtime facts. */
export const COMPOSTER_ID=217;
export const COMPOSTER_APP_PROFILE=Object.freeze({seedChance:.3,wheatChance:.65,hayChance:.85,firstLayerGuaranteed:false,matureSeconds:1,maximumStations:4096,maximumAttempts:1e9,outputId:859,outputCount:1});
export const COMPOSTER_STATES=Object.freeze(Array.from({length:9},(_,level)=>Object.freeze({id:COMPOSTER_ID+level,name:level===0?'composter':`composter_${level}`,level,canonical:COMPOSTER_ID,creative:level===0})));
export function composterLevel(id:number):number|null{return Number.isInteger(id)&&id>=217&&id<=225?id-217:null;}
export type ComposterBox=readonly[number,number,number,number,number,number];
export interface ComposterPart{readonly box:ComposterBox;readonly top:string;readonly side:string;readonly bottom:string}
const part=(box:ComposterBox,top:string,side=top,bottom=side):ComposterPart=>Object.freeze({box:Object.freeze(box),top,side,bottom});
const shared=[part([0,0,0,1,.125,1],'composter_inside','composter_side','composter_bottom'),part([0,.125,0,1,1,.125],'composter_top','composter_side'),part([0,.125,.875,1,1,1],'composter_top','composter_side'),part([0,.125,.125,.125,1,.875],'composter_top','composter_side'),part([.875,.125,.125,1,1,.875],'composter_top','composter_side')];
/** Open rim, base, four walls and a real rising interior, shared by collision/selection/mesh. */
export const COMPOSTER_PARTS=Object.freeze(Array.from({length:9},(_,level)=>Object.freeze([...shared,...(level?[part([.125,.125,.125,.875,.125+Math.min(level,7)*(.75/7),.875],level===8?'composter_ready':'composter_compost')]:[])])));
export function composterParts(id:number):readonly ComposterPart[]|undefined{const level=composterLevel(id);return level===null?undefined:COMPOSTER_PARTS[level];}
