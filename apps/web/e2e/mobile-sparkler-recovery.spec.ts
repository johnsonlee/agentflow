import { test } from "@playwright/test";
import { sparklerRecoveryRoute } from "./sparkler-recovery";
test("mobile: actual malformed offhand preserves original through autosave, quit refusal and downloaded backup", async ({ page }, info) => {
  test.setTimeout(240_000); await sparklerRecoveryRoute(page, info, true);
});
