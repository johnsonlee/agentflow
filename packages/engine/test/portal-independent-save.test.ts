import { expect,it } from "vitest";
import { Inventory,parseSave,serializeSave,type SaveData } from "../src";
it.each([[192,false],[193,false],[192,true],[193,true]]as const)("independent: malformed hidden physical tuple%s with marker%s cannot be silently repaired",(id,marker)=>{
 const raw={version:1,name:"Malformed portal",seed:1,mode:"survival",timeOfDay:.2,player:{position:{x:.5,y:80,z:.5},yaw:0,pitch:0,flying:false},inventory:new Inventory().toJSON(),edits:[[0,80,0,id,"extra"]],...(marker?{portals:{version:1,records:[]}}:{})};
 const original=JSON.stringify(raw),loaded=parseSave(original);expect(loaded.portalsInvalid).toBe(true);
 const {version,...payload}=raw;expect(()=>serializeSave(payload as unknown as Omit<SaveData,"version">)).toThrow(/portal/i);
});
