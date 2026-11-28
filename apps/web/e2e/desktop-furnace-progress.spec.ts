import { test } from "@playwright/test";
import { furnaceProgressRoute } from "./furnace-progress";
test("PC: furnace input identity resets partial work, same ore top-up and reload retain progress", async ({ page }, info) => {
  test.setTimeout(180_000); await furnaceProgressRoute(page, info, false);
});
