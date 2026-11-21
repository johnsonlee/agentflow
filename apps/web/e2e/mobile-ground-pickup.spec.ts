import { test } from "@playwright/test";
import { groundPickupLedgeRoute } from "./ground-pickup";
test("Mobile: a narrow dropped item beside a ledge needs a reachable player-body pickup pose", async ({ page }, info) => {
  test.setTimeout(90_000); await groundPickupLedgeRoute(page, info, true);
});
