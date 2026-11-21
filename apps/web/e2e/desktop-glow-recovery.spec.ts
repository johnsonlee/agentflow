import { test } from "@playwright/test";
import { glowRecoveryRoute } from "./glow-recovery";
test("PC: malformed saved glow owner preserves original through autosave, quit refusal and actual backup download", async ({ page }, info) => {
  test.setTimeout(240_000);
  await glowRecoveryRoute(page, info, false);
});
