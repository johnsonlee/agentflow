import { test } from "@playwright/test";
import { mobPersistenceRoute } from "./mob-persistence";
test("PC: all living mob identities and refused death loot survive save and Continue", async ({ page }, info) => {
  test.setTimeout(240_000); await mobPersistenceRoute(page, info, false);
});
