import { test } from "@playwright/test";
import { resourcePacksRoute } from "./resource-packs";
test("Mobile: local texture chooser, saved world preservation and adaptive pack recovery", async ({ page }, info) => {
  test.setTimeout(240_000); await resourcePacksRoute(page, info, true);
});
