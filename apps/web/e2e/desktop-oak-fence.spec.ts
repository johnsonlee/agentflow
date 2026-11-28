import { test } from "@playwright/test";
import { oakFenceRoute } from "./oak-fence";
test("PC: harvest and craft oak fences, connect, block jumping and retain drop ownership", async ({ page }, info) => {
  test.setTimeout(360_000); await oakFenceRoute(page, info, false);
});
