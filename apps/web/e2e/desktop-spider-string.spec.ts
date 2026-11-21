import { test } from "@playwright/test";
import { spiderStringRoute } from "./spider-string";
test("PC: daylight-neutral Spider, provoked save, cached string ownership and four-string wool crafting", async ({ page }, info) => {
  test.setTimeout(360_000);
  await spiderStringRoute(page, info, false);
});
