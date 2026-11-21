import { test } from "@playwright/test";
import { worldDropsRoute } from "./world-drops";
test("Mobile: owned cursor drops survive backup/reload and joystick pickup", async ({ page }, info) => {
  test.setTimeout(180_000); await worldDropsRoute(page, info, true);
});
