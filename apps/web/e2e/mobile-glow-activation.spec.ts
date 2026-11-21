import { test } from "@playwright/test";
import { glowActivationRoute } from "./glow-activation";
test("Mobile: activate glow singleton through native short tap with atomic full-bag refusal and cold ownership restore", async ({ page }, info) => {
  test.setTimeout(240_000);
  await glowActivationRoute(page, info, true);
});
