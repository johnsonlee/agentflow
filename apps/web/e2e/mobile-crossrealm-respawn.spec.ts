import {test} from "@playwright/test";
import {crossrealmRespawnRoute} from "./crossrealm-respawn";
for(const keepInventory of [false,true])test(`mobile: actual Nether void death and Overworld Respawn UI retains separate owners (keepInventory=${keepInventory})`,async({page},info)=>{test.setTimeout(240_000);await crossrealmRespawnRoute(page,info,true,keepInventory);});
