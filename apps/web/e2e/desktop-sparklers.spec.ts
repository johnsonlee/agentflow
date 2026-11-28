import { test } from "@playwright/test";
import { sparklerRoute } from "./sparklers";
test("PC: craft five sparklers, light actual offhand singleton, swap stateful owners and cold restore", async ({ page }, info) => {
  test.setTimeout(240_000); await sparklerRoute(page, info, false);
});
