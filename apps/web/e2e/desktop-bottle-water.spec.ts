import { test } from "@playwright/test";
import { bottleWaterRoute } from "./bottle-water";
test("PC: harvest natural sand and fuel, smelt glass, craft bottles, fill natural water and preserve whole-container owners", async ({ page }, info) => {
  test.setTimeout(420_000); await bottleWaterRoute(page, info, false);
});
