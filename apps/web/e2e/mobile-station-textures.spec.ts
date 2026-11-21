import { test } from "@playwright/test";
import { stationTexturesRoute } from "./station-textures";
test("Mobile: station-specific top/bottom pack binding, legacy fanout and saved station IDs", async ({ page }, info) => {
  test.setTimeout(300_000); await stationTexturesRoute(page, info, true);
});
