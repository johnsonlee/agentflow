import { test } from "@playwright/test";
import { milkCureRoute } from "./milk-cure";
test("PC: mine/smelt natural iron, craft a Bucket, milk a natural adult Cow and cure genuine Poison with preserved owners", async ({ page }, info) => {
  test.setTimeout(480_000); await milkCureRoute(page, info, false);
});
