import {test} from "@playwright/test";
import {leatherArmorRoute} from "./leather-armor";
test("mobile: finite Leather recipes, equipment, actual melee55, cold ownership and fullbag refusal",async({page},info)=>{
  test.setTimeout(900_000);
  await leatherArmorRoute(page,info,true);
});
