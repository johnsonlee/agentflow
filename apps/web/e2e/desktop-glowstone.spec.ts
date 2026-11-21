import { test } from "@playwright/test";
import { glowstoneRoute } from "./glowstone";
test("PC: harvest natural dust ranges, reconstruct lit glowstone and reduce ordinary dust", async ({ page }, info) => {
  test.setTimeout(240_000); await glowstoneRoute(page, info, false);
});
