import { test } from "@playwright/test";
import { craftingCorrectionsRoute } from "./crafting-corrections";
test("PC: harvest books, craft a proper shelf, smelt both ores and save", async ({ page }, info) => {
  test.setTimeout(240_000); await craftingCorrectionsRoute(page, info, false);
});
