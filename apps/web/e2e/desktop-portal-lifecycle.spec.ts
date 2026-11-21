import { test } from "@playwright/test";
import { portalLifecycleRoute } from "./portal-lifecycle";
test("desktop: actual nine-source Obsidian and Iron-Flint tool to placed portal, cold owner, collapse and original recovery",async({page},info)=>{test.setTimeout(1_200_000);await portalLifecycleRoute(page,info,false);});
