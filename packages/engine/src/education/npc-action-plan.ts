import {npcActionRows,readNpcActions,type NpcAction,type NpcActions,type NpcTrigger} from "./npc-actions";
import {compileNpcCommand,type NpcLocalCommand} from "./npc-command";
export type NpcStep={index:number;action:NpcAction;command?:NpcLocalCommand};
export type NpcPhasePlan={ok:true;steps:NpcStep[]}|{ok:false;message:string};
/** Entire phase preflight. An unsupported tail never publishes a valid prefix. */
export function planNpcPhase(raw:NpcActions,trigger:NpcTrigger,buttonIndex?:number):NpcPhasePlan{
 if(trigger!=="button"&&trigger!=="enter"&&trigger!=="exit")return{ok:false,message:"Invalid NPC phase."};
 const parsed=readNpcActions(raw);if(parsed.kind!=="valid")return{ok:false,message:"Invalid NPC actions. Export the original backup."};
 const rows=npcActionRows(parsed.data),steps:NpcStep[]=[];
 if(trigger==="button"&&(!Number.isInteger(buttonIndex)||buttonIndex!<0||buttonIndex!>=rows.length||rows[buttonIndex!].trigger!=="button"))return{ok:false,message:"This NPC button is unavailable."};
 for(let i=0;i<rows.length;i++){
  const action=rows[i];if(action.trigger!==trigger||trigger==="button"&&i!==buttonIndex)continue;
  if(action.kind==="command"){const c=compileNpcCommand(action.command);if(!c.ok)return c;steps.push({index:i,action,command:c.command});}
  else steps.push({index:i,action});
 }
 return{ok:true,steps};
}
