import {findAgentPosition,type AgentState}from '../automation/agent';
import {facingTowards}from '../education/chalkboard';
import type {Vec3}from '../core/math';
import type {World}from '../world/world';
import {readOwnedAgentItemCount}from './agent-item-count';
import {ownedCargoFingerprint}from './owned-placement-cargo';

/** Existing app nearby-cell/facing policy, not a calibrated native teleport pose.
 * Stage the search, then revalidate the exact original owner before any pose write.
 * No cargo lease or rollback: a legitimate reentrant owner keeps its own changes. */
export function teleportOwnedAgentToPlayer(world:Pick<World,'getBlock'>,agent:AgentState,player:Vec3,yaw:number,lifecycleValid:()=>boolean=()=>true):boolean{
 try{
  if(readOwnedAgentItemCount(agent,0)===undefined||!Number.isFinite(yaw))return false;
  const slots=agent.slots,before=ownedCargoFingerprint(agent,slots);
  const axes=['x','y','z']as const,pose=axes.map(axis=>Object.getOwnPropertyDescriptor(player,axis));
  if(!pose.every(d=>d&&'value'in d&&Number.isFinite(d.value)))return false;
  const writable=()=>['x','y','z','facing'].every(k=>Object.getOwnPropertyDescriptor(agent,k)?.writable===true);
  if(!writable())return false;
  const valid=()=>lifecycleValid()===true&&axes.every((axis,i)=>{const d=Object.getOwnPropertyDescriptor(player,axis);return !!d&&'value'in d&&d.value===pose[i]!.value;})&&
   readOwnedAgentItemCount(agent,0)!==undefined&&agent.slots===slots&&ownedCargoFingerprint(agent,slots)===before&&writable();
  if(!valid())return false;
  const next=findAgentPosition(world,{x:pose[0]!.value,y:pose[1]!.value,z:pose[2]!.value},yaw);
  if(!next||!valid())return false;
  Object.assign(agent,{x:next.x,y:next.y,z:next.z,facing:facingTowards(yaw+Math.PI)});
  return true;
 }catch{return false;}
}
