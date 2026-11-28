import { test } from "@playwright/test";
import { netherTravelRoute } from "./nether-travel";
test("mobile: joystick portal entry, Nether Main handoff, return and both cold world owners", async ({ page }, info) => {
  test.setTimeout(480_000); await netherTravelRoute(page, info, true);
});
