import { test } from "@playwright/test";
import { glowActivationRoute } from "./glow-activation";
test("PC: activate glow singleton through real use with atomic full-bag refusal and cold ownership restore", async ({ page }, info) => {
  test.setTimeout(240_000);
  await glowActivationRoute(page, info, false);
});
