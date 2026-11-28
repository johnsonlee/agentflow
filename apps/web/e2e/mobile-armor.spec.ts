import { test } from "@playwright/test";
import { armorRoute } from "./armor";

test("Mobile: craft, equip, remove, protect, wear and restore armor", async ({ page }, info) => {
  test.setTimeout(180_000);
  await armorRoute(page, info, true);
});
