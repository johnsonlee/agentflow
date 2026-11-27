import {parseCommand,type Command} from "../automation/commands";
import {NPC_COMMAND_BYTES} from "./npc-actions";
export type NpcLocalCommand=Extract<Command,{type:"give"|"time"|"gamerule"|"effect"|"seed"|"help"}>;
export type NpcCommandRead={ok:true;command:NpcLocalCommand}|{ok:false;message:string};
/** Complete-input current-app grammar, not native selector/command compatibility. */
export function compileNpcCommand(text:unknown):NpcCommandRead {
 const no=():NpcCommandRead=>({ok:false,message:"Unsupported NPC command. Use the listed local command forms."});
 if(typeof text!=="string"||text!==text.trim()||!text.startsWith("/")||new TextEncoder().encode(text).length>NPC_COMMAND_BYTES||/[\p{Cc};]/u.test(text))return no();
 const t=text.slice(1).split(/ +/),name=t[0].toLowerCase();
 if(!t.every(Boolean))return no();
 const length=t.length;
 if(name==="give") {if(length!==2&&length!==3||!/^([a-z0-9_]+:)?[a-z0-9_]+$/i.test(t[1])||length===3&&!/^[1-9][0-9]*$/.test(t[2]))return no();}
 else if(name==="time"){if(length!==3||t[1]!=="set")return no();}
 else if(name==="gamerule"){if(length!==3)return no();}
 else if(name==="effect"){if(t[1]!=="@s"||length<3||length>5)return no();}
 else if(name==="seed"||name==="help"){if(length!==1)return no();}
 else return no();
 const command=parseCommand(text);
 if(command.type!=="give"&&command.type!=="time"&&command.type!=="gamerule"&&command.type!=="effect"&&command.type!=="seed"&&command.type!=="help")return no();
 return {ok:true,command};
}
