import { test } from "@playwright/test";
import { caneNaturalGrowthRoute } from "./cane-natural-growth";
test("mobile: portrait and landscape real Cane regrowth, pause/cold clock and finite replant", async ({ page }, info) => {
  test.setTimeout(840000); await caneNaturalGrowthRoute(page, info, true, { width: 390, height: 844 }); await caneNaturalGrowthRoute(page, info, true, { width: 915, height: 412 });
});
