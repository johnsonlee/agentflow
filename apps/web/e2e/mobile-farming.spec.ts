import { test } from "@playwright/test";
import { farmingRoute } from "./farming";
import { furnaceCapacityRoute } from "./furnace-capacity";

test("Mobile: craft a hoe, plant and save wheat, fertilize, harvest, bake and eat bread", async ({ page }, info) => {
  test.setTimeout(240_000);
  await farmingRoute(page, info, true);
});

test("Mobile: a full bag cannot delete a furnace containing worn armor", async ({ page }, info) => {
  test.setTimeout(120_000);
  await furnaceCapacityRoute(page, info, true);
});
