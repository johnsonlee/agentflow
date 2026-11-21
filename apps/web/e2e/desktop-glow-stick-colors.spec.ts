import { test } from "@playwright/test";
import { glowStickColorsRoute } from "./glow-stick-colors";
test("PC: craft two glow-stick colors, refuse incompatible owners and restore dropped color IDs", async ({ page }, info) => {
  test.setTimeout(240_000);
  await glowStickColorsRoute(page, info, false);
});
