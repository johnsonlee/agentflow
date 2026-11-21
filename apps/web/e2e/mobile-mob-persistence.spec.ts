import { test } from "@playwright/test";
import { mobPersistenceRoute } from "./mob-persistence";
test("Mobile: living mob identities, touch combat and refused death loot survive Continue", async ({ page }, info) => {
  test.setTimeout(240_000); await mobPersistenceRoute(page, info, true);
});
