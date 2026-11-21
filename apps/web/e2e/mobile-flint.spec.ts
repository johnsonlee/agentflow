import { test } from "@playwright/test";
import { flintRoute } from "./flint";
test("Mobile: genuine natural Gravel Flint, conserved cold owners and first-decision player/Agent retry", async ({ page }, info) => { test.setTimeout(480_000); await flintRoute(page, info, true); });
