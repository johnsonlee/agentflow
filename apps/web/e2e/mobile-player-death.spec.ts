import { test } from "@playwright/test";
import { playerDeathRoute } from "./player-death";
test("Mobile: fatal landing, death recovery, metadata pickup and saved Keep Inventory", async ({ page }, info) => {
  test.setTimeout(240_000); await playerDeathRoute(page, info, true);
});
