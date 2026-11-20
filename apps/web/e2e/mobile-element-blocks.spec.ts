import { test } from "@playwright/test";
import { elementBlockRoute } from "./element-blocks";

test("Mobile: construct and place high-ID element cubes, collide, pick, save, harvest and use Agent", async ({ page }, info) => {
  test.setTimeout(300_000);
  await elementBlockRoute(page, info, true);
});
