import { test } from "@playwright/test";
import { dyeRoute } from "./dyes";
test("PC: harvest flowers, mix dyes, dye/place/save wool and correct glow-stick grid", async ({ page }, info) => {
  test.setTimeout(240_000);
  await dyeRoute(page, info, false);
});
