import { test } from "@playwright/test";
import { worldDropsRoute } from "./world-drops";
test("PC: world drops retain ownership through quota failure, backup, reload and walking pickup", async ({ page }, info) => {
  test.setTimeout(180_000); await worldDropsRoute(page, info, false);
});
