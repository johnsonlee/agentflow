import { test } from "@playwright/test";
import { waterDrinkingRoute } from "./water-drinking";
test("PC: fill and hold water, cancel selected-owner progress, return/refill one bottle and leave actual Poison active", async ({ page }, info) => {
  test.setTimeout(240_000); await waterDrinkingRoute(page, info, false);
});
