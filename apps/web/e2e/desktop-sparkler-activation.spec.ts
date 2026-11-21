import { test } from "@playwright/test";
import { sparklerActivationRoute } from "./sparkler-activation";
test("desktop: actual Sparkler full-bag refusal, singleton success, state transfers and cold restore", async ({ page }, info) => {
  test.setTimeout(240_000); await sparklerActivationRoute(page, info, false);
});
