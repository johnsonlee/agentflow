import { test } from "@playwright/test";
import { craftMaterialTools } from "./material-tools";

test("Mobile touch: craft golden and diamond pickaxes and restore them from a save", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await craftMaterialTools(page, testInfo, true);
});
