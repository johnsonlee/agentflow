import { test } from "@playwright/test";
import { resourcePacksRoute } from "./resource-packs";
test("PC: local texture chooser, exact16/32 pixels, atomic persistence and original reset", async ({ page }, info) => {
  test.setTimeout(240_000); await resourcePacksRoute(page, info, false);
});
