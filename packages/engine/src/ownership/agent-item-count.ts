import type {AgentState} from '../automation/agent';
import {readOwnedAgentSlotNumber} from './agent-slot-query';

/** App policy: null means zero; unavailable/malformed/busy/stale means undefined, never zero.
 * No mutation lease, metadata reference, normalization or external callbacks escape this read. */
export function readOwnedAgentItemCount(agent:AgentState,slot:number,lifecycleValid:()=>boolean=()=>true):number|undefined{
 return readOwnedAgentSlotNumber(agent,slot,'count',lifecycleValid);
}
