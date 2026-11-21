import { test } from "@playwright/test";
import { glowstoneRoute } from "./glowstone";
test("Mobile: harvest dust ranges, joystick pickup, reconstruct glowstone and reduce ordinary dust", async ({ page }, info) => {
  test.setTimeout(240_000); await glowstoneRoute(page, info, true);
});
