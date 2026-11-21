import { test } from "@playwright/test";
import { agentGroundDropsRoute } from "./agent-ground-drops";
test("Mobile: Agent quantity drop and collect, full-bag mob loot persistence", async ({ page }, info) => {
  test.setTimeout(180_000); await agentGroundDropsRoute(page, info, true);
});
