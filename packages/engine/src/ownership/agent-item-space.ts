import type {AgentState} from '../automation/agent';
import {readOwnedAgentSlotNumber} from './agent-slot-query';

/** App capacity policy: empty = 64; occupied = metadata-aware stack limit minus count.
 * Native empty/invalid/item-specific capacity behavior is not calibrated. Unavailable
 * ownership remains undefined, never zero; this read never reserves or repairs cargo. */
export function readOwnedAgentItemSpace(agent:AgentState,slot:number,lifecycleValid:()=>boolean=()=>true):number|undefined{
 return readOwnedAgentSlotNumber(agent,slot,'space',lifecycleValid);
}
