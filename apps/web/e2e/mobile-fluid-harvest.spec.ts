import { test } from "@playwright/test";
import { fluidHarvestRoute } from "./fluid-harvest";
test("mobile: scoped actual natural Diamonds and Birch to crafted Diamond Pickaxe and prior-cast Obsidian harvest", async ({ page }, info) => {
  test.setTimeout(600_000); await fluidHarvestRoute(page, info, true);
});
