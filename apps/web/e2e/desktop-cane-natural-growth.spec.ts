import { test } from "@playwright/test";
import { caneNaturalGrowthRoute } from "./cane-natural-growth";
test("desktop: real upper harvest, unaccelerated Cane regrowth, pause/cold clock and finite replant", async ({ page }, info) => {
  test.setTimeout(420000); await caneNaturalGrowthRoute(page, info, false, { width: 1280, height: 720 });
});
