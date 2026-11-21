import { test } from "@playwright/test";
import { ignitionRoute } from "./ignition";
test("PC: natural Flint and smelted Iron craft a working ignition tool, Fire contact and cold ownership",async({page},info)=>{test.setTimeout(300_000);await ignitionRoute(page,info,false);});
