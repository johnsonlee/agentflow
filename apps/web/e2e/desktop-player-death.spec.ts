import { test } from "@playwright/test";
import { playerDeathRoute } from "./player-death";
test("PC: death transfers full player ownership once, retries and persists Keep Inventory", async ({ page }, info) => {
  test.setTimeout(240_000); await playerDeathRoute(page, info, false);
});
