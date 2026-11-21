import { test } from "@playwright/test";
import { snowballRoute } from "./snowball";
test("Mobile: shovel snow into ground-owned balls, craft a block, reduce and restore materials", async ({ page }, info) => {
  test.setTimeout(240_000); await snowballRoute(page, info, true);
});
