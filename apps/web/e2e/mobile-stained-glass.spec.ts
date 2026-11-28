import { test } from "@playwright/test";
import { stainedGlassRoute } from "./stained-glass";
test("Mobile: smelt/craft stained glass, see through it, collide, shatter and save", async ({ page }, info) => {
  test.setTimeout(240_000); await stainedGlassRoute(page, info, true);
});
