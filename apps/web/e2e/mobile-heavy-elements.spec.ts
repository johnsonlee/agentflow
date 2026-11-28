import { test } from "@playwright/test";
import { constructHeavyElements } from "./heavy-elements";

test("Mobile touch: construct heavy elements, mix an ice bomb, refuse ions, and restore the save", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await constructHeavyElements(page, testInfo, true);
});
