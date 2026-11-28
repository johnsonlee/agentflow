import { test } from "@playwright/test";
import { spiderEyePoisonRoute } from "./spider-eye-poison";
test("PC: acquire player-kill Spider Eye, eat Poison, pause/cold restore/nonlethal expiry and preserve malformed original", async ({ page }, info) => {
  test.setTimeout(360_000); await spiderEyePoisonRoute(page, info, false);
});
