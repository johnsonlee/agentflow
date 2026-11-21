import { test } from "@playwright/test";
import { spiderEyePoisonRoute } from "./spider-eye-poison";
test("Mobile: acquire player-kill Spider Eye, hold to eat Poison, pause/cold restore/nonlethal expiry and preserve malformed original", async ({ page }, info) => {
  test.setTimeout(360_000); await spiderEyePoisonRoute(page, info, true);
});
