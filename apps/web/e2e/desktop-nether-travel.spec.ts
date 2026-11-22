import { test } from "@playwright/test";
import { netherTravelRoute } from "./nether-travel";
test("desktop: portal dwell, Nether Main handoff, return and both cold world owners", async ({ page }, info) => {
  test.setTimeout(480_000); await netherTravelRoute(page, info, false);
});
