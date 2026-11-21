import { test } from "@playwright/test";
import { spiderStringRoute } from "./spider-string";
test("Mobile: touch Spider combat, provoked save, cached string ownership and four-string wool crafting", async ({ page }, info) => {
  test.setTimeout(420_000);
  await spiderStringRoute(page, info, true);
});
