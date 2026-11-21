import { test } from "@playwright/test";
import { fluidAcquisitionRoute } from "./fluid-acquisition";
test("mobile: natural Iron to crafted Bucket, real Water/Lava acquisition and Obsidian casting with cold/raw recovery", async ({page},info)=>{test.setTimeout(600_000);await fluidAcquisitionRoute(page,info,true);});
